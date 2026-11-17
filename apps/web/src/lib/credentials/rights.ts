// Org rights for the credential register: who may act for an org in the database
// (account_owners: owner or admin) and whether the chain lets them (OrgRegistry + canManage).
// Relative imports only: loaded by `npx tsx --test`.
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { createCredentialRegistryReader, CREDENTIAL_REGISTRY_ABI, type CredentialRegistryReader } from "@netizen-labs/credential-registry";
import { parseAbi, type Address, type Hex, type PublicClient } from "viem";
import type { CredentialStore } from "./store";

export type OrgContext = {
  accountId: string;
  orgId: Hex;
  name: string;
  subType: string | null;
  membersPublicColumn: boolean | null;
  role: "owner" | "admin";
};

/** Spec 5.3: these sub-types start with "Mitglieder dürfen öffentlich sichtbar sein" off. */
export const SENSITIVE_SUB_TYPES = ["fraktion", "stadt"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function orgContextFor(
  store: CredentialStore,
  accountId: string,
  wallet: string,
): Promise<OrgContext | { error: "FORBIDDEN" | "NOT_FOUND" }> {
  if (typeof accountId !== "string" || !UUID.test(accountId)) return { error: "NOT_FOUND" };
  const account = await store.getAccount(accountId);
  if (!account || account.accountType !== "organisation") return { error: "NOT_FOUND" };
  const role = await store.roleOf(accountId, wallet);
  if (role !== "owner" && role !== "admin") return { error: "FORBIDDEN" };
  return {
    accountId,
    orgId: orgIdFromUuid(accountId) as Hex,
    name: account.name,
    subType: account.subType,
    membersPublicColumn: account.membersPublicColumn,
    role,
  };
}

/** Once the chain flag was set (column non-null) the chain decides; before that the sub-type does. */
export function membersMayBePublic(o: { subType: string | null; membersPublicColumn: boolean | null }): boolean {
  return o.membersPublicColumn ?? !(SENSITIVE_SUB_TYPES as readonly (string | null)[]).includes(o.subType);
}

/** A closed org whose chain flag is not set yet: the next membership-type action sets it first. */
export function needsPrivateOnlyStep(o: OrgContext, chainPrivateOnly: boolean): boolean {
  return !membersMayBePublic(o) && !chainPrivateOnly;
}

/** The chain reads chainReadiness needs (a NodeRegistryReader satisfies it). */
export type ChainReadinessReader = {
  isOrgRegistered(orgId: Hex): Promise<boolean>;
  canManage(orgId: Hex, account: Address): Promise<boolean>;
};

export async function chainReadiness(
  reader: ChainReadinessReader,
  o: OrgContext,
  wallet: Address,
): Promise<"ready" | "org_not_registered" | "no_chain_authority"> {
  if (!(await reader.isOrgRegistered(o.orgId))) return "org_not_registered";
  if (!(await reader.canManage(o.orgId, wallet))) return "no_chain_authority";
  return "ready";
}

/** The package reader plus the two node-side reads it lacks. */
export type NodeRegistryReader = CredentialRegistryReader &
  ChainReadinessReader & { orgPrivateOnly(orgId: Hex): Promise<boolean> };

const ORG_SOURCE_ABI = parseAbi(["function isRegistered(bytes32 orgId) view returns (bool)"]);

export function createNodeRegistryReader({ client, address }: { client: PublicClient; address: Address }): NodeRegistryReader {
  const base = createCredentialRegistryReader({ client, address });
  const readRegistry = <T>(functionName: string, args: readonly unknown[]) =>
    client.readContract({ address, abi: CREDENTIAL_REGISTRY_ABI, functionName, args } as never) as Promise<T>;
  return {
    ...base,
    orgPrivateOnly: (orgId) => readRegistry<boolean>("orgPrivateOnly", [orgId]),
    async isOrgRegistered(orgId) {
      // Mirrors the contract's _orgInfo: the register's current OrgRegistry decides. RPC errors
      // propagate: "unreachable" must not read as "not registered".
      const orgRegistry = await readRegistry<Address>("orgRegistry", []);
      return (await client.readContract({ address: orgRegistry, abi: ORG_SOURCE_ABI, functionName: "isRegistered", args: [orgId] })) === true;
    },
  };
}
