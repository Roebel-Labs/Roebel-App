// Chat session for the workspace: token storage + API base.
// Token: Windows keeps it encrypted via main's safeStorage (DPAPI, silent). macOS uses the app's own
// storage: an unsigned build would make the keychain ask for the computer's login password on every
// new version, and on a borrowed laptop nobody knows it (Max, 2026-11-12). Older shells: localStorage.
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
  const studio = (globalThis as { window?: { studio?: { secrets?: Secrets; ui?: { platform?: string } } } }).window?.studio;
  if (studio?.ui?.platform === 'darwin') return null; // no keychain prompt on macOS
  const s = studio?.secrets;
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
    const fromSecrets = s ? await s.get(KEY).catch(() => null) : null;
    return parseSession(fromSecrets ?? globalThis.localStorage?.getItem(KEY));
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  const raw = JSON.stringify(session);
  const s = secrets();
  try {
    if (s && (await s.set(KEY, raw).catch(() => false))) return;
    globalThis.localStorage?.setItem(KEY, raw);
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
