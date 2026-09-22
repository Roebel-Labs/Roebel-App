// Actor resolution for the poster API routes: admin dashboard cookie, or a
// wallet that owns the given account (same weak pattern as api/mecky/story-draft;
// signed requests are a follow-up).
import { isAuthenticated } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type Actor =
  | { requestedBy: "admin" }
  | { requestedBy: "org" | "submitter"; accountId: string; wallet: string };

export async function resolveActor(
  req: Request,
  body: { accountId?: string; wallet?: string },
  kind: "org" | "submitter",
): Promise<Actor | null> {
  if (await isAuthenticated()) return { requestedBy: "admin" };
  const wallet = (req.headers.get("x-wallet-address") || body.wallet || "").trim().toLowerCase();
  const accountId = (body.accountId || "").trim();
  if (!wallet || !accountId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("account_owners")
    .select("role")
    .eq("account_id", accountId)
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (!data) return null;
  return { requestedBy: kind, accountId, wallet };
}

export async function accountOwnsEvent(accountId: string, eventId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("events").select("account_id").eq("id", eventId).maybeSingle();
  return !!data && data.account_id === accountId;
}
