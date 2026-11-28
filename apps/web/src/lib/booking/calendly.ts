// Native booking on top of a seller's Calendly (server only). The token lives in booking_calendly
// (service-role table) and never reaches the app.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const WALLET_RE = /^0x[a-f0-9]{40}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API = "https://api.calendly.com";

export interface SellerConfig {
  seller_wallet: string;
  seller_account_id: string;
  calendly_token: string;
  calendly_user_uri: string;
  auto_reply: string | null;
}

export async function sellerConfig(admin: SupabaseClient, wallet: string): Promise<SellerConfig | null> {
  if (!WALLET_RE.test(wallet)) return null;
  const { data } = await admin.from("booking_calendly")
    .select("seller_wallet, seller_account_id, calendly_token, calendly_user_uri, auto_reply")
    .eq("seller_wallet", wallet).eq("enabled", true).maybeSingle();
  return (data as SellerConfig | null) ?? null;
}

export class CalendlyError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`calendly ${status}`);
  }
}

export async function calendly<T>(token: string, path: string, init?: { method?: string; body?: unknown; query?: Record<string, string> }): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : API + path);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new CalendlyError(res.status, json);
  return json as T;
}

export interface PublicEventType {
  uri: string;
  name: string;
  duration: number;
  description: string | null;
  location_kind: string | null;
  question: string | null;
  scheduling_url: string;
}

type RawEventType = {
  uri: string; name: string; duration: number; active: boolean; description_plain?: string | null; scheduling_url: string;
  locations?: { kind?: string }[] | null; custom_questions?: { name: string; enabled?: boolean; position?: number }[] | null;
};

export async function activeEventTypes(cfg: SellerConfig): Promise<PublicEventType[]> {
  const r = await calendly<{ collection: RawEventType[] }>(cfg.calendly_token, "/event_types", { query: { user: cfg.calendly_user_uri, active: "true" } });
  return r.collection.filter((e) => e.active).map((e) => ({
    uri: e.uri,
    name: e.name,
    duration: e.duration,
    description: e.description_plain ?? null,
    location_kind: e.locations?.[0]?.kind ?? null,
    question: e.custom_questions?.find((q) => q.enabled !== false)?.name ?? null,
    scheduling_url: e.scheduling_url,
  }));
}

/** Free start times over [from, from+days), in chunks of 7 days (Calendly's max range). */
export async function availableTimes(cfg: SellerConfig, eventTypeUri: string, days: number): Promise<{ start_time: string; scheduling_url: string }[]> {
  const out: { start_time: string; scheduling_url: string }[] = [];
  const start = Date.now() + 5 * 60_000;
  for (let off = 0; off < days; off += 7) {
    const s = new Date(start + off * 86_400_000);
    const e = new Date(start + Math.min(off + 7, days) * 86_400_000 - 60_000);
    const r = await calendly<{ collection: { start_time: string; status: string; scheduling_url: string }[] }>(
      cfg.calendly_token, "/event_type_available_times",
      { query: { event_type: eventTypeUri, start_time: s.toISOString(), end_time: e.toISOString() } },
    );
    for (const x of r.collection) if (x.status === "available") out.push({ start_time: x.start_time, scheduling_url: x.scheduling_url });
  }
  return out;
}

/** Finds the invitee that booked `email` at `startTime` (read scope only; used after the Calendly page fallback). */
export async function findBookedInvitee(cfg: SellerConfig, startTime: string, email: string): Promise<{ event: string; invitee: string; end_time: string } | null> {
  const t = new Date(startTime).getTime();
  const r = await calendly<{ collection: { uri: string; start_time: string; end_time: string; status: string }[] }>(
    cfg.calendly_token, "/scheduled_events",
    { query: { user: cfg.calendly_user_uri, min_start_time: new Date(t - 60_000).toISOString(), max_start_time: new Date(t + 60_000).toISOString(), status: "active" } },
  );
  for (const ev of r.collection) {
    const inv = await calendly<{ collection: { uri: string; email: string; status: string }[] }>(
      cfg.calendly_token, `${ev.uri}/invitees`, { query: { email: email.toLowerCase() } },
    );
    const hit = inv.collection.find((i) => i.status === "active" && i.email.toLowerCase() === email.toLowerCase());
    if (hit) return { event: ev.uri, invitee: hit.uri, end_time: ev.end_time };
  }
  return null;
}

/** German auto-reply with {name} {datum} {uhrzeit} filled in. */
export function autoReplyText(template: string | null, name: string, start: Date): string {
  const datum = start.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
  const uhrzeit = start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const first = name.trim().split(/\s+/)[0] || "";
  const t = template ?? "Hallo {name}, danke für deine Buchung! Ich rufe dich am {datum} um {uhrzeit} Uhr an. Überleg dir gern schon, was dein Ziel ist – dann können wir direkt loslegen. Bis bald!";
  return t.replaceAll("{name}", first).replaceAll("{datum}", datum).replaceAll("{uhrzeit}", uhrzeit).slice(0, 600);
}
