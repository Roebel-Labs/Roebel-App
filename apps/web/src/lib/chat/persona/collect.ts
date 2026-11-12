// Collects the raw material for a persona build: sent mail (the user's own
// words — the best signal for style and real relationships), human inbox mail
// from people the user writes to, a subject-only lane of automated notices
// (billing, CI, bookings: they reveal open problems, never people), calendar,
// the Röbel App profile, imported memory and chat memory.
//
// Everything is clipped and scrubbed here; nothing in the corpus is longer
// than a mail excerpt. The corpus lives in the job checkpoint only while the
// build runs.
import { db } from "../store";
import { googleApi, googleEnabled, hasScope } from "../harness/connectors/google";
import type { GoogleSecret } from "../harness/connectors/google";
import { listConnectors, secretOf } from "../harness/connectors/store";
import type { ConnectorRow } from "../harness/connectors/store";
import { loadProfile } from "../harness/context";
import { listMemories } from "../harness/memory";
import {
  htmlToText, isAutomated, nameFromEmail, ownText, parseAddresses, rankContacts, scrubSecrets,
} from "./classify";
import type { ContactStat, MailHeaders } from "./classify";
import { listImports } from "./store";
import type { Corpus, CorpusEvent, CorpusMail, CorpusNotice } from "./types";

const G = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const LIMITS = {
  full: { sentList: 220, inboxList: 220, sentBodies: 90, inboxBodies: 50, notices: 140, events: 200, sentDays: 365, inboxDays: 45 },
  refresh: { sentList: 60, inboxList: 100, sentBodies: 30, inboxBodies: 25, notices: 60, events: 120, sentDays: 0, inboxDays: 0 },
} as const;

type GmailList = { messages?: { id: string; threadId: string }[] };
interface GmailPart { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] }
interface GmailMessage {
  id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

function header(m: GmailMessage, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
}

function headersOf(m: GmailMessage): MailHeaders {
  return {
    from: header(m, "from"), to: header(m, "to"), cc: header(m, "cc"), subject: header(m, "subject"), date: header(m, "date"),
    listUnsubscribe: header(m, "list-unsubscribe") || null, listId: header(m, "list-id") || null,
    precedence: header(m, "precedence") || null, autoSubmitted: header(m, "auto-submitted") || null,
    labelIds: m.labelIds,
  };
}

function decode(data: string | undefined): string {
  if (!data) return "";
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return ""; }
}

/** First text/plain part, else text/html converted. */
function bodyOf(part: GmailPart | undefined): string {
  if (!part) return "";
  const find = (p: GmailPart, mime: string): string => {
    if (p.mimeType === mime && p.body?.data) return decode(p.body.data);
    for (const c of p.parts ?? []) { const t = find(c, mime); if (t) return t; }
    return "";
  };
  return find(part, "text/plain") || htmlToText(find(part, "text/html"));
}

const META = ["From", "To", "Cc", "Subject", "Date", "List-Unsubscribe", "List-Id", "Precedence", "Auto-Submitted"]
  .map((h) => `metadataHeaders=${h}`).join("&");

function isoDate(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function gmailDate(d: Date): string { return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }

async function listIds(row: ConnectorRow, q: string, max: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < max) {
    const params = new URLSearchParams({ q, maxResults: String(Math.min(100, max - ids.length)) });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await googleApi<GmailList & { nextPageToken?: string }>(row, `${G}/messages?${params}`);
    for (const m of page.messages ?? []) ids.push(m.id);
    if (!page.nextPageToken || !(page.messages ?? []).length) break;
    pageToken = page.nextPageToken;
  }
  return ids;
}

async function collectMail(row: ConnectorRow, mode: "full" | "refresh", since: Date | null, corpus: Corpus): Promise<void> {
  const L = LIMITS[mode];
  const window = (days: number) => (since ? `after:${gmailDate(since)}` : `newer_than:${days}d`);
  const profile = await googleApi<{ emailAddress?: string }>(row, `${G}/profile`);
  const self = (profile.emailAddress ?? "").toLowerCase();
  corpus.selfEmail = self || null;

  const [sentIds, inboxIds] = await Promise.all([
    listIds(row, `in:sent -in:chats ${window(L.sentDays)}`, L.sentList),
    listIds(row, `-in:sent -in:chats -in:spam -in:trash ${window(L.inboxDays)}`, L.inboxList),
  ]);
  const meta = (id: string) => googleApi<GmailMessage>(row, `${G}/messages/${id}?format=metadata&${META}`).catch(() => null);
  const [sentMeta, inboxMeta] = await Promise.all([pool(sentIds, 10, meta), pool(inboxIds, 10, meta)]);

  // Contacts: who the user writes to, who writes back.
  const stats = new Map<string, ContactStat>();
  const touch = (email: string, name: string, at: number): ContactStat => {
    let c = stats.get(email);
    if (!c) { c = { email, name, sent: 0, received: 0, lastAt: 0, meetings: 0 }; stats.set(email, c); }
    if (name && (!c.name || c.name.includes("@"))) c.name = name;
    if (at > c.lastAt) c.lastAt = at;
    return c;
  };
  for (const m of sentMeta) {
    if (!m) continue;
    const h = headersOf(m);
    const at = Number(m.internalDate ?? 0);
    for (const a of [...parseAddresses(h.to), ...parseAddresses(h.cc)]) {
      if (a.email === self) continue;
      touch(a.email, a.name, at).sent++;
    }
  }
  const humanInbox: GmailMessage[] = [];
  const notices: CorpusNotice[] = [];
  for (const m of inboxMeta) {
    if (!m) continue;
    const h = headersOf(m);
    const from = parseAddresses(h.from)[0];
    const at = Number(m.internalDate ?? 0);
    if (!from || from.email === self) continue;
    if (isAutomated(h)) {
      if (notices.length < L.notices) {
        notices.push({
          ref: `a${notices.length + 1}`, sender: (from.name || from.email.split("@")[1]).slice(0, 60),
          subject: scrubSecrets(h.subject).slice(0, 140), date: isoDate(at),
        });
      }
      continue;
    }
    touch(from.email, from.name, at).received++;
    humanInbox.push(m);
  }
  corpus.notices = notices;
  corpus.counts.sent = sentMeta.filter(Boolean).length;
  corpus.counts.inboxHuman = humanInbox.length;
  corpus.counts.inboxAutomated = inboxMeta.filter(Boolean).length - humanInbox.length;

  // Bodies: the user's own mails first; inbox only from people the user also writes to.
  const full = (id: string) => googleApi<GmailMessage>(row, `${G}/messages/${id}?format=full`).catch(() => null);
  const sentPick = sentMeta.filter((m): m is GmailMessage => Boolean(m)).slice(0, L.sentBodies);
  const inboxPick = humanInbox
    .filter((m) => (stats.get(parseAddresses(header(m, "from"))[0]?.email ?? "")?.sent ?? 0) > 0)
    .slice(0, L.inboxBodies);
  const [sentFull, inboxFull] = await Promise.all([pool(sentPick.map((m) => m.id), 8, full), pool(inboxPick.map((m) => m.id), 8, full)]);

  const toMail = (m: GmailMessage, dir: "sent" | "received", n: number): CorpusMail | null => {
    const h = headersOf(m);
    const text = scrubSecrets(ownText(bodyOf(m.payload) || m.snippet || ""));
    if (!text && !h.subject) return null;
    const from = parseAddresses(h.from)[0];
    const to = [...parseAddresses(h.to), ...parseAddresses(h.cc)].filter((a) => a.email !== self).slice(0, 6);
    return {
      ref: `${dir === "sent" ? "s" : "i"}${n}`, dir, threadId: m.threadId,
      from: dir === "sent" ? "ich" : (from?.email ?? ""),
      fromName: dir === "sent" ? "" : (from?.name || nameFromEmail(from?.email ?? "")),
      to: to.map((a) => a.email),
      subject: scrubSecrets(h.subject).slice(0, 160),
      date: isoDate(Number(m.internalDate ?? 0)),
      text,
    };
  };
  let n = 0;
  corpus.mails = [
    ...sentFull.map((m) => (m ? toMail(m, "sent", ++n) : null)),
    ...inboxFull.map((m, i) => (m ? toMail(m, "received", i + 1) : null)),
  ].filter((m): m is CorpusMail => Boolean(m));
  corpus.contacts = [...stats.values()];
}

interface CalEvent {
  id: string; summary?: string; location?: string; recurringEventId?: string; status?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; responseStatus?: string }[];
  organizer?: { email?: string; self?: boolean };
}

async function collectCalendar(row: ConnectorRow, mode: "full" | "refresh", corpus: Corpus, now: Date): Promise<void> {
  const L = LIMITS[mode];
  const back = mode === "full" ? 90 : 14;
  const params = new URLSearchParams({
    timeMin: new Date(now.getTime() - back * 86_400_000).toISOString(),
    timeMax: new Date(now.getTime() + 60 * 86_400_000).toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: String(L.events),
  });
  const res = await googleApi<{ items?: CalEvent[] }>(row, `${CAL}?${params}`);
  const byEmail = new Map(corpus.contacts.map((c) => [c.email, c]));
  const recurring = new Map<string, number>();
  const events: CorpusEvent[] = [];
  for (const e of res.items ?? []) {
    if (e.status === "cancelled" || !e.summary) continue;
    const start = e.start?.dateTime ?? e.start?.date ?? "";
    const attendees = (e.attendees ?? []).filter((a) => !a.self && a.email).slice(0, 6);
    for (const a of attendees) {
      const email = a.email!.toLowerCase();
      let c = byEmail.get(email);
      if (!c) { c = { email, name: a.displayName ?? "", sent: 0, received: 0, lastAt: 0, meetings: 0 }; byEmail.set(email, c); corpus.contacts.push(c); }
      c.meetings++;
      const at = Date.parse(start);
      if (Number.isFinite(at) && at < now.getTime() && at > c.lastAt) c.lastAt = at;
    }
    // A weekly series is one fact, not twelve.
    if (e.recurringEventId) {
      const seen = recurring.get(e.recurringEventId) ?? 0;
      recurring.set(e.recurringEventId, seen + 1);
      if (seen >= 1) continue;
    }
    events.push({
      ref: `c${events.length + 1}`, title: scrubSecrets(e.summary).slice(0, 120), start: start.slice(0, 16),
      allDay: Boolean(e.start?.date), recurring: Boolean(e.recurringEventId),
      location: e.location?.slice(0, 80) ?? null, attendees: attendees.map((a) => a.email!.toLowerCase()),
    });
  }
  corpus.events = events;
  corpus.counts.events = events.length;
}

async function collectRoebel(wallet: string, corpus: Corpus): Promise<void> {
  const profile = await loadProfile(wallet);
  if (!profile) return;
  const lines: string[] = [];
  if (profile.displayName) lines.push(`Name in der Röbel-App: ${profile.displayName}`);
  if (profile.username) lines.push(`Benutzername: @${profile.username}`);
  lines.push(profile.isCitizen ? "Verifizierte Bürgerin / verifizierter Bürger von Röbel/Müritz." : "In der Röbel-App angemeldet (nicht als Bürger/in verifiziert).");
  for (const o of profile.orgs.slice(0, 12)) lines.push(`Organisation: ${o.name} (${o.kind}, Rolle ${o.role})`);
  try {
    const res = await db().from("users").select("bio, district, interests").ilike("wallet_address", wallet).limit(1).maybeSingle();
    const u = res.data as { bio?: string | null; district?: string | null; interests?: unknown } | null;
    if (u?.bio) lines.push(`Profiltext: ${String(u.bio).slice(0, 400)}`);
    if (u?.district) lines.push(`Ortsteil: ${u.district}`);
    if (Array.isArray(u?.interests) && u.interests.length) lines.push(`Interessen: ${u.interests.slice(0, 12).join(", ")}`);
  } catch { /* optional columns */ }
  corpus.roebel = lines;
}

/** The whole corpus for one build. Never throws for a missing source; a broken Google link is reported in `warnings`. */
export async function collectCorpus(wallet: string, mode: "full" | "refresh", since: Date | null, now: Date = new Date()): Promise<Corpus> {
  const corpus: Corpus = {
    selfEmail: null, mails: [], notices: [], events: [], contacts: [], roebel: [], imports: [], memories: [], warnings: [],
    counts: { sent: 0, inboxHuman: 0, inboxAutomated: 0, events: 0 },
  };
  const google = googleEnabled()
    ? (await listConnectors(wallet, { activeOnly: true })).find((r) => r.kind === "google") ?? null
    : null;
  const scope = google ? secretOf<GoogleSecret>(google)?.scope : undefined;
  if (google && hasScope(scope, "gmail.readonly")) {
    try { await collectMail(google, mode, since, corpus); }
    catch (err) { corpus.warnings.push(`Gmail konnte nicht gelesen werden: ${err instanceof Error ? err.message.slice(0, 160) : "Fehler"}`); }
  }
  if (google && (hasScope(scope, "calendar") || hasScope(scope, "calendar.readonly"))) {
    try { await collectCalendar(google, mode, corpus, now); }
    catch (err) { corpus.warnings.push(`Kalender konnte nicht gelesen werden: ${err instanceof Error ? err.message.slice(0, 160) : "Fehler"}`); }
  }
  corpus.contacts = rankContacts(corpus.contacts, now.getTime()).slice(0, 60);

  await collectRoebel(wallet, corpus).catch(() => {});
  try {
    corpus.imports = (await listImports(wallet, { withContent: true })).map((imp, i) => ({
      ref: `x${i + 1}`, kind: imp.kind, title: imp.title, text: scrubSecrets(imp.content ?? "").slice(0, 24_000),
    }));
  } catch { /* table missing before the migration */ }
  try {
    corpus.memories = (await listMemories(wallet, 80)).map((m) => m.fact);
  } catch { /* ignore */ }
  return corpus;
}
