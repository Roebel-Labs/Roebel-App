import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgRole = "owner" | "admin" | "member";

/** Role of `wallet` in org `accountId`, via account_owners (addresses may be checksummed → ilike). */
export async function roleInAccount(admin: SupabaseClient, accountId: string, wallet: string): Promise<OrgRole | null> {
  const { data } = await admin
    .from("account_owners")
    .select("role")
    .eq("account_id", accountId)
    .ilike("wallet_address", wallet)
    .maybeSingle();
  const role = data?.role;
  return role === "owner" || role === "admin" || role === "member" ? role : null;
}

export function canManage(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}
