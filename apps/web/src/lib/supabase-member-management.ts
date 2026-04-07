/**
 * Member management queries — mirrors apps/expo/lib/supabase-member-management.ts
 */

import { supabase } from "./supabase";
import { fetchAccountOwners, removeOwner } from "./supabase-accounts";
import type { MemberWithProfile } from "@/types/account";

/** Fetch all members of an account with their user profiles. */
export async function fetchMembersWithProfiles(
  accountId: string
): Promise<MemberWithProfile[]> {
  const { data, error } = await supabase
    .from("account_owners")
    .select("*")
    .eq("account_id", accountId)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("fetchMembersWithProfiles error:", error);
    return [];
  }

  const owners = data as Array<{
    account_id: string;
    wallet_address: string;
    role: "owner" | "admin" | "member";
    invited_by: string | null;
    joined_at: string;
  }>;

  const enriched: MemberWithProfile[] = await Promise.all(
    owners.map(async (owner) => {
      const { data: userData } = await supabase
        .from("users")
        .select("username, profile_picture_url, tier")
        .eq("wallet_address", owner.wallet_address)
        .maybeSingle();

      return {
        ...owner,
        user: userData || {
          username: null,
          profile_picture_url: null,
          tier: "guest" as const,
        },
      } as MemberWithProfile;
    })
  );

  return enriched;
}

/** Remove a member from an org (owner-only action). */
export async function removeMember(
  accountId: string,
  walletAddress: string
): Promise<void> {
  await removeOwner(accountId, walletAddress);
}

/** Leave an org voluntarily. Blocks if sole owner. */
export async function leaveOrg(
  accountId: string,
  walletAddress: string
): Promise<void> {
  const owners = await fetchAccountOwners(accountId);
  const ownerCount = owners.filter((o) => o.role === "owner").length;
  const myRole = owners.find(
    (o) => o.wallet_address === walletAddress.toLowerCase()
  )?.role;

  if (myRole === "owner" && ownerCount <= 1) {
    throw new Error(
      "Du bist der einzige Inhaber. Übertrage die Inhaberschaft, bevor du die Organisation verlässt."
    );
  }

  const { error } = await supabase
    .from("account_owners")
    .delete()
    .eq("account_id", accountId)
    .eq("wallet_address", walletAddress.toLowerCase());

  if (error) throw error;
}

/** Search users by name for the invite flow (excludes existing members). */
export async function searchUsersForInvite(
  query: string,
  excludeWallets: string[]
): Promise<
  Array<{
    wallet_address: string;
    username: string | null;
    profile_picture_url: string | null;
    tier: string;
  }>
> {
  if (!query || query.length < 2) return [];

  const { data, error } = await supabase
    .from("users")
    .select("wallet_address, username, profile_picture_url, tier")
    .not("username", "is", null)
    .ilike("username", `%${query}%`)
    .limit(20);

  if (error) return [];

  const normalizedExclude = new Set(
    excludeWallets.map((w) => w.toLowerCase())
  );

  return (data || []).filter(
    (u: any) => !normalizedExclude.has(u.wallet_address?.toLowerCase())
  );
}
