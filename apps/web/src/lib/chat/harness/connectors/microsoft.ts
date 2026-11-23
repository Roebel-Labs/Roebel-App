// Microsoft 365 / Outlook connector (mail + calendar) — OAuth 2.0 code flow with PKCE against the
// Microsoft identity platform and plain fetch against Microsoft Graph (no SDK dependency).
//
// OFF unless MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET are set: routes answer 503,
// tools are not offered. The app registration is multi-tenant ("any organisation + personal
// accounts", tenant `common`; MICROSOFT_OAUTH_TENANT overrides). Many organisations do not let
// staff consent to apps themselves — their admin consents once (adminConsentUrl).
//
// The OAuth state reuses the sealed-state helpers of the Google connector (wallet + PKCE verifier
// + return URL + expiry, AES-GCM), so the callback needs no pending row.
import { z } from "zod";
import type { HarnessTool } from "../types";
import { parseBerlinTime, isDateOnly, parseRecipients, withQuery } from "./google";
import { secretOf, updateConnector } from "./store";
import type { ConnectorRow } from "./store";

export const MICROSOFT_DISABLED_MESSAGE = "Microsoft-Verbindung ist noch nicht eingerichtet";
export const MICROSOFT_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite", // read mail and create drafts
  "Mail.Send",
  "Calendars.ReadWrite",
] as const;

const GRAPH = "https://graph.microsoft.com/v1.0";
const API_TIMEOUT_MS = 15_000;
const OUTPUT_MAX = 8_000;
const BODY_MAX = 6_000;

// ---- config gate -------------------------------------------------------------------

export interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  tenant: string;
}

export function microsoftConfig(env: Record<string, string | undefined> = process.env): MicrosoftConfig | null {
  const clientId = env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const tenant = env.MICROSOFT_OAUTH_TENANT?.trim() || "common";
  return { clientId, clientSecret, tenant };
}

export const microsoftEnabled = (env?: Record<string, string | undefined>): boolean => microsoftConfig(env) !== null;

export function microsoftGate(env?: Record<string, string | undefined>): { status: 503; code: string; message: string } | null {
  return microsoftConfig(env) ? null : { status: 503, code: "microsoft_unavailable", message: MICROSOFT_DISABLED_MESSAGE };
}

/** Redirect URI registered in the Entra app registration. */
export function microsoftRedirectUri(requestUrl: string, env: Record<string, string | undefined> = process.env): string {
  const override = env.MICROSOFT_OAUTH_REDIRECT_URI?.trim();
  if (override) return override;
  return `${new URL(requestUrl).origin}/api/chat/connectors/microsoft/callback`;
}

const authority = (cfg: MicrosoftConfig) => `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0`;

export function buildMicrosoftAuthUrl(cfg: MicrosoftConfig, opts: { redirectUri: string; state: string; challenge: string }): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${authority(cfg)}/authorize?${p.toString()}`;
}

/**
 * The link an organisation's admin opens once to approve Ortis for everyone in the tenant
 * (needed where users may not consent to apps themselves).
 */
export function adminConsentUrl(cfg: MicrosoftConfig, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    scope: MICROSOFT_SCOPES.filter((s) => s !== "openid" && s !== "email" && s !== "profile" && s !== "offline_access")
      .map((s) => `https://graph.microsoft.com/${s}`)
      .join(" "),
    redirect_uri: redirectUri,
  });
  return `https://login.microsoftonline.com/organizations/v2.0/adminconsent?${p.toString()}`;
}

// ---- tokens -----------------------------------------------------------------------

export interface MicrosoftSecret {
  refreshToken: string;
  scope?: string;
}

async function tokenRequest(cfg: MicrosoftConfig, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${authority(cfg)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }).toString(),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(`microsoft token ${res.status} ${String(body.error ?? "")}`) as Error & { oauthError?: string };
    err.oauthError = String(body.error ?? "");
    throw err;
  }
  return body;
}

/** The account's address from the id_token (preferred_username or email), or null. */
export function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64").toString("utf8")) as Record<string, unknown>;
    const v = payload.email ?? payload.preferred_username;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function exchangeMicrosoftCode(
  cfg: MicrosoftConfig,
  opts: { code: string; verifier: string; redirectUri: string },
): Promise<{ refreshToken: string; scope: string; email: string | null }> {
  const body = await tokenRequest(cfg, {
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: opts.verifier,
    redirect_uri: opts.redirectUri,
    scope: MICROSOFT_SCOPES.join(" "),
  });
  if (typeof body.refresh_token !== "string") throw new Error("microsoft: no refresh_token");
  return { refreshToken: body.refresh_token, scope: String(body.scope ?? ""), email: emailFromIdToken(body.id_token) };
}

const accessCache = new Map<string, { token: string; exp: number }>();

export class MicrosoftAuthError extends Error {}

async function accessTokenFor(row: ConnectorRow): Promise<string> {
  const cached = accessCache.get(row.id);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const cfg = microsoftConfig();
  if (!cfg) throw new MicrosoftAuthError(MICROSOFT_DISABLED_MESSAGE);
  const secret = secretOf<MicrosoftSecret>(row);
  if (!secret?.refreshToken) throw new MicrosoftAuthError("Microsoft ist nicht verbunden.");
  try {
    const body = await tokenRequest(cfg, {
      grant_type: "refresh_token",
      refresh_token: secret.refreshToken,
      scope: MICROSOFT_SCOPES.join(" "),
    });
    const token = String(body.access_token ?? "");
    accessCache.set(row.id, { token, exp: Date.now() + Number(body.expires_in ?? 3600) * 1000 });
    // Microsoft rotates refresh tokens: keep the newest one.
    if (typeof body.refresh_token === "string" && body.refresh_token !== secret.refreshToken) {
      await updateConnector(row.wallet, row.id, { secret: { ...secret, refreshToken: body.refresh_token } }).catch(() => {});
    }
    return token;
  } catch (err) {
    const code = (err as { oauthError?: string }).oauthError;
    if (code === "invalid_grant" || code === "interaction_required") {
      await updateConnector(row.wallet, row.id, {
        status: "error",
        lastError: "Der Microsoft-Zugriff ist abgelaufen oder wurde widerrufen. Bitte neu verbinden.",
      }).catch(() => {});
      throw new MicrosoftAuthError("Der Microsoft-Zugriff ist abgelaufen. Der Mensch muss Microsoft in den Verbindungen neu verbinden.");
    }
    throw err;
  }
}

export async function graph<T>(row: ConnectorRow, path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const token = await accessTokenFor(row);
  const { prefer, ...rest } = init;
  const res = await fetch(`${GRAPH}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (res.status === 202 || res.status === 204) return null as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Microsoft-Graph-Fehler: ${String(msg).slice(0, 200)}`);
  }
  return body as T;
}

// ---- pure helpers (tested) ---------------------------------------------------------

function clip(value: unknown): unknown {
  const s = JSON.stringify(value);
  if (s.length <= OUTPUT_MAX) return value;
  return { gekuerzt: true, daten: `${s.slice(0, OUTPUT_MAX)}…` };
}

/** Graph returns UTC wall times without "Z" ("2026-10-01T16:00:00.0000000"). */
export function graphUtc(dateTime: string | undefined | null): Date | null {
  if (!dateTime) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(dateTime) ? dateTime : `${dateTime}Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function fmtBerlin(d: Date | null): string | null {
  return d ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" }) : null;
}

/** A Date as a Graph dateTimeTimeZone in UTC. */
export function toGraphUtc(d: Date): { dateTime: string; timeZone: string } {
  return { dateTime: d.toISOString().slice(0, 19), timeZone: "UTC" };
}

/** Escapes a free-text query for Graph $search ("..." with inner quotes removed). */
export function graphSearch(query: string): string {
  return `"${query.replace(/["\\]/g, " ").trim()}"`;
}

export function recipients(list: string[]): { emailAddress: { address: string } }[] {
  return list.map((address) => ({ emailAddress: { address } }));
}

/** Event start/end for a create call: all-day dates or Berlin wall times, sent as UTC. */
export function eventTimes(start: string, end?: string): { start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string }; isAllDay: boolean } {
  if (isDateOnly(start)) {
    const s = new Date(`${start.trim()}T00:00:00Z`);
    const lastDay = end && isDateOnly(end) ? new Date(`${end.trim()}T00:00:00Z`) : s;
    const e = new Date(lastDay.getTime() + 86_400_000);
    return { start: toGraphUtc(s), end: toGraphUtc(e), isAllDay: true };
  }
  const s = parseBerlinTime(start);
  const e = end ? parseBerlinTime(end) : new Date(s.getTime() + 3_600_000);
  if (e.getTime() <= s.getTime()) throw new Error("Das Ende liegt vor dem Beginn.");
  return { start: toGraphUtc(s), end: toGraphUtc(e), isAllDay: false };
}

// ---- tools -----------------------------------------------------------------------

const mailSearchInput = z.object({
  query: z.string().max(300).optional().describe("Suchtext (Absender, Betreff, Inhalt); leer = neueste Mails"),
  unread: z.boolean().optional().describe("Nur ungelesene Mails"),
  max: z.number().int().min(1).max(15).optional().describe("Anzahl Treffer (Standard 8)"),
});
const mailReadInput = z.object({ id: z.string().min(5).max(400).describe("id aus microsoft_mail_search") });
const mailWriteInput = z.object({
  to: z.string().min(3).max(500).describe("Empfänger-E-Mail(s), durch Komma getrennt"),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000).describe("Klartext der E-Mail"),
});
const calListInput = z.object({
  from: z.string().max(40).optional().describe("Beginn, z. B. 2026-10-01 oder 2026-10-01T08:00 (Berliner Zeit); Standard jetzt"),
  to: z.string().max(40).optional().describe("Ende; Standard 7 Tage nach Beginn"),
  max: z.number().int().min(1).max(30).optional(),
});
const calCreateInput = z.object({
  title: z.string().min(1).max(200),
  start: z.string().min(10).max(40).describe("2026-10-01T18:00 (Berliner Zeit) oder 2026-10-01 für ganztägig"),
  end: z.string().min(10).max(40).optional().describe("Ende; Standard 1 Stunde nach Beginn bzw. ganztägig"),
  location: z.string().max(300).optional(),
  description: z.string().max(4000).optional(),
});

type GraphMail = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  body?: { content?: string };
  webLink?: string;
};

const who = (a?: { emailAddress?: { name?: string; address?: string } }) =>
  a?.emailAddress ? `${a.emailAddress.name ?? ""} <${a.emailAddress.address ?? ""}>`.trim() : null;

/** The six Microsoft tools bound to one connector row. */
export function microsoftTools(row: ConnectorRow): HarnessTool[] {
  const mailSearch: HarnessTool<z.infer<typeof mailSearchInput>> = {
    name: "microsoft_mail_search",
    pack: "connectors",
    risk: "read",
    description: "Durchsucht das verbundene Outlook-Postfach des Menschen (Absender, Betreff, Datum, Vorschau, gelesen). Nur lesen.",
    inputSchema: mailSearchInput,
    summarize: ({ query, unread }) => (query ? `Outlook durchsuchen: „${query.slice(0, 60)}“` : unread ? "Ungelesene Outlook-Mails ansehen" : "Neueste Outlook-Mails ansehen"),
    execute: async ({ query, unread, max }) => {
      const top = String(max ?? 8);
      const select = "id,subject,from,receivedDateTime,bodyPreview,isRead";
      const p = new URLSearchParams({ $top: top, $select: select });
      // $search cannot be combined with $orderby/$filter; unread-only lists use $filter instead.
      if (query) p.set("$search", graphSearch(query));
      else {
        p.set("$orderby", "receivedDateTime desc");
        // Graph needs the $orderby property first in $filter, else "too complex".
        if (unread) p.set("$filter", "receivedDateTime ge 1900-01-01T00:00:00Z and isRead eq false");
      }
      const res = await graph<{ value?: GraphMail[] }>(row, `/me/messages?${p.toString()}`);
      const mails = (res.value ?? [])
        .filter((m) => !unread || !m.isRead)
        .map((m) => ({
          id: m.id,
          von: who(m.from),
          betreff: m.subject ?? "(ohne Betreff)",
          datum: fmtBerlin(m.receivedDateTime ? new Date(m.receivedDateTime) : null),
          gelesen: m.isRead ?? null,
          vorschau: (m.bodyPreview ?? "").slice(0, 300),
        }));
      return clip({ treffer: mails.length, mails });
    },
  };

  const mailRead: HarnessTool<z.infer<typeof mailReadInput>> = {
    name: "microsoft_mail_read",
    pack: "connectors",
    risk: "read",
    description: "Liest eine einzelne Outlook-Mail vollständig (Text, Absender, Empfänger). Nur lesen.",
    inputSchema: mailReadInput,
    summarize: () => "Outlook-Mail lesen",
    execute: async ({ id }) => {
      const m = await graph<GraphMail>(
        row,
        `/me/messages/${encodeURIComponent(id)}?$select=subject,from,toRecipients,receivedDateTime,body,webLink`,
        { prefer: 'outlook.body-content-type="text"' },
      );
      const text = (m.body?.content ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
      return clip({
        betreff: m.subject ?? "(ohne Betreff)",
        von: who(m.from),
        an: (m.toRecipients ?? []).map(who).filter(Boolean),
        datum: fmtBerlin(m.receivedDateTime ? new Date(m.receivedDateTime) : null),
        text: text.length > BODY_MAX ? `${text.slice(0, BODY_MAX)}…` : text,
        link: m.webLink ?? null,
      });
    },
  };

  const mailDraft: HarnessTool<z.infer<typeof mailWriteInput>> = {
    name: "microsoft_mail_draft",
    pack: "connectors",
    risk: "external",
    description: "Legt im Outlook des Menschen einen E-Mail-Entwurf an (wird NICHT gesendet). Braucht die Freigabe des Menschen.",
    inputSchema: mailWriteInput,
    summarize: ({ to, subject }) => `Outlook-Entwurf an ${to.slice(0, 60)}: „${subject.slice(0, 60)}“`,
    preview: ({ to, subject, body }) => ({ kind: "email", fields: [{ label: "An", value: to }, { label: "Betreff", value: subject }], body }),
    execute: async ({ to, subject, body }) => {
      const res = await graph<{ id: string; webLink?: string }>(row, "/me/messages", {
        method: "POST",
        body: JSON.stringify({ subject, body: { contentType: "Text", content: body }, toRecipients: recipients(parseRecipients(to)) }),
      });
      return { ok: true, entwurfId: res?.id ?? null, link: res?.webLink ?? null, hinweis: "Entwurf liegt in Outlook unter „Entwürfe“ und wurde nicht gesendet." };
    },
  };

  const mailSend: HarnessTool<z.infer<typeof mailWriteInput>> = {
    name: "microsoft_mail_send",
    pack: "connectors",
    risk: "external",
    description: "Sendet im Namen des Menschen eine E-Mail über sein Outlook. Nur nach ausdrücklicher Freigabe; vorher Empfänger, Betreff und Text zeigen.",
    inputSchema: mailWriteInput,
    summarize: ({ to, subject }) => `E-Mail an ${to.slice(0, 60)} senden: „${subject.slice(0, 60)}“`,
    preview: ({ to, subject, body }) => ({ kind: "email", fields: [{ label: "An", value: to }, { label: "Betreff", value: subject }], body }),
    execute: async ({ to, subject, body }) => {
      await graph<null>(row, "/me/sendMail", {
        method: "POST",
        body: JSON.stringify({
          message: { subject, body: { contentType: "Text", content: body }, toRecipients: recipients(parseRecipients(to)) },
          saveToSentItems: true,
        }),
      });
      return { ok: true, hinweis: "Die E-Mail wurde gesendet und liegt unter „Gesendete Elemente“." };
    },
  };

  const calendarList: HarnessTool<z.infer<typeof calListInput>> = {
    name: "microsoft_calendar_list",
    pack: "connectors",
    risk: "read",
    description: "Listet Termine aus dem verbundenen Outlook-Kalender in einem Zeitraum (Berliner Zeit).",
    inputSchema: calListInput,
    summarize: () => "Outlook-Kalender lesen",
    execute: async ({ from, to, max }) => {
      const start = from ? parseBerlinTime(from) : new Date();
      const end = to ? parseBerlinTime(to) : new Date(start.getTime() + 7 * 86_400_000);
      const p = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        $top: String(max ?? 20),
        $orderby: "start/dateTime",
        $select: "subject,start,end,location,isAllDay,webLink,organizer",
      });
      type Ev = {
        subject?: string;
        isAllDay?: boolean;
        webLink?: string;
        start?: { dateTime?: string };
        end?: { dateTime?: string };
        location?: { displayName?: string };
        organizer?: { emailAddress?: { name?: string } };
      };
      const res = await graph<{ value?: Ev[] }>(row, `/me/calendarView?${p.toString()}`, { prefer: 'outlook.timezone="UTC"' });
      return clip({
        termine: (res.value ?? []).map((e) => ({
          titel: e.subject ?? "(ohne Titel)",
          beginn: e.isAllDay ? (e.start?.dateTime ?? "").slice(0, 10) : fmtBerlin(graphUtc(e.start?.dateTime)),
          ende: e.isAllDay ? null : fmtBerlin(graphUtc(e.end?.dateTime)),
          ganztaegig: e.isAllDay ?? false,
          ort: e.location?.displayName || null,
          organisator: e.organizer?.emailAddress?.name ?? null,
          link: e.webLink ?? null,
        })),
      });
    },
  };

  const calendarCreate: HarnessTool<z.infer<typeof calCreateInput>> = {
    name: "microsoft_calendar_create",
    pack: "connectors",
    risk: "external",
    description: "Trägt einen Termin in den verbundenen Outlook-Kalender ein (Berliner Zeit). Braucht die Freigabe des Menschen.",
    inputSchema: calCreateInput,
    summarize: ({ title, start }) => `Outlook-Termin „${title.slice(0, 60)}“ am ${start}`,
    preview: ({ title, start, end, location, description }) => ({
      kind: "event",
      fields: [
        { label: "Titel", value: title },
        { label: "Beginn", value: start },
        ...(end ? [{ label: "Ende", value: end }] : []),
        ...(location ? [{ label: "Ort", value: location }] : []),
      ],
      body: description,
    }),
    execute: async ({ title, start, end, location, description }) => {
      const times = eventTimes(start, end);
      const res = await graph<{ id: string; webLink?: string }>(row, "/me/events", {
        method: "POST",
        body: JSON.stringify({
          subject: title,
          ...times,
          ...(location ? { location: { displayName: location } } : {}),
          ...(description ? { body: { contentType: "Text", content: description } } : {}),
        }),
      });
      return { ok: true, terminId: res?.id ?? null, link: res?.webLink ?? null };
    },
  };

  return [mailSearch, mailRead, mailDraft, mailSend, calendarList, calendarCreate] as HarnessTool[];
}

export const MICROSOFT_TOOL_NAMES = [
  "microsoft_mail_search",
  "microsoft_mail_read",
  "microsoft_mail_draft",
  "microsoft_mail_send",
  "microsoft_calendar_list",
  "microsoft_calendar_create",
] as const;

export { withQuery };
