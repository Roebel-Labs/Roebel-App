// The assistant's own mailbox: <alias>@<ORTIS_MAIL_DOMAIN>. It writes ONLY to the
// person's verified address and answers ONLY mail from that address.
// Off until both RESEND_API_KEY and ORTIS_MAIL_DOMAIN are set (the domain must be
// verified for sending and receiving at the mail provider).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChatMessage } from "../types";
import { agentBot, findProfile, getAgentProfile, patchProfileRaw } from "./profile";
import type { AgentProfileRow } from "./profile";

const API = "https://api.resend.com";

export const mailDomain = (): string | null => (process.env.ORTIS_MAIL_DOMAIN ?? "").trim().toLowerCase() || null;
export const mailEnabled = (): boolean => Boolean(process.env.RESEND_API_KEY && mailDomain());
export const agentAddress = (profile: Pick<AgentProfileRow, "mail_alias">): string | null =>
  profile.mail_alias && mailDomain() ? `${profile.mail_alias}@${mailDomain()}` : null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markdown as the assistant writes it → plain text (wiki links lose their target, citations go). */
export function mailText(md: string): string {
  return md
    .replace(/\[\[\d+\]\]/g, "")
    .replace(/\[([^\]]+)\]\(wiki:[^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

/** A small, safe Markdown subset → HTML (paragraphs, headings, lists, bold, links). */
export function mailHtml(md: string): string {
  const inline = (t: string) => esc(t)
    .replace(/\[\[\d+\]\]/g, "")
    .replace(/\[([^\]]+)\]\(wiki:[^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#2f6f5e">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul style="margin:0 0 14px;padding-left:20px">${list.join("")}</ul>`); list = []; } };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const li = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (li) { list.push(`<li style="margin:0 0 6px">${inline(li[1])}</li>`); continue; }
    flush();
    if (!line.trim()) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) out.push(`<p style="margin:18px 0 8px;font-weight:600;font-size:${h[1].length <= 2 ? 17 : 15}px">${inline(h[2])}</p>`);
    else out.push(`<p style="margin:0 0 14px">${inline(line)}</p>`);
  }
  flush();
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a16;max-width:620px">${out.join("")}</div>`;
}

async function resendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
}

export interface MailFooter { name: string; address: string }

const siteOrigin = (): string => (process.env.NEXT_PUBLIC_SITE_URL || "https://www.roebel.app").replace(/\/$/, "");

/** The assistant's signature, like a colleague's: picture, name, and what you can do from here. */
export function footerHtml(f: MailFooter): string {
  const site = siteOrigin();
  const link = (href: string, text: string) => `<a href="${esc(href)}" style="color:#2f6f5e;text-decoration:none">${esc(text)}</a>`;
  const feedback = `mailto:${f.address}?subject=${encodeURIComponent(`Feedback zu ${f.name}`)}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #e7e6e1;padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"><tr>`
    + `<td style="vertical-align:top;padding-right:12px"><img src="${site}/mascot/mecky-mail.png" width="44" height="44" alt="${esc(f.name)}" style="display:block;border-radius:9px"></td>`
    + `<td style="vertical-align:top;font-size:13px;line-height:1.5;color:#737267"><div style="font-size:15px;font-weight:600;color:#1a1a16">${esc(f.name)}</div>`
    + `Antworte hier, um zu schreiben · ${link(`${site}/ortis/open`, "In Ortis öffnen")} · ${link(feedback, "Feedback senden")}</td></tr></table>`;
}

export function footerText(f: MailFooter): string {
  return `\n\n--\n${f.name}\nAntworte hier, um zu schreiben · In Ortis öffnen: ${siteOrigin()}/ortis/open`;
}

/** Low level send. `to` must already be decided by the caller. */
export async function sendMail(input: {
  fromName: string; fromAddress: string; to: string; subject: string; markdown: string; inReplyTo?: string | null; references?: string | null;
  footer?: MailFooter | null;
}): Promise<boolean> {
  if (!mailEnabled()) return false;
  const headers: Record<string, string> = {};
  if (input.inReplyTo) { headers["In-Reply-To"] = input.inReplyTo; headers.References = input.references || input.inReplyTo; }
  const res = await resendFetch("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: `${input.fromName.replace(/[<>"]/g, "")} <${input.fromAddress}>`, to: [input.to], subject: input.subject.slice(0, 160),
      text: mailText(input.markdown) + (input.footer ? footerText(input.footer) : ""),
      html: mailHtml(input.markdown).replace(/<\/div>$/, `${input.footer ? footerHtml(input.footer) : ""}</div>`),
      reply_to: input.fromAddress,
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });
  if (!res.ok) console.error("[chat/agent/mail] send failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
  return res.ok;
}

/** Mail from the assistant to its person. False when mail is off or no verified address exists. */
export async function sendAgentMail(wallet: string, input: { subject: string; markdown: string; inReplyTo?: string | null; references?: string | null }): Promise<boolean> {
  if (!mailEnabled()) return false;
  const profile = await getAgentProfile(wallet);
  const from = agentAddress(profile);
  if (!from || !profile.owner_email || !profile.owner_email_verified_at) return false;
  const bot = await agentBot(profile);
  const name = profile.name || bot.name;
  return sendMail({ fromName: name, fromAddress: from, to: profile.owner_email, footer: { name, address: from }, ...input });
}

const textOf = (messages: ChatMessage[]): string =>
  messages.flatMap((m) => m.parts.flatMap((p) => (p.type === "text" ? [p.text] : []))).join("\n\n").trim();

const APP_HINT = "";

/** After a routine posted into its thread: the same text by mail, when the person turned that on. */
export async function mailRoutineResult(wallet: string, title: string, messages: ChatMessage[]): Promise<boolean> {
  if (!mailEnabled()) return false;
  const profile = await findProfile(wallet);
  if (!profile?.email_routines) return false;
  const body = textOf(messages);
  if (!body) return false;
  return sendAgentMail(wallet, { subject: title, markdown: `${body}${APP_HINT}` });
}

function berlinDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

/**
 * After a wiki build: once, "I've got to know you"; afterwards at most one briefing
 * mail per day, and only when there is something to say.
 */
export async function mailAfterWikiBuild(wallet: string, input: {
  firstBuild: boolean; firstName: string | null; briefing: { label: string; text: string }[];
  suggestions: { title: string; reason: string }[]; learned: string | null;
}, now: Date = new Date()): Promise<"welcome" | "briefing" | null> {
  if (!mailEnabled()) return null;
  const profile = await findProfile(wallet);
  if (!profile?.owner_email || !profile.owner_email_verified_at) return null;
  const hello = input.firstName ? `Hallo ${input.firstName},` : "Hallo,";
  const offers = input.suggestions.slice(0, 5).map((s) => `- **${s.title}**${s.reason ? `: ${s.reason}` : ""}`).join("\n");
  if (!profile.welcomed_at) {
    const md = [
      hello,
      "ich habe mich eingearbeitet: wie du schreibst, mit wem du zu tun hast und was gerade bei dir anliegt. So kann ich Antworten in deinem Ton vorbereiten und dich auf das hinweisen, was zählt.",
      input.learned ? input.learned : "",
      offers ? `## Damit kann ich sofort loslegen\n${offers}` : "",
      "Was ich über dich weiß, steht in deinem Wiki in Ortis. Dort kannst du alles korrigieren oder löschen.",
    ].filter(Boolean).join("\n\n");
    const ok = await sendAgentMail(wallet, { subject: "Ich habe mich eingearbeitet", markdown: `${md}${APP_HINT}` });
    if (ok) await patchProfileRaw(wallet, { welcomed_at: now.toISOString(), last_briefing_mail_on: berlinDay(now) });
    return ok ? "welcome" : null;
  }
  if (!profile.email_briefing || !input.briefing.length) return null;
  const day = berlinDay(now);
  if (profile.last_briefing_mail_on === day) return null;
  const md = [
    hello,
    input.briefing.map((b) => `- **${b.label}:** ${b.text}`).join("\n"),
    offers ? `## Dabei kann ich dir heute helfen\n${offers}` : "",
  ].filter(Boolean).join("\n\n");
  const ok = await sendAgentMail(wallet, { subject: `Dein Tag: ${input.briefing[0].label}`, markdown: `${md}${APP_HINT}` });
  if (ok) await patchProfileRaw(wallet, { last_briefing_mail_on: day });
  return ok ? "briefing" : null;
}

// ---- inbound ---------------------------------------------------------------------

/** Svix signature check (same scheme as the newsletter webhook). */
export function verifySvix(secret: string, id: string, timestamp: string, payload: string, signature: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64"));
  return signature.split(" ").some((part) => {
    const sig = Buffer.from(part.split(",")[1] ?? "");
    return sig.length === expected.length && timingSafeEqual(sig, expected);
  });
}

export interface ReceivedMail {
  from: string; subject: string; text: string | null; html: string | null; messageId: string | null;
  /** True only when the provider reports that the sender domain authenticated the mail. */
  authenticated: boolean;
}

const passes = (v: unknown): boolean => typeof v === "string" ? /^pass/i.test(v) : Boolean(v && typeof v === "object" && /^pass/i.test(String((v as { result?: unknown; status?: unknown }).result ?? (v as { status?: unknown }).status ?? "")));

export async function fetchReceivedMail(id: string): Promise<ReceivedMail | null> {
  const res = await resendFetch(`/emails/receiving/${encodeURIComponent(id)}`);
  if (!res.ok) { console.error("[chat/agent/mail] fetch received failed", res.status); return null; }
  const d = (await res.json()) as {
    from?: string; subject?: string; text?: string | null; html?: string | null; message_id?: string | null;
    authentication?: { spf?: unknown; dkim?: unknown; dmarc?: unknown };
  };
  const a = d.authentication ?? {};
  return {
    from: (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(d.from ?? "")?.[0] ?? "").toLowerCase(),
    subject: d.subject ?? "", text: d.text ?? null, html: d.html ?? null, messageId: d.message_id ?? null,
    // A forged From line fails DMARC; SPF alone would not prove the visible sender.
    authenticated: passes(a.dmarc) || (passes(a.dkim) && passes(a.spf)),
  };
}
