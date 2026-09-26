// Google connector (Gmail / Calendar / Drive) — OAuth code flow with PKCE and
// plain fetch against the Google REST APIs (no googleapis dependency).
//
// The whole path is OFF unless GOOGLE_OAUTH_CLIENT_ID and
// GOOGLE_OAUTH_CLIENT_SECRET are set: routes answer 503, tools are not offered.
// The OAuth state is an AES-GCM blob (wallet + PKCE verifier + return URL +
// expiry) so the callback needs no pending row and cannot be bound to another wallet.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { zonedTimeToUtc } from "../../time";
import type { HarnessTool } from "../types";
import { decryptSecret, encryptSecret } from "./crypto";
import { secretOf, updateConnector } from "./store";
import type { ConnectorRow } from "./store";

export const GOOGLE_DISABLED_MESSAGE = "Google-Verbindung ist noch nicht eingerichtet";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;
export const DEFAULT_RETURN_URL = "roebel://chat/settings/connections";
const STATE_TTL_MS = 10 * 60_000;
const STATE_AAD = "google-oauth-state";
const API_TIMEOUT_MS = 15_000;
const OUTPUT_MAX = 8_000;

// ---- config gate -------------------------------------------------------------------

export interface GoogleConfig { clientId: string; clientSecret: string }

export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleEnabled = (env?: Record<string, string | undefined>): boolean => googleConfig(env) !== null;

/** Route gate: null when configured, else the 503 the Google routes answer. */
export function googleGate(env?: Record<string, string | undefined>): { status: 503; code: string; message: string } | null {
  return googleConfig(env) ? null : { status: 503, code: "google_unavailable", message: GOOGLE_DISABLED_MESSAGE };
}

/** Callback URL registered in the Google Cloud console. */
export function googleRedirectUri(requestUrl: string, env: Record<string, string | undefined> = process.env): string {
  const override = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (override) return override;
  return `${new URL(requestUrl).origin}/api/chat/connectors/google/callback`;
}

/** Only app deep links are allowed as the final redirect target. */
export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_RETURN_URL;
  const v = raw.trim();
  if (v.length > 300) return DEFAULT_RETURN_URL;
  return /^(roebel|exp\+roebel|exp):\/\/[^\s]*$/.test(v) ? v : DEFAULT_RETURN_URL;
}

export function withQuery(url: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `${url}${url.includes("?") ? "&" : "?"}${q}`;
}

// ---- PKCE + state --------------------------------------------------------------------

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

interface OAuthState { w: string; v: string; r: string; e: number }

export function sealState(input: { wallet: string; verifier: string; returnUrl: string }, now = Date.now(), key?: Buffer): string {
  const blob = encryptSecret({ w: input.wallet, v: input.verifier, r: input.returnUrl, e: now + STATE_TTL_MS } satisfies OAuthState, { aad: STATE_AAD, key });
  return b64url(Buffer.from(blob, "utf8"));
}

export function openState(state: string, now = Date.now(), key?: Buffer): { wallet: string; verifier: string; returnUrl: string } | null {
  try {
    const blob = Buffer.from(state.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const s = decryptSecret<OAuthState>(blob, { aad: STATE_AAD, key });
    if (!s || typeof s.w !== "string" || typeof s.v !== "string" || typeof s.e !== "number" || s.e < now) return null;
    return { wallet: s.w, verifier: s.v, returnUrl: safeReturnUrl(s.r) };
  } catch {
    return null;
  }
}

export function buildAuthUrl(cfg: GoogleConfig, opts: { redirectUri: string; state: string; challenge: string }): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

// ---- tokens -----------------------------------------------------------------------

export interface GoogleSecret { refreshToken: string; scope?: string }

async function tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(`google token ${res.status} ${String(body.error ?? "")}`) as Error & { oauthError?: string };
    err.oauthError = String(body.error ?? "");
    throw err;
  }
  return body;
}

/** Exchanges the auth code; returns the refresh token and the account email (from the id_token). */
export async function exchangeCode(cfg: GoogleConfig, opts: { code: string; verifier: string; redirectUri: string }): Promise<{
  refreshToken: string; accessToken: string; expiresIn: number; scope: string; email: string | null;
}> {
  const body = await tokenRequest({
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: opts.verifier,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: opts.redirectUri,
  });
  if (typeof body.refresh_token !== "string") throw new Error("google: no refresh_token");
  let email: string | null = null;
  if (typeof body.id_token === "string") {
    try {
      const payload = JSON.parse(Buffer.from(body.id_token.split(".")[1] ?? "", "base64").toString("utf8"));
      if (typeof payload.email === "string") email = payload.email;
    } catch { /* optional */ }
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: String(body.access_token ?? ""),
    expiresIn: Number(body.expires_in ?? 3600),
    scope: String(body.scope ?? ""),
    email,
  };
}

/** Best-effort revoke on disconnect. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST", signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}

const accessCache = new Map<string, { token: string; exp: number }>();

export class GoogleAuthError extends Error {}

async function accessTokenFor(row: ConnectorRow): Promise<string> {
  const cached = accessCache.get(row.id);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const cfg = googleConfig();
  if (!cfg) throw new GoogleAuthError(GOOGLE_DISABLED_MESSAGE);
  const secret = secretOf<GoogleSecret>(row);
  if (!secret?.refreshToken) throw new GoogleAuthError("Google ist nicht verbunden.");
  try {
    const body = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: secret.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    const token = String(body.access_token ?? "");
    accessCache.set(row.id, { token, exp: Date.now() + Number(body.expires_in ?? 3600) * 1000 });
    return token;
  } catch (err) {
    if ((err as { oauthError?: string }).oauthError === "invalid_grant") {
      await updateConnector(row.wallet, row.id, {
        status: "error", lastError: "Der Google-Zugriff wurde widerrufen. Bitte neu verbinden.",
      }).catch(() => {});
      throw new GoogleAuthError("Der Google-Zugriff wurde widerrufen. Der Mensch muss Google in den Verbindungen neu verbinden.");
    }
    throw err;
  }
}

async function googleApi<T>(row: ConnectorRow, url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessTokenFor(row);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Google-API-Fehler: ${String(msg).slice(0, 200)}`);
  }
  return body as T;
}

// ---- pure helpers (tested) ---------------------------------------------------------

/** RFC 2047 encoded-word for non-ASCII header values. */
export function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ");
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function parseRecipients(raw: string): string[] {
  const list = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.length > 10 || !list.every((e) => EMAIL.test(e))) throw new Error("Ungültige Empfängeradresse.");
  return list;
}

/** base64url RFC 822 message for the Gmail drafts API. */
export function buildRawEmail(input: { to: string[]; subject: string; body: string }): string {
  const msg = [
    `To: ${input.to.join(", ")}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ].join("\r\n");
  return b64url(Buffer.from(msg, "utf8"));
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?)?$/;

/** "2026-10-01" | "2026-10-01T18:00" (Berlin wall time) | full ISO with offset → Date. */
export function parseBerlinTime(raw: string): Date {
  const m = raw.trim().match(LOCAL);
  if (m) return zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error(`Ungültige Zeitangabe: ${raw.slice(0, 40)}`);
  return d;
}

export const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function clip(value: unknown): unknown {
  const s = JSON.stringify(value);
  if (s.length <= OUTPUT_MAX) return value;
  return { gekuerzt: true, daten: `${s.slice(0, OUTPUT_MAX)}…` };
}

function driveQuery(text: string): string {
  const esc = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `(name contains '${esc}' or fullText contains '${esc}') and trashed = false`;
}

// ---- tools -----------------------------------------------------------------------

const gmailSearchInput = z.object({
  query: z.string().min(1).max(300).describe("Gmail-Suchausdruck, z. B. 'from:stadt newer_than:7d' oder 'Rechnung'"),
  max: z.number().int().min(1).max(10).optional().describe("Anzahl Treffer (Standard 5)"),
});
const gmailDraftInput = z.object({
  to: z.string().min(3).max(500).describe("Empfänger-E-Mail(s), durch Komma getrennt"),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000).describe("Klartext der E-Mail"),
});
const calListInput = z.object({
  from: z.string().max(40).optional().describe("Beginn, z. B. 2026-10-01 oder 2026-10-01T08:00 (Berliner Zeit); Standard jetzt"),
  to: z.string().max(40).optional().describe("Ende; Standard 7 Tage nach Beginn"),
  query: z.string().max(200).optional().describe("Optionaler Suchtext"),
  max: z.number().int().min(1).max(25).optional(),
});
const calCreateInput = z.object({
  title: z.string().min(1).max(200),
  start: z.string().min(10).max(40).describe("2026-10-01T18:00 (Berliner Zeit) oder 2026-10-01 für ganztägig"),
  end: z.string().min(10).max(40).optional().describe("Ende; Standard 1 Stunde nach Beginn bzw. ganztägig"),
  location: z.string().max(300).optional(),
  description: z.string().max(4000).optional(),
});
const driveSearchInput = z.object({
  query: z.string().min(1).max(200).describe("Suchbegriff (Dateiname oder Inhalt)"),
  max: z.number().int().min(1).max(20).optional(),
});

type GmailList = { messages?: { id: string; threadId: string }[] };
type GmailMsg = { id: string; threadId: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } };

function fmtBerlin(d: Date): string {
  return d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
}

/** The five Google tools bound to one connector row. */
export function googleTools(row: ConnectorRow): HarnessTool[] {
  const G = "https://gmail.googleapis.com/gmail/v1/users/me";
  const C = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

  const gmailSearch: HarnessTool<z.infer<typeof gmailSearchInput>> = {
    name: "google_gmail_search",
    pack: "connectors",
    risk: "read",
    description: "Durchsucht das verbundene Gmail-Postfach des Menschen (Absender, Betreff, Datum, Vorschau). Nur lesen.",
    inputSchema: gmailSearchInput,
    summarize: ({ query }) => `Gmail durchsuchen: „${query.slice(0, 60)}“`,
    execute: async ({ query, max }) => {
      const list = await googleApi<GmailList>(row, `${G}/messages?${new URLSearchParams({ q: query, maxResults: String(max ?? 5) })}`);
      const ids = (list.messages ?? []).slice(0, max ?? 5);
      const mails = await Promise.all(ids.map(async ({ id }) => {
        const m = await googleApi<GmailMsg>(row, `${G}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
        const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? null;
        return { id: m.id, von: h("from"), betreff: h("subject"), datum: h("date"), vorschau: m.snippet ?? "" };
      }));
      return clip({ treffer: mails.length, mails });
    },
  };

  const gmailDraft: HarnessTool<z.infer<typeof gmailDraftInput>> = {
    name: "google_gmail_draft",
    pack: "connectors",
    risk: "external",
    description: "Legt im Gmail des Menschen einen E-Mail-Entwurf an (wird NICHT gesendet). Braucht die Freigabe des Menschen.",
    inputSchema: gmailDraftInput,
    summarize: ({ to, subject }) => `Gmail-Entwurf an ${to.slice(0, 60)}: „${subject.slice(0, 60)}“`,
    preview: ({ to, subject, body }) => ({
      kind: "email", fields: [{ label: "An", value: to }, { label: "Betreff", value: subject }], body,
    }),
    execute: async ({ to, subject, body }) => {
      const raw = buildRawEmail({ to: parseRecipients(to), subject, body });
      const res = await googleApi<{ id: string }>(row, `${G}/drafts`, { method: "POST", body: JSON.stringify({ message: { raw } }) });
      return { ok: true, entwurfId: res.id, hinweis: "Entwurf liegt in Gmail unter „Entwürfe“ und wurde nicht gesendet." };
    },
  };

  const calendarList: HarnessTool<z.infer<typeof calListInput>> = {
    name: "google_calendar_list",
    pack: "connectors",
    risk: "read",
    description: "Listet Termine aus dem verbundenen Google-Kalender (Hauptkalender) in einem Zeitraum.",
    inputSchema: calListInput,
    summarize: () => "Google-Kalender lesen",
    execute: async ({ from, to, query, max }) => {
      const start = from ? parseBerlinTime(from) : new Date();
      const end = to ? parseBerlinTime(to) : new Date(start.getTime() + 7 * 86_400_000);
      const p = new URLSearchParams({
        timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime",
        maxResults: String(max ?? 15), timeZone: "Europe/Berlin",
      });
      if (query) p.set("q", query);
      type Ev = { id: string; summary?: string; location?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
      const res = await googleApi<{ items?: Ev[] }>(row, `${C}?${p}`);
      return clip({
        termine: (res.items ?? []).map((e) => ({
          titel: e.summary ?? "(ohne Titel)",
          beginn: e.start?.dateTime ? fmtBerlin(new Date(e.start.dateTime)) : e.start?.date ?? null,
          ende: e.end?.dateTime ? fmtBerlin(new Date(e.end.dateTime)) : e.end?.date ?? null,
          ort: e.location ?? null,
          link: e.htmlLink ?? null,
        })),
      });
    },
  };

  const calendarCreate: HarnessTool<z.infer<typeof calCreateInput>> = {
    name: "google_calendar_create",
    pack: "connectors",
    risk: "external",
    description: "Trägt einen Termin in den verbundenen Google-Kalender ein (Berliner Zeit). Braucht die Freigabe des Menschen.",
    inputSchema: calCreateInput,
    summarize: ({ title, start }) => `Google-Termin „${title.slice(0, 60)}“ am ${start}`,
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
      let startField: Record<string, string>;
      let endField: Record<string, string>;
      if (isDateOnly(start)) {
        startField = { date: start.trim() };
        endField = { date: end && isDateOnly(end) ? nextDay(end.trim()) : nextDay(start.trim()) };
      } else {
        const s = parseBerlinTime(start);
        const e = end ? parseBerlinTime(end) : new Date(s.getTime() + 3_600_000);
        if (e.getTime() <= s.getTime()) throw new Error("Das Ende liegt vor dem Beginn.");
        startField = { dateTime: s.toISOString(), timeZone: "Europe/Berlin" };
        endField = { dateTime: e.toISOString(), timeZone: "Europe/Berlin" };
      }
      const res = await googleApi<{ id: string; htmlLink?: string }>(row, C, {
        method: "POST",
        body: JSON.stringify({ summary: title, location, description, start: startField, end: endField }),
      });
      return { ok: true, terminId: res.id, link: res.htmlLink ?? null };
    },
  };

  const driveSearch: HarnessTool<z.infer<typeof driveSearchInput>> = {
    name: "google_drive_search",
    pack: "connectors",
    risk: "read",
    description: "Sucht Dateien im verbundenen Google Drive (Name und Inhalt). Gibt Name, Typ, Änderungsdatum und Link zurück.",
    inputSchema: driveSearchInput,
    summarize: ({ query }) => `Google Drive durchsuchen: „${query.slice(0, 60)}“`,
    execute: async ({ query, max }) => {
      const p = new URLSearchParams({
        q: driveQuery(query), pageSize: String(max ?? 10),
        fields: "files(id,name,mimeType,modifiedTime,webViewLink)", orderBy: "modifiedTime desc",
      });
      type F = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string };
      const res = await googleApi<{ files?: F[] }>(row, `https://www.googleapis.com/drive/v3/files?${p}`);
      return clip({
        dateien: (res.files ?? []).map((f) => ({
          name: f.name, typ: f.mimeType, geaendert: f.modifiedTime ? fmtBerlin(new Date(f.modifiedTime)) : null, link: f.webViewLink ?? null,
        })),
      });
    },
  };

  return [gmailSearch, gmailDraft, calendarList, calendarCreate, driveSearch] as HarnessTool[];
}

export const GOOGLE_TOOL_NAMES = [
  "google_gmail_search", "google_gmail_draft", "google_calendar_list", "google_calendar_create", "google_drive_search",
] as const;
