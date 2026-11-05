// Live room (DanceCup 2026 first): app-native livestream with chat, reactions, Unterstützen and
// Publikumsliebling. Spec: docs/superpowers/specs/2026-11-05-live-room-design.md.
// Public reads go straight to Supabase (anon); chat / vote / remind go through the web API with a
// short-lived "Live" token obtained once per show via one signed request (live_session).
// Everything here degrades to null / [] when the tables or routes do not exist yet.
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getApiBaseUrl, postSigned, LIVE_SCOPE, type ApiResult, type SigningAccount } from './signed-request';

export type LiveStatus = 'scheduled' | 'live' | 'ended';
export type RundownStatus = 'upcoming' | 'on_stage' | 'done';
export type ChatKind = 'chat' | 'support' | 'system';

export interface LiveOverlay {
  lower_third?: boolean; next_up?: boolean; bug?: boolean; qr?: boolean; poll?: boolean; alerts?: boolean;
  reactions?: boolean; featured_message_id?: string | null; message?: string | null;
}

export interface LiveShow {
  id: string; slug: string; event_id: string | null; title: string; subtitle: string | null; status: LiveStatus;
  hls_url: string | null; replay_url: string | null; poster_url: string | null; starts_at: string | null;
  current_item_id: string | null; chat_enabled: boolean; slow_mode_seconds: number; voting_open: boolean;
  overlay: LiveOverlay | null; updated_at: string | null;
  /** Part 2 columns: may be missing on rows/DBs from before the migration (treat undefined as false / true). */
  is_test?: boolean; guests_enabled?: boolean;
}

export interface RundownItem {
  id: string; show_id: string; position: number; title: string; subtitle: string | null; detail: string | null;
  org_account_id: string | null; image_url: string | null; planned_at: string | null; status: RundownStatus;
  on_stage_at: string | null;
}

export interface ChatMessage {
  id: string; show_id: string; display_name: string | null; avatar_url: string | null; body: string;
  kind: ChatKind; amount_cents: number | null; created_at: string; hidden_at: string | null; featured_at: string | null;
}

export interface LiveSession { token: string; expires_at: string; display_name: string | null; avatar_url: string | null }
export interface VoteResult { item_id: string; title: string; subtitle: string | null; votes: number }
export interface VoteResults { voting_open: boolean; total: number; items: VoteResult[] }
export interface MyLiveState { vote_item_id: string | null; reminder_item_ids: string[] }

export const LIVE_REACTIONS = ['❤️', '🔥', '👏', '💃', '🎉'] as const;
export type LiveReaction = (typeof LIVE_REACTIONS)[number];

export const CHAT_MAX_LENGTH = 280;
export const SUPPORT_MESSAGE_MAX = 140;
export const SUPPORT_MIN_CENTS = 100;
export const SUPPORT_MAX_CENTS = 50000;
const CHAT_HISTORY = 80;
const REQUEST_TIMEOUT_MS = 15000;

// Tables are newer than the generated Supabase types: untyped client, rows cast below.
const db = supabase as any;

// `*` rather than a column list: the Part 2 columns (is_test, guests_enabled) may not exist yet, and naming a
// missing column fails the whole select.
const SHOW_COLUMNS = '*';
const ITEM_COLUMNS = 'id, show_id, position, title, subtitle, detail, org_account_id, image_url, planned_at, status, on_stage_at';
const CHAT_COLUMNS = 'id, show_id, display_name, avatar_url, body, kind, amount_cents, created_at, hidden_at, featured_at';

// ─── Reads ─────────────────────────────────────────────────

export async function fetchShow(slug: string): Promise<{ show: LiveShow; rundown: RundownItem[] } | null> {
  try {
    const { data: show, error } = await db.from('live_shows').select(SHOW_COLUMNS).eq('slug', slug).maybeSingle();
    if (error || !show) return null;
    const rundown = await fetchRundown(show.id);
    return { show: show as LiveShow, rundown };
  } catch {
    return null;
  }
}

export async function fetchRundown(showId: string): Promise<RundownItem[]> {
  try {
    const { data } = await db.from('live_rundown_items').select(ITEM_COLUMNS).eq('show_id', showId).order('position');
    return (data ?? []) as RundownItem[];
  } catch {
    return [];
  }
}

/** The latest messages, oldest first. */
export async function fetchChat(showId: string): Promise<ChatMessage[]> {
  try {
    const { data } = await db.from('live_chat_messages').select(CHAT_COLUMNS)
      .eq('show_id', showId).is('hidden_at', null)
      .order('created_at', { ascending: false }).limit(CHAT_HISTORY);
    return ((data ?? []) as ChatMessage[]).reverse();
  } catch {
    return [];
  }
}

export async function fetchShowSlugForEvent(eventId: string): Promise<string | null> {
  try {
    const { data, error } = await db.from('live_shows').select('slug').eq('event_id', eventId)
      .order('starts_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return (data as { slug: string }).slug ?? null;
  } catch {
    return null;
  }
}

/** Slug of the live room for this event, or null (no show / table missing). */
export function useLiveShowForEvent(eventId: string | null | undefined): string | null {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSlug(null);
    if (!eventId) return;
    void fetchShowSlugForEvent(eventId).then((s) => { if (alive) setSlug(s); });
    return () => { alive = false; };
  }, [eventId]);
  return slug;
}

// ─── Realtime: table changes ─────────────────────────────────

export interface LiveDbHandlers {
  onShow?: (show: LiveShow) => void;
  onItem?: (item: RundownItem, event: 'INSERT' | 'UPDATE' | 'DELETE', oldId?: string) => void;
  onChatInsert?: (msg: ChatMessage) => void;
  onChatUpdate?: (msg: ChatMessage) => void;
  /** Called after a (re)subscribe, so the screen can refetch what it missed while disconnected. */
  onResubscribed?: () => void;
}

export function subscribeShowChanges(showId: string, h: LiveDbHandlers): () => void {
  let channel: RealtimeChannel | null = null;
  let subscribedOnce = false;
  try {
    channel = supabase
      .channel(`live-db:${showId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'live_shows', filter: `id=eq.${showId}` },
        (p: any) => { if (p?.new) h.onShow?.(p.new as LiveShow); })
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'live_rundown_items', filter: `show_id=eq.${showId}` },
        (p: any) => {
          const ev = p?.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          if (ev === 'DELETE') { if (p?.old?.id) h.onItem?.(p.old as RundownItem, 'DELETE', p.old.id); return; }
          if (p?.new) h.onItem?.(p.new as RundownItem, ev);
        })
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'live_chat_messages', filter: `show_id=eq.${showId}` },
        (p: any) => { if (p?.new) h.onChatInsert?.(p.new as ChatMessage); })
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'live_chat_messages', filter: `show_id=eq.${showId}` },
        (p: any) => { if (p?.new) h.onChatUpdate?.(p.new as ChatMessage); })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (subscribedOnce) h.onResubscribed?.();
          subscribedOnce = true;
        }
      });
  } catch {
    channel = null;
  }
  return () => { if (channel) void supabase.removeChannel(channel); };
}

// ─── Realtime: presence + reactions ───────────────────────────

export interface LiveRoomChannel {
  sendReaction: (e: LiveReaction) => boolean;
  close: () => void;
}

const REACT_WINDOW_MS = 1000;
const REACT_MAX_PER_WINDOW = 4;

/** `live:<show_id>`: presence for the viewer count, broadcast `react` for reactions (≤ 4/s sent). */
export function joinLiveRoom(
  showId: string,
  handlers: { onViewers?: (n: number) => void; onReaction?: (e: LiveReaction) => void },
): LiveRoomChannel {
  const key = `d${Math.random().toString(36).slice(2, 12)}`;
  const sentAt: number[] = [];
  let channel: RealtimeChannel | null = null;
  try {
    channel = supabase.channel(`live:${showId}`, { config: { presence: { key }, broadcast: { self: false } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = channel?.presenceState() ?? {};
          handlers.onViewers?.(Object.keys(state).length);
        } catch { /* ignore */ }
      })
      .on('broadcast', { event: 'react' }, (msg: any) => {
        const e = msg?.payload?.e;
        if (typeof e === 'string' && (LIVE_REACTIONS as readonly string[]).includes(e)) handlers.onReaction?.(e as LiveReaction);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') void channel?.track({ k: key }).catch(() => undefined);
      });
  } catch {
    channel = null;
  }
  return {
    sendReaction: (e) => {
      const now = Date.now();
      while (sentAt.length && now - sentAt[0] > REACT_WINDOW_MS) sentAt.shift();
      if (sentAt.length >= REACT_MAX_PER_WINDOW || !channel) return false;
      sentAt.push(now);
      void channel.send({ type: 'broadcast', event: 'react', payload: { e } }).catch(() => undefined);
      return true;
    },
    close: () => {
      if (!channel) return;
      const c = channel;
      channel = null;
      void c.untrack().catch(() => undefined).finally(() => { void supabase.removeChannel(c); });
    },
  };
}

// ─── HTTP helpers ─────────────────────────────────────────

/** Accepts both the `{ ok, data }` envelope (jsonOk/jsonFail) and a bare JSON body. */
async function requestJson<T>(
  path: string, init: { method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> }, timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: init.method,
      headers: { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as any;
    if (json && typeof json === 'object' && 'ok' in json) {
      if (json.ok) return { ok: true, data: (json.data ?? json) as T };
      return { ok: false, code: String(json.code ?? res.status), message: String(json.message ?? json.error ?? 'Fehler') };
    }
    if (res.ok && json) return { ok: true, data: json as T };
    return {
      ok: false,
      code: String(json?.code ?? json?.error ?? (res.status === 404 ? 'NOT_FOUND' : res.status)),
      message: String(json?.message ?? 'Das hat nicht geklappt.'),
    };
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Session token ─────────────────────────────────────────

const sessionCache = new Map<string, LiveSession>();
const sessionKey = (wallet: string, showId: string) => `live_session_${wallet.toLowerCase()}_${showId}`;
const isFresh = (s: LiveSession | null | undefined): s is LiveSession =>
  !!s && !!s.token && Date.parse(s.expires_at) - Date.now() > 60_000;

/** A cached session (memory, then SecureStore) without prompting for a signature. */
export async function peekLiveSession(wallet: string, showId: string): Promise<LiveSession | null> {
  const k = sessionKey(wallet, showId);
  const mem = sessionCache.get(k);
  if (isFresh(mem)) return mem;
  try {
    const raw = await SecureStore.getItemAsync(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveSession;
    if (isFresh(parsed)) { sessionCache.set(k, parsed); return parsed; }
    await SecureStore.deleteItemAsync(k).catch(() => undefined);
  } catch { /* ignore */ }
  return null;
}

const pendingSessions = new Map<string, Promise<ApiResult<LiveSession>>>();

/** Cached token or one signed `live_session` request (single-flight per wallet+show). */
export async function getLiveSession(account: SigningAccount, showId: string): Promise<ApiResult<LiveSession>> {
  const cached = await peekLiveSession(account.address, showId);
  if (cached) return { ok: true, data: cached };
  const k = sessionKey(account.address, showId);
  const running = pendingSessions.get(k);
  if (running) return running;
  const p = (async (): Promise<ApiResult<LiveSession>> => {
    const r = await postSigned<LiveSession>('/api/live', account, 'live_session', { show_id: showId }, LIVE_SCOPE);
    if (r.ok && r.data?.token) {
      sessionCache.set(k, r.data);
      await SecureStore.setItemAsync(k, JSON.stringify(r.data)).catch(() => undefined);
    }
    return r;
  })().finally(() => pendingSessions.delete(k));
  pendingSessions.set(k, p);
  return p;
}

export async function clearLiveSession(wallet: string, showId: string): Promise<void> {
  const k = sessionKey(wallet, showId);
  sessionCache.delete(k);
  await SecureStore.deleteItemAsync(k).catch(() => undefined);
}

// ─── Actions (token) ───────────────────────────────────────

export type LiveActBody =
  | { action: 'chat'; show_id: string; body: string }
  | { action: 'vote'; show_id: string; item_id: string }
  | { action: 'remind'; item_id: string; on: boolean }
  | { action: 'my_state'; show_id: string }
  | { action: 'guest_request'; show_id: string; note?: string }
  | { action: 'guest_status'; show_id: string; request_id: string }
  | { action: 'guest_cancel'; show_id: string; request_id: string }
  | { action: 'test_support'; show_id: string; amount_cents: number; body?: string }
  | { action: 'test_next'; show_id: string };

export function liveAct<T>(token: string, body: LiveActBody, timeoutMs?: number): Promise<ApiResult<T>> {
  return requestJson<T>('/api/live/act', { method: 'POST', body, headers: { Authorization: `Live ${token}` } }, timeoutMs);
}

/**
 * liveAct with the session handled: cached token or one signed live_session; on 401 SESSION_INVALID the
 * cached token is dropped and the session is re-created once.
 */
export async function liveActAs<T>(
  account: SigningAccount, showId: string, body: LiveActBody, timeoutMs?: number,
): Promise<ApiResult<T>> {
  const s = await getLiveSession(account, showId);
  if (!s.ok) return s;
  const r = await liveAct<T>(s.data.token, body, timeoutMs);
  if (r.ok || (r.code !== 'SESSION_INVALID' && r.code !== '401' && r.code !== 'UNAUTHORIZED')) return r;
  await clearLiveSession(account.address, showId);
  const again = await getLiveSession(account, showId);
  if (!again.ok) return again;
  return liveAct<T>(again.data.token, body, timeoutMs);
}

// ─── Phone guests ("Live dazuschalten") ─────────────────────────

export const GUEST_NOTE_MAX = 140;
export type GuestRequestStatus = 'requested' | 'accepted' | 'declined' | 'ended' | 'cancelled';
export interface GuestRequest { id: string; status: GuestRequestStatus; room: string | null; created_at: string }
export interface GuestStatus { status: GuestRequestStatus; room?: string; livekit_url?: string; token?: string }

// ─── Test show ("testlauf") ─────────────────────────────────────

export const TEST_SUPPORT_AMOUNTS = [200, 500, 1000, 2000] as const;
export const TEST_SUPPORT_LINES = [
  'Viel Erfolg euch allen!',
  'Grüße aus Röbel – ihr seid super!',
  'Toi, toi, toi für alle Gruppen!',
  'Was für ein Auftritt, Gänsehaut!',
  'Danke für die tolle Übertragung!',
  'Weiter so, wir drücken die Daumen!',
] as const;

export function randomTestSupport(): { amount_cents: number; body: string } {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
  return { amount_cents: pick(TEST_SUPPORT_AMOUNTS), body: pick(TEST_SUPPORT_LINES) };
}

/** German copy for an act error: the server's message (already German) wins, codes are the fallback. */
export function liveErrorText(code: string, serverMessage?: string): string {
  if (serverMessage && code !== 'NETWORK_ERROR' && code !== 'SIGN_FAILED' && serverMessage.length < 160 && !/^[A-Z_0-9]+$/.test(serverMessage)) {
    return serverMessage;
  }
  switch (code) {
    case 'SLOW_MODE': return 'Langsam-Modus: Bitte warte kurz vor der nächsten Nachricht.';
    case 'MUTED': return 'Du kannst in diesem Chat gerade nicht schreiben.';
    case 'CHAT_CLOSED': return 'Der Chat ist gerade geschlossen.';
    case 'VOTING_CLOSED': return 'Das Meinungsbild ist gerade geschlossen.';
    case 'GUESTS_UNAVAILABLE': return 'Dazuschalten ist noch nicht eingerichtet.';
    case 'GUESTS_CLOSED': return 'Dazuschalten ist gerade nicht möglich.';
    case 'NOT_A_TEST': return 'Nur im Testlauf möglich.';
    case 'NETWORK_ERROR': return 'Keine Verbindung. Bitte versuche es gleich noch einmal.';
    case 'SIGN_FAILED': return 'Anmeldung am Chat abgebrochen.';
    case 'UNAUTHORIZED': case '401': return 'Sitzung abgelaufen. Bitte erneut versuchen.';
    default: return 'Das hat nicht geklappt. Bitte versuche es erneut.';
  }
}

// ─── Unterstützen (Stripe Checkout) ───────────────────────────

export interface SupportInput {
  show_id: string; slug: string; amount_cents: number; display_name?: string | null; message?: string | null; show_name: boolean;
  wallet?: string | null;
}

export function startSupport(input: SupportInput): Promise<ApiResult<{ url: string; support_id: string }>> {
  const body: Record<string, unknown> = {
    show_id: input.show_id,
    amount_cents: Math.round(input.amount_cents),
    show_name: input.show_name,
    return_to: `roebel://live/${input.slug}`,
  };
  if (input.display_name?.trim()) body.display_name = input.display_name.trim().slice(0, 60);
  if (input.message?.trim()) body.message = input.message.trim().slice(0, SUPPORT_MESSAGE_MAX);
  if (input.wallet) body.wallet = input.wallet.toLowerCase();
  return requestJson('/api/live/support', { method: 'POST', body });
}

/** Stripe Checkout in the in-app browser; it closes itself on the roebel://live/<slug> return. */
export async function openSupportCheckout(url: string, slug: string): Promise<WebBrowser.WebBrowserAuthSessionResult | null> {
  try {
    return await WebBrowser.openAuthSessionAsync(url, `roebel://live/${slug}`, { showInRecents: true });
  } catch {
    return null;
  }
}

// ─── Publikumsliebling ──────────────────────────────────────

export async function fetchResults(slug: string): Promise<VoteResults | null> {
  const r = await requestJson<VoteResults>(`/api/live/${encodeURIComponent(slug)}/results`, { method: 'GET' }, 8000);
  if (!r.ok || !Array.isArray(r.data?.items)) return null;
  const items = r.data.items.map((i) => ({
    item_id: i.item_id, title: i.title, subtitle: i.subtitle ?? null, votes: Number(i.votes) || 0,
  }));
  const total = Number(r.data.total) || items.reduce((a, i) => a + i.votes, 0);
  return { voting_open: r.data.voting_open !== false, total, items };
}

// ─── Formatting ────────────────────────────────────────────

export function formatSupportAmount(cents: number | null | undefined): string {
  const c = cents ?? 0;
  return `${(c / 100).toLocaleString('de-DE', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

export function formatViewers(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)} Tsd.`;
  if (n >= 1000) return `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tsd.`;
  return String(n);
}

/** "in 2 Std. 14 Min." / "in 3:05" style countdown, or null when the start time has passed. */
export function countdownParts(startsAt: string | null, now: number): { d: number; h: number; m: number; s: number } | null {
  if (!startsAt) return null;
  const ms = Date.parse(startsAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

export function formatClock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}
