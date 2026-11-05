// Operator API (POST /api/live/admin, `Authorization: Studio <token>`) and public REST reads.
// The token is only ever placed in the Authorization header; it is never logged or echoed in errors.

import { API_BASE, CHAT_COLUMNS, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { ChatMessage, LiveShow, RundownItem, VoteResults } from './types';

export class LiveApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type NetRequest = { url: string; method: string; headers: Record<string, string>; body?: string };
type NetResponse = { status: number; json: unknown };

/** Optional main-process proxy (`window.studio.net.request`), used when present; plain fetch otherwise. */
function netBridge(): ((r: NetRequest) => Promise<NetResponse>) | null {
  const s = (globalThis as { window?: { studio?: { net?: { request?: unknown } } } }).window?.studio;
  const fn = s?.net?.request;
  return typeof fn === 'function' ? (fn as (r: NetRequest) => Promise<NetResponse>) : null;
}

async function request(r: NetRequest, timeoutMs = 15000): Promise<NetResponse> {
  const bridge = netBridge();
  if (bridge) return bridge(r);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body, signal: ctl.signal });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new LiveApiError('TIMEOUT', 'Keine Antwort vom Server (Zeitüberschreitung).', 0);
    throw new LiveApiError('NETWORK', 'Server nicht erreichbar. Internetverbindung prüfen.', 0);
  } finally {
    clearTimeout(t);
  }
}

function unwrap<T>(res: NetResponse): T {
  const j = res.json as { ok?: boolean; data?: T; code?: string; message?: string } | null;
  if (j && j.ok === true) return j.data as T;
  if (res.status === 401) throw new LiveApiError('UNAUTHORIZED', 'Studio-Schlüssel ungültig oder auf dem Server nicht gesetzt.', 401);
  throw new LiveApiError(j?.code ?? 'FAILED', j?.message ?? `Fehler ${res.status}`, res.status);
}

export async function adminCall<T = unknown>(token: string, showId: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!token) throw new LiveApiError('NO_TOKEN', 'Bitte zuerst den Studio-Schlüssel eintragen.', 0);
  const res = await request({
    url: `${API_BASE}/api/live/admin`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Studio ${token}` },
    body: JSON.stringify({ ...extra, action, show_id: showId }),
  });
  return unwrap<T>(res);
}

export async function fetchResults(slug: string): Promise<VoteResults> {
  const res = await request({ url: `${API_BASE}/api/live/${encodeURIComponent(slug)}/results`, method: 'GET', headers: {} });
  return unwrap<VoteResults>(res);
}

async function rest<T>(path: string): Promise<T> {
  const res = await request({
    url: `${SUPABASE_URL}/rest/v1/${path}`,
    method: 'GET',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (res.status >= 400 || !Array.isArray(res.json)) throw new LiveApiError('REST', `Lesen fehlgeschlagen (${res.status})`, res.status);
  return res.json as T;
}

export const fetchShows = () => rest<LiveShow[]>('live_shows?select=*&order=starts_at.desc.nullslast');
export const fetchShow = (id: string) => rest<LiveShow[]>(`live_shows?select=*&id=eq.${id}`).then((r) => r[0] ?? null);
export const fetchRundown = (showId: string) =>
  rest<RundownItem[]>(`live_rundown_items?select=*&show_id=eq.${showId}&order=position.asc`);
/** Newest messages first from the server; returned oldest → newest. */
export const fetchChat = (showId: string, since?: string) =>
  rest<ChatMessage[]>(
    `live_chat_messages?select=${CHAT_COLUMNS}&show_id=eq.${showId}` +
      (since ? `&created_at=gte.${encodeURIComponent(since)}` : '') +
      '&order=created_at.desc&limit=200',
  ).then((r) => r.reverse());

export function errorMessage(e: unknown): string {
  if (e instanceof LiveApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
