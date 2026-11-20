// Phone and mail channels of the assistant: link a phone with a one-time code,
// run a turn for an inbound message and return the answer as plain text.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { QUOTA_MESSAGE, runUserTurn } from "../runtime";
import * as store from "../store";
import type { ChatStreamEvent } from "../types";
import { agentBot, getAgentProfile, patchProfileRaw } from "./profile";
import type { Channel } from "./profile";

export type PhoneKind = "sms" | "whatsapp";
export interface ChannelRow { id: string; wallet: string; kind: PhoneKind; address: string; thread_id: string | null; verified_at: string }

const CODE_TTL_MS = 15 * 60_000;
export const MAX_PHONE_CHANNELS = 4;

// ---- provider configuration (Twilio carries both SMS and WhatsApp) -------------------

export const twilioEnabled = (): boolean => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
/** The number people text, E.164 ("+4915…"), per channel; null = channel off. */
export function channelNumber(kind: PhoneKind): string | null {
  if (!twilioEnabled()) return null;
  const raw = (kind === "sms" ? process.env.TWILIO_SMS_FROM : process.env.TWILIO_WHATSAPP_FROM) ?? "";
  const n = raw.replace(/^whatsapp:/, "").trim();
  return /^\+[1-9]\d{6,14}$/.test(n) ? n : null;
}

/** Twilio request signature: HMAC-SHA1 over the URL plus the sorted form fields. */
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = Buffer.from(createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64"));
  const got = Buffer.from(signature);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Splits an answer into message-sized pieces at paragraph or sentence ends. */
export function splitForPhone(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ") + 1);
    const at = cut > max * 0.4 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out.slice(0, 6);
}

export async function sendPhoneText(kind: PhoneKind, to: string, body: string): Promise<boolean> {
  const from = channelNumber(kind);
  if (!from) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  let ok = true;
  for (const piece of splitForPhone(body, kind === "sms" ? 640 : 1500)) {
    const form = new URLSearchParams({
      From: kind === "whatsapp" ? `whatsapp:${from}` : from, To: kind === "whatsapp" ? `whatsapp:${to}` : to, Body: piece,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST", body: form,
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) { ok = false; console.error("[chat/agent/channels] twilio send failed", res.status, (await res.text().catch(() => "")).slice(0, 300)); }
  }
  return ok;
}

// ---- linking -------------------------------------------------------------------------

export async function listChannels(wallet: string): Promise<ChannelRow[]> {
  const res = await store.db().from("chat_channels").select("*").eq("wallet", wallet).order("verified_at");
  if (res.error) throw new Error(`[chat/agent] channels: ${res.error.message}`);
  return res.data as ChannelRow[];
}

export async function deleteChannel(wallet: string, id: string): Promise<boolean> {
  if (!store.isUuid(id)) return false;
  const res = await store.db().from("chat_channels").delete().eq("wallet", wallet).eq("id", id).select("id");
  return !res.error && (res.data ?? []).length > 0;
}

export async function channelByAddress(kind: PhoneKind, address: string): Promise<ChannelRow | null> {
  const res = await store.db().from("chat_channels").select("*").eq("kind", kind).eq("address", address).maybeSingle();
  return (res.data as ChannelRow | null) ?? null;
}

/** A fresh six-digit code for this wallet and channel (older ones of the same kind are dropped). */
export async function createCode(wallet: string, kind: Channel, address: string | null = null): Promise<{ code: string; expiresAt: string }> {
  await store.db().from("chat_channel_codes").delete().eq("wallet", wallet).eq("kind", kind);
  await store.db().from("chat_channel_codes").delete().lt("expires_at", new Date().toISOString());
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(100_000, 1_000_000));
    const res = await store.db().from("chat_channel_codes").insert({ code, wallet, kind, address, expires_at: expiresAt });
    if (!res.error) return { code, expiresAt };
  }
  throw new Error("[chat/agent] could not create a code");
}

/** Consumes a code if it exists, matches the kind and has not expired. */
export async function redeemCode(code: string, kind: Channel): Promise<{ wallet: string; address: string | null } | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const res = await store.db().from("chat_channel_codes").delete().eq("code", code).eq("kind", kind)
    .gt("expires_at", new Date().toISOString()).select("wallet, address");
  const row = (res.data ?? [])[0] as { wallet: string; address: string | null } | undefined;
  return row ?? null;
}

/** Binds a phone to a wallet (a number belongs to one person at a time: the newest link wins). */
export async function linkPhone(wallet: string, kind: PhoneKind, address: string): Promise<ChannelRow> {
  await store.db().from("chat_channels").delete().eq("kind", kind).eq("address", address);
  const res = await store.db().from("chat_channels").insert({ wallet, kind, address }).select("*").single();
  if (res.error) throw new Error(`[chat/agent] link phone: ${res.error.message}`);
  return res.data as ChannelRow;
}

/** True the first time a provider message id is seen. */
export async function firstSight(id: string): Promise<boolean> {
  const res = await store.db().from("chat_inbound_seen").insert({ id: id.slice(0, 200) });
  return !res.error;
}

// ---- one inbound turn ----------------------------------------------------------------

const TOPICS: Record<Channel, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "E-Mail" };

async function ensureThread(wallet: string, channel: Channel, current: string | null, save: (id: string) => Promise<void>) {
  const existing = current ? await store.getThread(wallet, current) : null;
  if (existing) return existing;
  const bot = await agentBot(await getAgentProfile(wallet));
  const thread = await store.createThread(wallet, [bot]);
  await store.setThreadTopic(thread.id, TOPICS[channel]);
  await save(thread.id);
  return thread;
}

/**
 * Runs the assistant on a message that arrived outside the app and returns its answer
 * as text. The exchange is stored in one thread per channel, so it shows up in Ortis.
 */
export async function runChannelTurn(opts: { wallet: string; channel: Channel; text: string; phone?: ChannelRow }): Promise<string> {
  const { wallet, channel } = opts;
  const thread = channel === "email"
    ? await ensureThread(wallet, channel, (await getAgentProfile(wallet)).mail_thread_id, (id) => patchProfileRaw(wallet, { mail_thread_id: id }))
    : await ensureThread(wallet, channel, opts.phone?.thread_id ?? null, async (id) => {
      await store.db().from("chat_channels").update({ thread_id: id }).eq("id", opts.phone!.id);
    });
  const texts: string[] = [];
  let failure: string | null = null;
  const emit = (e: ChatStreamEvent) => {
    if (e.event === "bot_done") for (const p of e.data.message.parts) if (p.type === "text") texts.push(p.text);
    if (e.event === "error") failure = e.data.code === "quota" ? QUOTA_MESSAGE : "Da ist gerade etwas schiefgelaufen. Versuch es bitte gleich noch einmal.";
  };
  await runUserTurn({ wallet, thread, input: { text: opts.text }, emit, channel });
  return texts.join("\n\n").trim() || failure || "Dazu fällt mir gerade nichts ein. Magst du es anders formulieren?";
}
