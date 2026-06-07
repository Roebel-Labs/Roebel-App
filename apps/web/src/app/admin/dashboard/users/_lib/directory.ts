/**
 * Pure helpers that turn the admin user rows + org rows into lookup maps the
 * on-chain client panels (attesters, verification requests) use to resolve raw
 * wallet addresses into human names and org memberships.
 *
 * All maps are keyed by LOWERCASED wallet address — on-chain addresses come back
 * checksummed, `account_owners.wallet_address` is stored lowercase, and
 * `users.wallet_address` may be checksummed, so lowercasing both sides is the
 * only reliable join key.
 */

import type { AdminUserRow } from "@/app/actions/users-admin";
import type { AdminOrgRow } from "@/app/actions/orgs-admin";
import { formatWalletAddress } from "@/lib/user-types";
import type { OrgRole, OrgSubType } from "@/types/account";

export interface DirectoryEntry {
  name: string;
  avatar: string | null;
  username: string | null;
}

/** wallet (lowercase) → display info. */
export type Directory = Record<string, DirectoryEntry>;

export interface OrgRef {
  id: string;
  name: string;
  subType: OrgSubType | null;
  role: OrgRole;
}

/** wallet (lowercase) → the orgs that wallet belongs to. */
export type MembershipByWallet = Record<string, OrgRef[]>;

/** Build a wallet→name/avatar directory from the admin user rows. */
export function buildDirectory(rows: AdminUserRow[]): Directory {
  const dir: Directory = {};
  for (const r of rows) {
    const key = r.wallet_address.toLowerCase();
    dir[key] = {
      name:
        r.username ||
        r.display_name ||
        formatWalletAddress(r.wallet_address),
      avatar: r.profile_picture_url ?? null,
      username: r.username ?? null,
    };
  }
  return dir;
}

/** Resolve a (possibly checksummed) address to a human name, falling back to the short address. */
export function resolveName(dir: Directory, address: string): string {
  return dir[address.toLowerCase()]?.name ?? formatWalletAddress(address);
}

/** Look up the full directory entry (or undefined when the wallet has no profile). */
export function resolveEntry(
  dir: Directory,
  address: string
): DirectoryEntry | undefined {
  return dir[address.toLowerCase()];
}

/** Build a wallet→orgs membership map from the admin org rows. */
export function buildMembershipByWallet(
  orgs: AdminOrgRow[]
): MembershipByWallet {
  const map: MembershipByWallet = {};
  for (const org of orgs) {
    for (const member of org.members) {
      const key = member.wallet_address.toLowerCase();
      (map[key] ??= []).push({
        id: org.id,
        name: org.name,
        subType: org.sub_type,
        role: member.role,
      });
    }
  }
  return map;
}
