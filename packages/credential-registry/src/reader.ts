import type { Address, Hex, PublicClient } from "viem";
import { CREDENTIAL_REGISTRY_ABI, REGISTER_EVENTS } from "./abi";
import { leafToTuple, type Leaf } from "./leaf";
import {
  replayRegisterEvents,
  toTypeConfig,
  type RegisterLog,
  type RegisterState,
  type TypeEntry,
  type TypeKind,
  type TypePolicy,
} from "./replay";

export type LeafCheckStatus = "invalid" | "valid" | "expired" | "revoked" | "inactive";
const STATUSES: LeafCheckStatus[] = ["invalid", "valid", "expired", "revoked", "inactive"];
const KINDS: TypeKind[] = ["role", "membership", "badge"];
const POLICIES: TypePolicy[] = ["issuerBatch", "selfClaim", "external"];
const ZERO = "0x0000000000000000000000000000000000000000";

export interface CredentialRegistryReader {
  holds(typeId: Hex, account: Address): Promise<boolean>;
  /** One multicall, results in input order. */
  holdsMany(typeIds: readonly Hex[], account: Address): Promise<boolean[]>;
  /** null when the type does not exist. `delegates` is empty: read them from the replay.
   *  `orgRegistry` is read from `typeRegistryOf` (null for COMMUNITY types). */
  getType(typeId: Hex): Promise<TypeEntry | null>;
  checkLeaf(
    batchId: bigint,
    leaf: Leaf,
    proof: readonly Hex[],
  ): Promise<{ status: LeafCheckStatus; boundTo: Address | null }>;
  canIssue(typeId: Hex, account: Address): Promise<boolean>;
  canManage(orgId: Hex, account: Address): Promise<boolean>;
  /** Full register from logs, deploy block to head. Chunked for public RPCs. */
  loadRegister(fromBlock: bigint, opts?: { chunk?: bigint; toBlock?: bigint }): Promise<RegisterState>;
}

export function createCredentialRegistryReader({
  client,
  address,
}: {
  client: PublicClient;
  address: Address;
}): CredentialRegistryReader {
  const read = <T>(functionName: string, args: readonly unknown[]) =>
    client.readContract({ address, abi: CREDENTIAL_REGISTRY_ABI, functionName, args } as never) as Promise<T>;

  return {
    holds: (typeId, account) => read<boolean>("holds", [typeId, account]),

    async holdsMany(typeIds, account) {
      if (typeIds.length === 0) return [];
      const res = (await client.multicall({
        contracts: typeIds.map((typeId) => ({
          address,
          abi: CREDENTIAL_REGISTRY_ABI,
          functionName: "holds",
          args: [typeId, account],
        })),
        allowFailure: true,
      } as never)) as unknown as Array<{ status: string; result?: unknown }>;
      return res.map((r) => r.status === "success" && r.result === true);
    },

    async getType(typeId) {
      let t: any;
      try {
        t = await read<any>("getType", [typeId]);
      } catch (e) {
        if (/UnknownType/.test(String((e as Error)?.message ?? e))) return null;
        throw e;
      }
      const reg = await read<Address>("typeRegistryOf", [typeId]);
      return {
        typeId,
        orgId: t.orgId,
        localId: t.localId,
        kind: KINDS[Number(t.kind)],
        policy: POLICIES[Number(t.policy)],
        orgGeneration: BigInt(t.orgGeneration),
        orgRegistry: reg.toLowerCase() === ZERO ? null : (reg.toLowerCase() as Address),
        recognised: Boolean(t.recognised),
        retired: Boolean(t.retired),
        config: toTypeConfig(t.config),
        delegates: new Set(),
      };
    },

    async checkLeaf(batchId, leaf, proof) {
      const [status, boundTo] = await read<readonly [number, Address]>("checkLeaf", [
        batchId,
        leafToTuple(leaf),
        proof,
      ]);
      return {
        status: STATUSES[Number(status)],
        boundTo: boundTo.toLowerCase() === ZERO ? null : boundTo,
      };
    },

    canIssue: (typeId, account) => read<boolean>("canIssue", [typeId, account]),
    canManage: (orgId, account) => read<boolean>("canManage", [orgId, account]),

    async loadRegister(fromBlock, opts = {}) {
      const chunk = opts.chunk ?? 50_000n;
      if (chunk <= 0n) throw new Error("loadRegister: chunk must be > 0");
      const head = opts.toBlock ?? (await client.getBlockNumber());
      const logs: RegisterLog[] = [];
      const events = CREDENTIAL_REGISTRY_ABI.filter(
        (e) => e.type === "event" && (REGISTER_EVENTS as readonly string[]).includes(e.name),
      );
      for (let from = fromBlock; from <= head; from += chunk) {
        const to = from + chunk - 1n > head ? head : from + chunk - 1n;
        const batch = await client.getLogs({ address, events: events as never, fromBlock: from, toBlock: to });
        for (const l of batch as unknown as Array<{
          eventName: RegisterLog["eventName"];
          args: Record<string, unknown>;
          blockNumber: bigint;
          logIndex: number;
        }>) {
          logs.push({ eventName: l.eventName, args: l.args, blockNumber: l.blockNumber, logIndex: l.logIndex });
        }
      }
      return replayRegisterEvents(logs);
    },
  };
}
