// Live room server helpers: viewer profiles, push, Cloudflare Stream Live (server only).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CHAT_MAX = 280;

/** Public, stable per person per show, not reversible to the wallet (salted with a server secret). */
export function authorKey(showId: string, wallet: string | null | undefined): string | null {
  if (!wallet) return null;
  const salt = process.env.LIVE_TOKEN_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHash("sha256").update(`${showId}:${wallet.toLowerCase()}:${salt}`).digest("hex").slice(0, 16);
}

/** Display name + avatar for a wallet. Never falls back to the address (no wallets on screen). */
export async function viewerProfile(admin: SupabaseClient, wallet: string): Promise<{ display_name: string; avatar_url: string | null }> {
  const { data: u } = await admin.from("users")
    .select("username, profile_picture_url, active_account_id")
    .eq("wallet_address", wallet.toLowerCase()).maybeSingle();
  let name = typeof u?.username === "string" && u.username.trim() && !u.username.startsWith("0x") ? u.username.trim() : "";
  let avatar: string | null = u?.profile_picture_url ?? null;
  if (u?.active_account_id) {
    const { data: acc } = await admin.from("accounts").select("name, avatar_url, account_type")
      .eq("id", u.active_account_id).maybeSingle();
    if (acc && acc.account_type !== "organisation") {
      if (!name && typeof acc.name === "string" && !acc.name.startsWith("0x")) name = acc.name.trim();
      avatar = avatar ?? acc.avatar_url ?? null;
    }
  }
  return { display_name: (name || "Röbeler:in").slice(0, 60), avatar_url: avatar };
}

/** Best-effort push via the send-notification edge function (never throws). */
export async function pushToWallets(wallets: string[], title: string, body: string, data: Record<string, string>): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || wallets.length === 0) return;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ type: "live", walletAddresses: wallets, title: title.slice(0, 60), body: body.slice(0, 140), data }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[live] push", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[live] push failed (non-fatal)", err);
  }
}

// ── Cloudflare Stream Live ───────────────────────────────────────────────────

type CfConfig = { accountId: string; token: string; customerCode: string };

export function cfConfig(): CfConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  const raw = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!accountId || !token || !raw) return null;
  // Accept "xxx", "customer-xxx", "customer-xxx.cloudflarestream.com" or a full URL.
  const customerCode = raw.trim().replace(/^https?:\/\//, "").replace(/^customer-/, "")
    .replace(/\.cloudflarestream\.com.*$/, "").replace(/\/.*$/, "");
  return { accountId, token, customerCode };
}

export function cfHlsUrl(cfg: CfConfig, uid: string): string {
  return `https://customer-${cfg.customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8`;
}

export async function cfApi<T>(cfg: CfConfig, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/stream${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message?: string }[] } | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.errors?.map((e) => e.message).join("; ") || `Cloudflare ${res.status}`);
  }
  return json.result as T;
}

/** Whether OBS is currently pushing into the input (public lifecycle endpoint). */
export async function cfLifecycle(cfg: CfConfig, uid: string): Promise<{ live: boolean; videoUID: string | null } | null> {
  try {
    const res = await fetch(`https://customer-${cfg.customerCode}.cloudflarestream.com/${uid}/lifecycle`, {
      signal: AbortSignal.timeout(8_000), cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { live?: boolean; videoUID?: string | null };
    return { live: !!j.live, videoUID: j.videoUID ?? null };
  } catch {
    return null;
  }
}
