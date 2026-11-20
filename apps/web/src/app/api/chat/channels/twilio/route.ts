// Inbound SMS and WhatsApp (Twilio sends both to this URL as a signed form post).
// Answers go out through the REST API after the response, so a slow model run can
// never time the webhook out.
import { after } from "next/server";
import {
  channelByAddress, firstSight, linkPhone, redeemCode, runChannelTurn, sendPhoneText, validTwilioSignature,
} from "@/lib/chat/agent/channels";
import type { PhoneKind } from "@/lib/chat/agent/channels";
import { agentBot, getAgentProfile } from "@/lib/chat/agent/profile";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const EMPTY = new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { headers: { "Content-Type": "text/xml" } });

/** Every URL this request may have been signed for (proxy host first). */
function candidateUrls(request: Request): string[] {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const path = `${url.pathname}${url.search}`;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return [...new Set([`https://${host}${path}`, base ? `${base}${path}` : "", request.url].filter(Boolean))];
}

export async function POST(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("not configured", { status: 503 });
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!candidateUrls(request).some((u) => validTwilioSignature(token, u, params, signature))) return new Response("bad signature", { status: 403 });

  const rawFrom = params.From ?? "";
  const kind: PhoneKind = rawFrom.startsWith("whatsapp:") ? "whatsapp" : "sms";
  const from = rawFrom.replace(/^whatsapp:/, "");
  const body = (params.Body ?? "").trim();
  if (!/^\+[1-9]\d{6,14}$/.test(from) || !params.MessageSid) return EMPTY;
  if (!(await firstSight(`twilio:${params.MessageSid}`))) return EMPTY;

  after(async () => {
    try {
      // 1. A linking code from the app binds this phone to its person.
      const code = /^\D*(\d{6})\D*$/.exec(body)?.[1];
      const linked = code ? await redeemCode(code, kind) : null;
      if (linked) {
        await linkPhone(linked.wallet, kind, from);
        const profile = await getAgentProfile(linked.wallet);
        const name = profile.name || (await agentBot(profile)).name;
        await sendPhoneText(kind, from, `Hallo, hier ist ${name}. Dein Telefon ist jetzt verbunden: Schreib mir einfach, wenn ich etwas für dich erledigen, nachschauen oder vorbereiten soll.`);
        return;
      }
      // 2. A known phone: run the assistant.
      const channel = await channelByAddress(kind, from);
      if (!channel) {
        await sendPhoneText(kind, from, "Diese Nummer ist noch mit keinem Ortis-Konto verbunden. Öffne Ortis, geh zu deinem Assistenten und wähl dort „Telefon verbinden“.");
        return;
      }
      if (!body) {
        await sendPhoneText(kind, from, "Bilder und Sprachnachrichten kann ich hier noch nicht verarbeiten. Schreib mir bitte als Text.");
        return;
      }
      const answer = await runChannelTurn({ wallet: channel.wallet, channel: kind, text: body.slice(0, 4000), phone: channel });
      await sendPhoneText(kind, from, answer);
    } catch (err) {
      console.error("[api/chat/channels/twilio]", err);
      await sendPhoneText(kind, from, "Da ist gerade etwas schiefgelaufen. Versuch es bitte gleich noch einmal.").catch(() => {});
    }
  });
  return EMPTY;
}
