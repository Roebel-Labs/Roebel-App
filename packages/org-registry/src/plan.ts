import { deriveOrgIdentity } from "@netizen-labs/nostr";
import { orgIdFromUuid } from "@netizen-labs/protocol";

/**
 * Plan the move of existing organisations (Supabase `accounts` +
 * `account_owners`) onto Safes in the OrgRegistry. Pure: it reads rows and
 * returns a plan; deploying Safes and calling `migrationRegister` are separate,
 * explicitly approved steps.
 *
 * Mapping, chosen for parity with how the app behaves today:
 *   - `owner` rows → Safe owners. Default threshold 1, because today any owner
 *     can act alone; "majority" is available for orgs that hold money.
 *   - `admin` / `member` rows → registry roles set by the Safe.
 *   - The node's derived org key (packages/nostr deriveOrgIdentity) is
 *     authorised at migration, so the publisher keeps signing unchanged. The
 *     org can add its own device keys and revoke the node's at any time.
 */

export interface AccountRow {
  id: string;
  account_type: string;
  sub_type?: string | null;
  name: string;
}

export interface OwnerRow {
  account_id: string;
  wallet_address: string;
  role: string;
}

export type ThresholdPolicy = "parity" | "majority";

export interface PlanOptions {
  threshold?: ThresholdPolicy;
  /** When both are given, each org's node-derived Nostr key is authorised at migration. */
  nodeSecret?: string;
  nodeId?: string;
}

export interface PlannedOrg {
  accountId: string;
  orgId: `0x${string}`;
  name: string;
  type: string;
  safe: { owners: `0x${string}`[]; threshold: number };
  roles: { account: `0x${string}`; role: "admin" | "member" }[];
  nodeNostrPubkey: string | null;
}

export interface SkippedOrg {
  accountId: string;
  name: string;
  reason: "not_an_organisation" | "no_owner" | "bad_id";
}

export interface MigrationPlan {
  orgs: PlannedOrg[];
  skipped: SkippedOrg[];
  /** Wallet rows that could not be used (malformed address). */
  invalidWallets: { accountId: string; wallet: string }[];
}

const ADDRESS = /^0x[0-9a-f]{40}$/;

export function thresholdFor(owners: number, policy: ThresholdPolicy): number {
  if (owners < 1) throw new Error("a Safe needs at least one owner");
  return policy === "majority" ? Math.floor(owners / 2) + 1 : 1;
}

export function planOrgMigration(
  accounts: readonly AccountRow[],
  owners: readonly OwnerRow[],
  options: PlanOptions = {},
): MigrationPlan {
  const policy = options.threshold ?? "parity";
  const byAccount = new Map<string, OwnerRow[]>();
  for (const row of owners) {
    const list = byAccount.get(row.account_id) ?? [];
    list.push(row);
    byAccount.set(row.account_id, list);
  }

  const plan: MigrationPlan = { orgs: [], skipped: [], invalidWallets: [] };

  for (const account of accounts) {
    if (account.account_type !== "organisation") {
      plan.skipped.push({ accountId: account.id, name: account.name, reason: "not_an_organisation" });
      continue;
    }
    let orgId: `0x${string}`;
    try {
      orgId = orgIdFromUuid(account.id);
    } catch {
      plan.skipped.push({ accountId: account.id, name: account.name, reason: "bad_id" });
      continue;
    }

    const safeOwners = new Set<`0x${string}`>();
    const roles = new Map<`0x${string}`, "admin" | "member">();
    for (const row of byAccount.get(account.id) ?? []) {
      const wallet = row.wallet_address.trim().toLowerCase();
      if (!ADDRESS.test(wallet)) {
        plan.invalidWallets.push({ accountId: account.id, wallet: row.wallet_address });
        continue;
      }
      const w = wallet as `0x${string}`;
      if (row.role === "owner") safeOwners.add(w);
      else if (row.role === "admin") roles.set(w, "admin");
      else if (row.role === "member" && roles.get(w) !== "admin") roles.set(w, "member");
    }
    // An owner needs no role: ownership is read live from the Safe.
    for (const o of safeOwners) roles.delete(o);

    if (safeOwners.size === 0) {
      plan.skipped.push({ accountId: account.id, name: account.name, reason: "no_owner" });
      continue;
    }

    const ownerList = [...safeOwners].sort();
    const nodeNostrPubkey =
      options.nodeSecret && options.nodeId
        ? deriveOrgIdentity(options.nodeSecret, options.nodeId, account.id.toLowerCase()).publicKey
        : null;

    plan.orgs.push({
      accountId: account.id,
      orgId,
      name: account.name,
      type: account.sub_type ?? "organisation",
      safe: { owners: ownerList, threshold: thresholdFor(ownerList.length, policy) },
      roles: [...roles].map(([account, role]) => ({ account, role })).sort((a, b) => a.account.localeCompare(b.account)),
      nodeNostrPubkey,
    });
  }
  return plan;
}
