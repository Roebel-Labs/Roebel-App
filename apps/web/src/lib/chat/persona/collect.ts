// Collects the raw material for a persona build: whole threads the user wrote
// in (their own words plus every answer), mail from people outside those
// threads, a clustered lane of automated notices (billing, CI, bookings: they
// reveal open problems, never people), calendar,
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
  htmlToText, isAutomated, isSelfAlias, nameFromEmail, noticeKey, ownText, parseAddresses, rankContacts, scrubSecrets,
} from "./classify";
import type { ContactStat, MailHeaders } from "./classify";
import { listImports } from "./store";
import type { Corpus, CorpusEvent, CorpusMail, CorpusNotice } from "./types";

const G = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const LIMITS = {
  full: {
    sentList: 200, sentDays: 365, threads: 70,
    personalList: 250, personalDays: 90, personalBodies: 50,
    noticeList: 400, noticeDays: 30, noticeClusters: 90, events: 200,
  },
  refresh: {
    sentList: 60, sentDays: 0, threads: 30,
    personalList: 100, personalDays: 0, personalBodies: 25,
    noticeList: 150, noticeDays: 0, noticeClusters: 60, events: 120,
  },
} as const;
const MAX_MAILS = 260;
const PER_THREAD = 8;
const NOT_MINE = "-in:sent -in:chats -in:spam -in:trash";
// Gmail's own sorting: without this the newest 200 mails of a developer are all CI failures.
const NO_BULK = "-category:promotions -category:social -category:updates -category:forums";

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

interface GmailThread { id: string; messages?: GmailMessage[] }

async function collectMail(row: ConnectorRow, mode: "full" | "refresh", since: Date | null, corpus: Corpus): Promise<void> {
  const L = LIMITS[mode];
  const window = (days: number) => (since ? `after:${gmailDate(since)}` : `newer_than:${days}d`);
  const profile = await googleApi<{ emailAddress?: string }>(row, `${G}/profile`);
  const self = (profile.emailAddress ?? "").toLowerCase();
  corpus.selfEmail = self || null;

  // Three lanes: what the person wrote, what people wrote to them, and what machines reported.
  const [sentIds, personalIds, noticeIds] = await Promise.all([
    listIds(row, `in:sent -in:chats ${window(L.sentDays)}`, L.sentList),
    listIds(row, `${NOT_MINE} ${NO_BULK} ${window(L.personalDays)}`, L.personalList),
    listIds(row, `${NOT_MINE} {category:updates category:forums} ${window(L.noticeDays)}`, L.noticeList),
  ]);
  const meta = (id: string) => googleApi<GmailMessage>(row, `${G}/messages/${id}?format=metadata&${META}`).catch(() => null);
  const [sentMeta, personalMeta, noticeMeta] = await Promise.all([pool(sentIds, 10, meta), pool(personalIds, 10, meta), pool(noticeIds, 10, meta)]);

  const stats = new Map<string, ContactStat>();
  const touch = (email: string, name: string, at: number): ContactStat => {
    let c = stats.get(email);
    if (!c) { c = { email, name, sent: 0, received: 0, lastAt: 0, meetings: 0, shared: 0 }; stats.set(email, c); }
    if (name && (!c.name || c.name.includes("@"))) c.name = name;
    if (at > c.lastAt) c.lastAt = at;
    return c;
  };
  const sent = sentMeta.filter((m): m is GmailMessage => Boolean(m));
  for (const m of sent) {
    const h = headersOf(m);
    const at = Number(m.internalDate ?? 0);
    if (!corpus.selfName) corpus.selfName = parseAddresses(h.from)[0]?.name || null;
    for (const a of [...parseAddresses(h.to), ...parseAddresses(h.cc)]) {
      if (a.email === self) continue;
      touch(a.email, a.name, at).sent++;
    }
  }

  // Notices: look-alike mails become one line with a count, a date range and the newest preview text.
  const clusters = new Map<string, CorpusNotice>();
  const addNotice = (m: GmailMessage, h: MailHeaders, from: { name: string; email: string }) => {
    const sender = (from.name || from.email.split("@")[1]).slice(0, 60);
    const subject = scrubSecrets(h.subject).slice(0, 140);
    const date = isoDate(Number(m.internalDate ?? 0));
    const key = noticeKey(sender, subject);
    const c = clusters.get(key);
    if (!c) {
      if (clusters.size >= L.noticeClusters) return;
      clusters.set(key, { ref: `a${clusters.size + 1}`, sender, subject, date, count: 1, firstDate: date, snippet: scrubSecrets(htmlToText(m.snippet ?? "")).slice(0, 220) });
      return;
    }
    c.count = (c.count ?? 1) + 1;
    if (date < (c.firstDate ?? date)) c.firstDate = date;
    if (date > c.date) { c.date = date; c.subject = subject; c.snippet = scrubSecrets(htmlToText(m.snippet ?? "")).slice(0, 220); }
  };

  const humanInbox: GmailMessage[] = [];
  const seen = new Set<string>();
  let automated = 0;
  for (const m of [...personalMeta, ...noticeMeta]) {
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    const h = headersOf(m);
    const from = parseAddresses(h.from)[0];
    if (!from || from.email === self) continue;
    if (isAutomated(h)) { automated++; addNotice(m, h, from); continue; }
    touch(from.email, from.name, Number(m.internalDate ?? 0)).received++;
    humanInbox.push(m);
  }
  corpus.notices = [...clusters.values()];
  corpus.counts.sent = sent.length;
  corpus.counts.inboxHuman = humanInbox.length;
  corpus.counts.inboxAutomated = automated;

  const mails: CorpusMail[] = [];
  let sentN = 0;
  let recvN = 0;
  const toMail = (m: GmailMessage, dir: "sent" | "received"): CorpusMail | null => {
    const h = headersOf(m);
    const text = scrubSecrets(ownText(bodyOf(m.payload) || m.snippet || "", dir === "sent" ? 1400 : 1000));
    if (!text && !h.subject) return null;
    const from = parseAddresses(h.from)[0];
    const to = [...parseAddresses(h.to), ...parseAddresses(h.cc)].filter((a) => a.email !== self).slice(0, 6);
    return {
      ref: dir === "sent" ? `s${++sentN}` : `i${++recvN}`, dir, threadId: m.threadId,
      from: dir === "sent" ? "ich" : (from?.email ?? ""),
      fromName: dir === "sent" ? "" : (from?.name || nameFromEmail(from?.email ?? "")),
      to: to.map((a) => a.email),
      subject: scrubSecrets(h.subject).slice(0, 160),
      date: isoDate(Number(m.internalDate ?? 0)),
      text,
    };
  };

  // Whole threads the person wrote in: their mail plus every answer, including replies from
  // people in cc. The answer to a question is usually the fact that matters.
  const threadIds = [...new Set(sent.map((m) => m.threadId))].slice(0, L.threads);
  const threads = await pool(threadIds, 6, (id) => googleApi<GmailThread>(row, `${G}/threads/${id}?format=full`).catch(() => null));
  const inThreads = new Set<string>();
  for (const t of threads) {
    for (const m of (t?.messages ?? []).slice(-PER_THREAD)) {
      inThreads.add(m.id);
      const h = headersOf(m);
      const from = parseAddresses(h.from)[0];
      const mine = (m.labelIds ?? []).includes("SENT") || from?.email === self;
      if (!mine) {
        if (!from || isAutomated(h)) continue;
        const c = touch(from.email, from.name, Number(m.internalDate ?? 0));
        c.shared = (c.shared ?? 0) + 1;
        if (!seen.has(m.id)) { c.received++; corpus.counts.inboxHuman++; }
      }
      const mail = toMail(m, mine ? "sent" : "received");
      if (mail) mails.push(mail);
    }
  }

  // Mail from people outside those threads (an unanswered report is exactly what the assistant should notice).
  const full = (id: string) => googleApi<GmailMessage>(row, `${G}/messages/${id}?format=full`).catch(() => null);
  const loose = humanInbox.filter((m) => !inThreads.has(m.id)).slice(0, L.personalBodies);
  for (const m of await pool(loose.map((x) => x.id), 8, full)) {
    const mail = m ? toMail(m, "received") : null;
    if (mail) mails.push(mail);
  }

  corpus.mails = mails.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_MAILS);
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
  if (profile.orgs.length) {
    // Admin access in the app is not ownership in real life (operators hold it for many profiles).
    const names = profile.orgs.slice(0, 6).map((o) => o.name).join(", ");
    lines.push(`Hat in der Röbel-App Verwaltungszugriff auf ${profile.orgs.length} Organisationsprofil(e), z. B. ${names}. Das ist ein Zugriff in der App und kein Beleg dafür, dass ihm diese Organisationen gehören oder er dort Mitglied ist.`);
  }
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
  await collectRoebel(wallet, corpus).catch(() => {});
  // The person's own second mailbox is not a contact.
  const roebelName = (await loadProfile(wallet).catch(() => null))?.displayName ?? "";
  const selfNames = [corpus.selfName ?? "", roebelName].filter(Boolean);
  corpus.selfAliases = corpus.contacts.filter((c) => isSelfAlias(c, selfNames)).map((c) => c.email);
  const aliases = new Set(corpus.selfAliases);
  corpus.contacts = rankContacts(corpus.contacts.filter((c) => !aliases.has(c.email)), now.getTime()).slice(0, 60);

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
