// Client for the mini-app builder API on roebel.app (templates, generate stream, manifest,
// publish, content seeding). Auth = the Studio pairing session (Bearer), which the backend
// accepts as the developer identity since main 2cb3a36c.
import { t } from '../i18n';
import { apiBase } from '../workspace/session';

export class BuilderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface TemplateCard {
  id: string;
  title: string;
  summary: string;
  group: string;
  recommended?: boolean;
  thumbnailSvg: string;
  suggestions: string[];
}

export interface TemplateGroup {
  id: string;
  label: string;
}

export interface CmsSeed {
  key: string;
  beschreibung: string;
  beispiel: unknown;
}

export interface TemplateFull extends TemplateCard {
  html: string;
  cms: CmsSeed[];
}

export interface ManifestDraft {
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  permissions: string[];
  primaryColor: string;
  /** Version 2: the org the app belongs to, and whom it is for. */
  org?: string;
  audience?: { mode: 'required' | 'recommended'; anyOf: string[] };
}

export interface ManagedOrg {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin';
}

/** Organisations the signed-in account owns or administers. */
export const fetchMyOrgs = (token: string) => request<{ orgs: ManagedOrg[] }>('/api/chat/my-orgs', { token }).then((r) => r.orgs);

/** Whether membership credentials are switched on (needed for "Nur für Mitglieder"). */
export async function credentialsLive(): Promise<boolean> {
  try {
    const r = await request<{ enabled?: boolean; configured?: boolean }>('/api/credentials/status');
    return r.enabled === true && r.configured === true;
  } catch {
    return false;
  }
}

/** The manifest's org/audience fields for a choice in the publish sheet. */
export function audienceFor(org: string | null, mode: 'recommended' | 'required'): Pick<ManifestDraft, 'org' | 'audience'> {
  if (!org) return { org: undefined, audience: undefined };
  return { org, audience: { mode, anyOf: [`org:${org}`] } };
}

export interface PublishResult {
  ok: boolean;
  slug: string;
  homeUrl: string;
  republished?: boolean;
}

export interface BuildTurn {
  role: 'user' | 'assistant';
  content: string;
}

async function request<T>(path: string, init: { method?: string; token?: string; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  } catch {
    throw new BuilderApiError(0, 'network', t('Server nicht erreichbar. Internetverbindung prüfen.'));
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new BuilderApiError(res.status, String(body?.code ?? 'failed'), errorText(body, res.status));
  return body as T;
}

/** The mini-apps API answers `{ error: string, code }`; publish answers `{ ok:false, error, errorCode }`. */
export function errorText(body: Record<string, unknown> | null, status: number): string {
  const code = String(body?.errorCode ?? body?.code ?? '');
  if (code === 'slug_taken' || code === 'slug_reserved') return t('Dieser Kurzname ist schon vergeben. Wähle einen anderen.');
  if (status === 429 || code === 'rate_limited') return typeof body?.error === 'string' ? body.error : t('Zu viele Anfragen. Bitte später noch einmal versuchen.');
  if (typeof body?.error === 'string' && body.error && !/^[a-z_]+$/.test(body.error)) return body.error;
  return t('Fehler {status}', { status });
}

export const fetchTemplates = () => request<{ groups: TemplateGroup[]; templates: TemplateCard[] }>('/api/mini-apps/templates');

export const fetchTemplate = (id: string) =>
  request<{ template: TemplateFull }>(`/api/mini-apps/templates/${encodeURIComponent(id)}`).then((r) => r.template);

export const draftManifest = (token: string, html: string, idea?: string) =>
  request<{ manifest: ManifestDraft }>('/api/mini-apps/manifest', { token, json: { html, idea } }).then((r) => r.manifest);

export const publishApp = (token: string, html: string, manifest: ManifestDraft) =>
  request<PublishResult>('/api/mini-apps/publish', { token, json: { html, manifest } });

/** Best effort: seeds the template's Inhalte after a FRESH publish (never on republish). */
export async function seedContent(token: string, slug: string, seeds: CmsSeed[]): Promise<number> {
  let ok = 0;
  for (const s of seeds) {
    try {
      await request('/api/mini-apps/data', { token, json: { app: slug, scope: 'app', key: s.key, value: s.beispiel ?? null } });
      ok++;
    } catch {
      /* the Inhalte page in the dashboard can add keys any time */
    }
  }
  return ok;
}

/** Latest stored HTML of one of the user's own AI-built apps (to keep editing it). */
export async function fetchAppSource(id: string): Promise<{ html: string; manifest: ManifestDraft } | null> {
  const r = await request<{
    app: {
      name: string;
      slug: string;
      description: string | null;
      category: string;
      tags: string[] | null;
      permissions: string[] | null;
      primary_color: string | null;
      org_account_id?: string | null;
      audience?: { mode: 'required' | 'recommended'; anyOf: string[] } | null;
    };
    versions?: { html?: string | null }[];
  }>(`/api/mini-apps/${encodeURIComponent(id)}`);
  const html = r.versions?.find((v) => typeof v.html === 'string' && v.html.length > 0)?.html;
  if (!html) return null;
  const a = r.app;
  return {
    html,
    manifest: {
      name: a.name,
      slug: a.slug,
      description: a.description ?? '',
      category: a.category ?? 'utility',
      tags: (a.tags ?? []).slice(0, 5),
      permissions: a.permissions ?? [],
      primaryColor: a.primary_color ?? '#00498B',
      ...(a.org_account_id ? { org: a.org_account_id } : {}),
      ...(a.audience ? { audience: a.audience } : {}),
    },
  };
}

// ---- generate stream (protocol 2, NDJSON frames) ------------------------------------------

export interface StreamFrame {
  t: string;
  v?: string;
}

/** Incremental NDJSON parser: feed decoded chunks, get one callback per frame. */
export function makeFrameParser(onFrame: (f: StreamFrame) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    for (;;) {
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onFrame(JSON.parse(line) as StreamFrame);
      } catch {
        /* skip a malformed frame */
      }
    }
  };
}

export function stripFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:html)?\s*\n/i);
  if (fence) s = s.slice(fence[0].length);
  if (s.endsWith('```')) s = s.slice(0, -3).trimEnd();
  return s;
}

/** Splits the finished stream into the document and the NOTES comment; null html = unusable. */
export function extractResult(raw: string): { html: string | null; notes: string; truncated?: boolean } {
  const s = stripFences(raw);
  const m = s.match(/<!--\s*NOTES:?\s*([\s\S]*?)-->\s*$/i);
  const notes = m ? m[1].trim() : '';
  const html = m ? s.slice(0, m.index).trimEnd() : s;
  const head = html.slice(0, 200).toLowerCase();
  const looksLikeHtml = head.includes('<!doctype html') || head.startsWith('<html');
  if (looksLikeHtml && !/<\/html\s*>/i.test(html.slice(-400))) return { html: null, notes, truncated: true };
  return { html: looksLikeHtml ? html : null, notes };
}

export interface GenerateCallbacks {
  onPhase: (phase: 'vision' | 'code' | 'thinking') => void;
  onHtml: (soFar: string) => void;
  onThink: (soFar: string) => void;
}

/** Streams one build. Resolves with the raw document text and the finish reason. */
export async function generateApp(
  token: string,
  body: { messages: BuildTurn[]; html?: string; complexity?: 'default' | 'hard' },
  cb: GenerateCallbacks,
  signal: AbortSignal,
): Promise<{ raw: string; finish: string }> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/mini-apps/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, protocol: 2 }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new BuilderApiError(0, 'network', t('Server nicht erreichbar. Internetverbindung prüfen.'));
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    throw new BuilderApiError(res.status, String(j?.code ?? 'failed'), errorText(j, res.status));
  }
  let raw = '';
  let think = '';
  let finish = '';
  let serverError = '';
  const feed = makeFrameParser((f) => {
    if (f.t === 'html' && f.v) {
      raw += f.v;
      cb.onHtml(stripFences(raw));
    } else if (f.t === 'think' && f.v) {
      think += f.v;
      cb.onThink(think);
    } else if (f.t === 'status' && (f.v === 'vision' || f.v === 'code')) {
      cb.onPhase(f.v);
    } else if (f.t === 'done') {
      finish = f.v ?? '';
    } else if (f.t === 'error' && f.v) {
      serverError = f.v;
    }
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    feed(decoder.decode(value, { stream: true }));
  }
  feed('\n');
  // The model call failed on the server (no balance, overloaded, …): say why.
  if (serverError && !raw.trim()) throw new BuilderApiError(503, 'provider', serverError);
  return { raw, finish };
}

/**
 * Preview document for an iframe srcdoc: relative URLs (fonts) resolve against roebel.app.
 * Without a host the SDK runs in mock mode, so the app behaves like in the browser preview.
 */
export function previewDoc(html: string, base = apiBase()): string {
  const tag = `<base href="${base.replace(/\/+$/, '')}/">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : tag + html;
}

/** Screens a document declares (`section[data-screen]`), for the stage indicator. */
export function screensOf(html: string): { slug: string; title: string }[] {
  return [...html.matchAll(/<section[^>]*\bdata-screen="([a-z0-9-]+)"[^>]*>/g)].map((m) => ({
    slug: m[1],
    title: /data-title="([^"]*)"/.exec(m[0])?.[1] ?? m[1],
  }));
}

// ---- owner view of an app's collections (bookings, check-ins, sign-ups) ----------------

export interface OwnerRow {
  id: string;
  key: string | null;
  data: Record<string, unknown>;
  privateData?: Record<string, unknown> | null;
  mine: boolean;
  createdAt: string;
}

export interface CollectionInfo {
  collection: string;
  scope: 'shared' | 'private';
  rows: number;
}

export const fetchCollections = (token: string, appId: string) =>
  request<{ collections: CollectionInfo[] }>(`/api/mini-apps/rows?app=${encodeURIComponent(appId)}&collections=1`, { token }).then((r) => r.collections);

export const fetchOwnerRows = (token: string, appId: string, collection: string) =>
  request<{ rows: OwnerRow[]; total: number }>('/api/mini-apps/rows', {
    token,
    json: { app: appId, op: 'list', collection, scope: 'shared', query: { order: 'newest', limit: 200 } },
  });

export const removeOwnerRow = (token: string, appId: string, collection: string, id: string) =>
  request<{ ok: boolean }>('/api/mini-apps/rows', { token, json: { app: appId, op: 'remove', collection, scope: 'shared', id } });

/** Flattens rows into columns for the table and CSV: key, every data field, every private field. */
export function rowTable(rows: OwnerRow[]): { columns: string[]; cells: string[][] } {
  const dataCols: string[] = [];
  const privCols: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r.data ?? {})) if (!dataCols.includes(k)) dataCols.push(k);
    for (const k of Object.keys(r.privateData ?? {})) if (!privCols.includes(k)) privCols.push(k);
  }
  const show = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return {
    columns: ['Schlüssel', ...dataCols, ...privCols.map((c) => `${c} (privat)`), 'Erstellt'],
    cells: rows.map((r) => [
      r.key ?? '',
      ...dataCols.map((c) => show(r.data?.[c])),
      ...privCols.map((c) => show(r.privateData?.[c])),
      new Date(r.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }),
    ]),
  };
}

/** RFC 4180 CSV (semicolon for German Excel), BOM so umlauts open correctly. */
export function toCsv(columns: string[], cells: string[][]): string {
  const q = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + [columns.map(q), ...cells.map((r) => r.map(q))].map((r) => r.join(';')).join('\r\n');
}
