// Pure helpers for the persona build: who is a person and who is a machine,
// which contacts matter, what part of a mail body is the user's own words, and
// how citation refs in generated Markdown become numbered sources.
// No I/O here (tested in classify.test.ts).
import { createHash } from "node:crypto";

export interface MailHeaders {
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  listUnsubscribe?: string | null;
  listId?: string | null;
  precedence?: string | null;
  autoSubmitted?: string | null;
  labelIds?: string[];
}

export interface Address { name: string; email: string }

const EMAIL_IN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Splits a header list on commas that are outside quotes and angle brackets. */
function splitList(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = false;
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "<" && !quoted) angle = true;
    else if (ch === ">" && !quoted) angle = false;
    if (ch === "," && !quoted && !angle) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Parses an RFC 5322 address list ('"Eckloff, Anne" <a@x.de>, b@y.de') into name + lower-case email. */
export function parseAddresses(raw: string | null | undefined): Address[] {
  if (!raw) return [];
  const out: Address[] = [];
  const seen = new Set<string>();
  for (const part of splitList(raw)) {
    const m = EMAIL_IN.exec(part);
    if (!m) continue;
    const email = m[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const name = part.slice(0, m.index).replace(/[<"']/g, " ").replace(/\s+/g, " ").trim();
    out.push({ name, email });
  }
  return out;
}

const MACHINE_LOCAL = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|noreply|notifications?|notify|mailer[-_.]?daemon|postmaster|bounces?|newsletter|news|billing|invoice|updates?|alerts?|security|system|marketing|digest|receipts?|orders?|bestellung|automated|bot|ci|builds?)([-_.+].*)?$/;
const MACHINE_DOMAIN = /(^|\.)(github\.com|vercel\.com|supabase\.(com|io)|figma\.com|google\.com|googlemail\.com|linkedin\.com|facebookmail\.com|amazon\.[a-z.]+|paypal\.[a-z.]+|stripe\.com|apple\.com|notion\.so|slack\.com|atlassian\.(com|net)|expo\.(dev|io)|sentry\.io|cloudflare\.com|substack\.com|mailchimp\.com|sendgrid\.net|hubspot\.com|calendly\.com|zoom\.us|docusign\.(net|com)|bahn\.de|dhl\.[a-z]+|x\.com|twitter\.com)$/;

/**
 * True when a mail was sent by software, not a person. Deterministic and
 * deliberately strict: a wrongly "human" newsletter becomes a fake relationship
 * in the wiki, a wrongly "automated" person only loses one data point.
 */
export function isAutomated(h: MailHeaders): boolean {
  if (h.listUnsubscribe || h.listId) return true;
  const prec = (h.precedence ?? "").toLowerCase();
  if (prec === "bulk" || prec === "list" || prec === "junk") return true;
  const auto = (h.autoSubmitted ?? "").toLowerCase();
  if (auto && auto !== "no") return true;
  const labels = h.labelIds ?? [];
  if (labels.some((l) => l === "CATEGORY_PROMOTIONS" || l === "CATEGORY_SOCIAL" || l === "CATEGORY_UPDATES" || l === "CATEGORY_FORUMS")) return true;
  const from = parseAddresses(h.from)[0];
  if (!from) return true;
  const [local, domain] = from.email.split("@");
  if (MACHINE_LOCAL.test(local)) return true;
  if (MACHINE_DOMAIN.test(domain)) return true;
  return false;
}

// ---- contacts --------------------------------------------------------------------

export interface ContactStat {
  email: string;
  name: string;
  sent: number;        // mails the user wrote to this address
  received: number;    // human mails from this address
  lastAt: number;      // ms epoch of the latest exchange
  meetings: number;    // calendar events shared
}

const HALF_LIFE_DAYS = 60;

/** Reciprocity × recency × log frequency (+ shared meetings). 0 = not a real contact. */
export function contactScore(c: ContactStat, now: number): number {
  if (c.sent === 0 && c.meetings === 0) return 0; // never written to, never met: not a relationship
  const ageDays = Math.max(0, (now - c.lastAt) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  const reciprocity = c.sent > 0 && c.received > 0 ? 2 : 1;
  const volume = Math.log2(1 + c.sent * 2 + c.received + c.meetings * 2);
  return reciprocity * volume * (0.25 + 0.75 * recency);
}

/** A person page needs evidence of a real exchange: ≥ 2 mails written to them, or one each way, or a meeting plus a mail. */
export function isProfileWorthy(c: ContactStat): boolean {
  return c.sent >= 2 || (c.sent >= 1 && c.received >= 1) || (c.meetings >= 1 && c.sent + c.received >= 1);
}

export function rankContacts(stats: ContactStat[], now: number): ContactStat[] {
  return stats
    .map((c) => ({ c, s: contactScore(c, now) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

export function personSlug(email: string | null, name: string): string {
  const key = (email || name).trim().toLowerCase();
  return `person-${createHash("sha256").update(key).digest("hex").slice(0, 10)}`;
}

/** "anne.eckloff@stic.de" → "Anne Eckloff" when the header carried no display name. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/\+.*$/, "");
  const parts = local.split(/[._-]+/).filter((p) => p && !/^\d+$/.test(p));
  if (!parts.length) return email;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// ---- bodies ----------------------------------------------------------------------

const QUOTE_START = [
  /^\s*>/,
  /^\s*Am .{4,80} schrieb .{1,120}:\s*$/,
  /^\s*On .{4,80} wrote:\s*$/,
  /^\s*-{2,}\s*(Original Message|Ursprüngliche Nachricht|Weitergeleitete Nachricht|Forwarded message)\s*-{2,}/i,
  /^\s*(Von|From):\s.+@.+/,
  /^\s*_{10,}\s*$/,
];

/**
 * The part of a mail the sender actually wrote: quoted replies, forwarded
 * headers and the signature block are cut, whitespace collapsed, length capped.
 * For a pure forward (nothing written above the quote) the forwarded text is kept, marked.
 */
export function ownText(body: string, max = 1400): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const own: string[] = [];
  let cutAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (QUOTE_START.some((re) => re.test(line))) { cutAt = i; break; }
    if (/^-- ?$/.test(line)) break; // signature delimiter
    own.push(line);
  }
  let text = own.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text && cutAt >= 0) {
    const rest = lines.slice(cutAt).filter((l) => !/^\s*>?\s*$/.test(l)).join("\n").replace(/^[> ]+/gm, "");
    text = `[nur weitergeleitet, ohne eigenen Text] ${rest.replace(/[ \t]+/g, " ").trim()}`;
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

/** Secrets must never reach a model or the wiki: API keys, tokens, long hex, card-like numbers. */
export function scrubSecrets(text: string): string {
  return text
    .replace(/\b(?:sk|pk|rk|ghp|gho|xox[abp]|AKIA|AIza)[-_][-_A-Za-z0-9]{16,}/g, "[Schlüssel entfernt]")
    .replace(/\b(?:AKIA|AIza)[A-Za-z0-9_-]{16,}/g, "[Schlüssel entfernt]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[Token entfernt]")
    .replace(/\b0x[a-fA-F0-9]{40,}\b/g, "[Adresse entfernt]")
    .replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g, "[IBAN entfernt]")
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, "[Nummer entfernt]");
}

// ---- citations -------------------------------------------------------------------

export interface SourceRef { ref: string; label: string; date: string | null }
export interface NumberedSource { n: number; label: string; date: string | null }

const REF = /\[((?:[sicaxrm]\d{1,4})(?:\s*,\s*[sicaxrm]\d{1,4})*)\]/g;

/**
 * Turns the model's inline refs ("… plant die Bewerbung [s12, i4].") into numbered
 * citation markers ("[[1]][[2]]") plus the source list for the page. Unknown refs
 * (a model inventing "[s999]") are dropped, so every number shown has a real source.
 */
export function numberCitations(body: string, known: Map<string, SourceRef>): { body: string; sources: NumberedSource[] } {
  const order: string[] = [];
  const out = body.replace(REF, (_m, list: string) => {
    const marks: string[] = [];
    for (const ref of list.split(",").map((r) => r.trim())) {
      if (!known.has(ref)) continue;
      let idx = order.indexOf(ref);
      if (idx < 0) { order.push(ref); idx = order.length - 1; }
      marks.push(`[[${idx + 1}]]`);
    }
    return marks.join("");
  });
  const sources = order.map((ref, i) => {
    const s = known.get(ref)!;
    return { n: i + 1, label: s.label, date: s.date };
  });
  return { body: out.replace(/[ \t]+([.,;:])/g, "$1"), sources };
}

/** Removes citation markers (for the compact runtime block). */
export function stripCitations(body: string): string {
  return body.replace(/\[\[\d+\]\]/g, "").replace(REF, "").replace(/[ \t]+([.,;:])/g, "$1").replace(/[ \t]+$/gm, "");
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
