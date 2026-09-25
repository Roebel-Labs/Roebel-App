// Chat session auth (spec §3.1). The app signs one message per 30 days with the thirdweb Gnosis smart
// account; the server verifies it (EOA -> ERC-1271) and returns a Bearer JWT that every other
// /api/chat/* call carries. Same grammar as lib/signed-request, own scope so it can never replay there.
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import * as SecureStore from '@/lib/storage/secureStorage';
import { getApiBaseUrl, type SigningAccount } from '@/lib/signed-request';

export const CHAT_SCOPE = 'roebel-chat-v1';
export const CHAT_SESSION_ACTION = 'session';

/** A token this close to expiry is treated as already gone. */
const EXPIRY_SLACK_MS = 60_000;
const SESSION_TIMEOUT_MS = 20_000;

export interface ChatSession {
  token: string;
  expiresAtMs: number;
}

export class ChatSessionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatSessionError';
    this.code = code;
  }
}

export function chatSessionKey(wallet: string): string {
  return `chat_session_v1_${wallet.toLowerCase()}`;
}

/** Mirrors signed-request: sha256 hex of JSON.stringify(payload with keys sorted). */
export async function hashChatPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(sorted));
}

export async function buildChatSessionMessage(wallet: string, timestampSec: number): Promise<string> {
  return `${CHAT_SCOPE}:${CHAT_SESSION_ACTION}:${wallet.toLowerCase()}:${timestampSec}:${await hashChatPayload({})}`;
}

/** Accepts ISO strings, epoch seconds or epoch milliseconds. */
export function parseExpiresAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (value.trim() !== '' && Number.isFinite(asNum)) return parseExpiresAt(asNum);
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  // Unknown shape: assume a short life so we re-sign soon rather than never.
  return Date.now() + 60 * 60 * 1000;
}

export async function getStoredChatSession(wallet: string): Promise<ChatSession | null> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(chatSessionKey(wallet));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatSession>;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAtMs !== 'number') return null;
    if (parsed.expiresAtMs - EXPIRY_SLACK_MS <= Date.now()) return null;
    return { token: parsed.token, expiresAtMs: parsed.expiresAtMs };
  } catch {
    return null;
  }
}

export async function hasStoredChatSession(wallet: string): Promise<boolean> {
  return (await getStoredChatSession(wallet)) !== null;
}

export async function clearChatSession(wallet: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(chatSessionKey(wallet));
  } catch {
    // Nothing stored — fine.
  }
}

async function storeChatSession(wallet: string, session: ChatSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(chatSessionKey(wallet), JSON.stringify(session));
  } catch {
    // Storage failure only costs a re-sign next time.
  }
}

async function signIn(account: SigningAccount): Promise<ChatSession> {
  const wallet = account.address.toLowerCase();
  const timestamp = Math.floor(Date.now() / 1000);
  let signature: string;
  try {
    signature = await account.signMessage({ message: await buildChatSessionMessage(wallet, timestamp) });
  } catch (err) {
    throw new ChatSessionError('sign_failed', err instanceof Error ? err.message : 'Signatur fehlgeschlagen');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/chat/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, timestamp, signature }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as
      | { token?: string; expiresAt?: unknown; error?: { code?: string; message?: string } }
      | null;
    if (!res.ok || !json || typeof json.token !== 'string') {
      throw new ChatSessionError(
        json?.error?.code ?? 'session_failed',
        json?.error?.message ?? 'Anmeldung beim Chat fehlgeschlagen',
      );
    }
    const session = { token: json.token, expiresAtMs: parseExpiresAt(json.expiresAt) };
    await storeChatSession(wallet, session);
    return session;
  } catch (err) {
    if (err instanceof ChatSessionError) throw err;
    throw new ChatSessionError('network', 'Keine Verbindung zum Chat-Server');
  } finally {
    clearTimeout(timer);
  }
}

// One sign-in per wallet at a time: parallel callers (bootstrap + a send) share the same promise.
const inFlight = new Map<string, Promise<ChatSession>>();

/** Returns a valid Bearer token, signing in when none is stored (or `force` after a 401). */
export async function ensureChatSession(account: SigningAccount, opts?: { force?: boolean }): Promise<string> {
  const wallet = account.address.toLowerCase();
  if (!opts?.force) {
    const stored = await getStoredChatSession(wallet);
    if (stored) return stored.token;
  }
  let pending = inFlight.get(wallet);
  if (!pending) {
    pending = signIn(account).finally(() => inFlight.delete(wallet));
    inFlight.set(wallet, pending);
  }
  return (await pending).token;
}
