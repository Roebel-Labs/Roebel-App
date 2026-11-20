// Event requests: an event found for an organisation waits for its owners to publish it.
// Client for /api/event-requests (Bearer chat session, same auth as the assistant chat).
import { clearChatSession, ensureChatSession } from '@/lib/chat/session';
import { getApiBaseUrl, type SigningAccount } from '@/lib/signed-request';

const REQUEST_TIMEOUT_MS = 20_000;

export type EventRequestStatus = 'pending_org' | 'published_org' | 'published_default' | 'team_review' | 'rejected';

export interface EventRequest {
  id: string;
  status: EventRequestStatus;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  location: string;
  category: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  organizerName: string | null;
  accountName: string | null;
  source: 'forward' | 'crawl';
  sourceUrl: string | null;
  expiresAt: string;
  eventId: string | null;
  canDecide: boolean;
}

export interface EventRequestEdits {
  title?: string;
  description?: string;
  date?: string;
  time?: string | null;
  location?: string;
}

export type DecisionOutcome = { status: 'published_org'; eventId: string } | { status: 'rejected' };

export class EventRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EventRequestError';
    this.code = code;
  }
}

async function call<T>(account: SigningAccount, method: 'GET' | 'POST', path: string, json?: unknown): Promise<T> {
  const attempt = async (token: string) => {
    // fetch in React Native never times out on its own.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: json !== undefined ? JSON.stringify(json) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      return { status: res.status, ok: res.ok, text };
    } finally {
      clearTimeout(timer);
    }
  };
  let res: { status: number; ok: boolean; text: string };
  try {
    res = await attempt(await ensureChatSession(account));
    if (res.status === 401) {
      await clearChatSession(account.address);
      res = await attempt(await ensureChatSession(account, { force: true }));
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new EventRequestError('timeout', 'Der Server antwortet gerade nicht. Bitte versuche es erneut.');
    }
    if (err instanceof Error && err.name === 'ChatSessionError') throw new EventRequestError('unauthorized', err.message);
    throw new EventRequestError('network', 'Keine Verbindung. Bitte prüfe dein Internet.');
  }
  let parsed: unknown = null;
  try {
    parsed = res.text ? JSON.parse(res.text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const error = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
    throw new EventRequestError(error?.code ?? `http_${res.status}`, error?.message ?? 'Es ist ein Fehler aufgetreten.');
  }
  return parsed as T;
}

export async function fetchEventRequest(account: SigningAccount, id: string): Promise<EventRequest> {
  const res = await call<{ request: EventRequest }>(account, 'GET', `/api/event-requests/${encodeURIComponent(id)}`);
  return res.request;
}

export function decideEventRequest(
  account: SigningAccount, id: string, decision: 'publish' | 'reject', edits?: EventRequestEdits,
): Promise<DecisionOutcome> {
  return call<DecisionOutcome>(account, 'POST', `/api/event-requests/${encodeURIComponent(id)}`, { decision, edits });
}

/** "Freitag, 20. November 2026" from YYYY-MM-DD; the input unchanged when it is not a date. */
export function formatRequestDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "TT.MM.JJJJ" typed by a person → YYYY-MM-DD, or null. */
export function parseGermanDate(input: string): string | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(input);
  if (!m) return null;
  const day = +m[1], month = +m[2], year = +m[3];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toGermanDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : date;
}
