// Chat session for the workspace: token storage + API base.
// Token: the OS keychain via main's safeStorage (window.studio.secrets, installer ≥ 0.2.0); older shells
// fall back to localStorage so an interface OTA still works on them.
import { API_BASE } from '../live-room/config';

export interface StoredSession {
  token: string;
  expiresAt: string;
}

const KEY = 'ortis-studio-chat-session-v1';
/** Developer override (e.g. a Vercel preview). Only https origins are accepted. */
const API_OVERRIDE_KEY = 'ortis-studio-api-base';

type Secrets = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<boolean>; clear(key: string): Promise<boolean> };

function secrets(): Secrets | null {
  const s = (globalThis as { window?: { studio?: { secrets?: Secrets } } }).window?.studio?.secrets;
  return s && typeof s.get === 'function' ? s : null;
}

export function apiBase(): string {
  try {
    const o = globalThis.localStorage?.getItem(API_OVERRIDE_KEY);
    if (o && /^https:\/\/[a-z0-9.-]+$/i.test(o)) return o;
  } catch {
    /* storage blocked */
  }
  return API_BASE;
}

export function parseSession(raw: string | null | undefined, nowMs = Date.now()): StoredSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof s.token !== 'string' || typeof s.expiresAt !== 'string') return null;
    // Re-pair a day before the 30-day token runs out rather than failing mid-conversation.
    if (Date.parse(s.expiresAt) - 86_400_000 <= nowMs) return null;
    return { token: s.token, expiresAt: s.expiresAt };
  } catch {
    return null;
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  const s = secrets();
  try {
    return parseSession(s ? await s.get(KEY) : globalThis.localStorage?.getItem(KEY));
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  const raw = JSON.stringify(session);
  const s = secrets();
  try {
    if (s) await s.set(KEY, raw);
    else globalThis.localStorage?.setItem(KEY, raw);
  } catch {
    /* not remembered: the user pairs again next start */
  }
}

export async function clearSession(): Promise<void> {
  try {
    await secrets()?.clear(KEY);
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
