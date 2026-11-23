// The organisations a wallet manages (owner or admin in account_owners) — for choosing whom a
// mini app belongs to, and for confirming that binding on the spot. Independent of the
// credential register. Two queries instead of an embed (account_owners has several FKs).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ManagedOrg {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  role: "owner" | "admin";
}

export async function orgsManagedBy(wallet: string): Promise<ManagedOrg[]> {
  const db = createAdminClient();
  const { data: owners, error } = await db
    .from("account_owners")
    .select("account_id, role")
    .ilike("wallet_address", wallet)
    .in("role", ["owner", "admin"]);
  if (error || !owners?.length) return [];
  const roleOf = new Map((owners as { account_id: string; role: "owner" | "admin" }[]).map((o) => [o.account_id, o.role]));
  const { data: accounts } = await db
    .from("accounts")
    .select("id, name, avatar_url, account_type")
    .in("id", [...roleOf.keys()])
    .eq("account_type", "organisation");
  return ((accounts ?? []) as { id: string; name: string | null; avatar_url: string | null }[])
    .map((a) => ({ accountId: a.id, name: a.name || "Organisation", avatarUrl: a.avatar_url, role: roleOf.get(a.id)! }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** The wallet's role when it may decide for this org, else null. */
export async function managesOrg(wallet: string, accountId: string): Promise<"owner" | "admin" | null> {
  const org = (await orgsManagedBy(wallet)).find((o) => o.accountId.toLowerCase() === accountId.toLowerCase());
  return org?.role ?? null;
}
