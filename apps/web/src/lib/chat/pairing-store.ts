// Server side of device pairing: Supabase rows + approver resolution. Pure helpers live in pairing.ts.
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, verifySessionToken } from "@/lib/chat/session";
import { SESSION_COOKIE } from "@/lib/workspace/context";
import { createSessionStore } from "@/lib/workspace/session-store";
import type { PairingRow } from "./pairing";

const COLUMNS = "id, code, device_name, status, wallet, expires_at";

export function pairingsTable() {
  return createAdminClient().from("chat_device_pairings");
}

/** Newest live row for a code (codes repeat only after expiry). */
export async function findByCode(code: string): Promise<PairingRow | null> {
  const { data, error } = await pairingsTable()
    .select(COLUMNS)
    .eq("code", code)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}

export async function findByPollHash(pollHash: string): Promise<PairingRow | null> {
  const { data, error } = await pairingsTable().select(COLUMNS).eq("poll_hash", pollHash).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}

export type Approver = { wallet: string; via: "app" | "ortis_id" };

/**
 * Who is approving: the Röbel app sends its chat session as Bearer; the browser page relies on the
 * Ortis ID workspace session cookie (sub = smart-account address). Never both, never neither.
 */
export async function resolveApprover(request: Request): Promise<Approver | null> {
  const bearer = bearerToken(request.headers.get("authorization"));
  if (bearer) {
    const wallet = await verifySessionToken(bearer);
    return wallet ? { wallet, via: "app" } : null;
  }
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const session = await createSessionStore().get(sid);
  const sub = session?.sub?.toLowerCase() ?? "";
  return /^0x[a-f0-9]{40}$/.test(sub) ? { wallet: sub, via: "ortis_id" } : null;
}
