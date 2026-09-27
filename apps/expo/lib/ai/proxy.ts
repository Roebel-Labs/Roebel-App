// Server-side AI + image routes (apps/web/src/app/api/ai/*). Since 2026-09-27 the app holds NO
// Anthropic key and NO seed token: it sends the same request bodies to the web API, which adds
// the secret server-side. Auth = the chat-session Bearer token (lib/chat/session.ts: one silent
// wallet signature per 30 days, stored in SecureStore; nobody is logged out by this).
import { clearChatSession, ensureChatSession } from '@/lib/chat/session';
import { getApiBaseUrl, type SigningAccount } from '@/lib/signed-request';

export const ANTHROPIC_PROXY_PATH = '/api/ai/anthropic';
export const MENU_IMAGE_PATH = '/api/ai/menu-image';

export class AiAuthError extends Error {
  constructor(message = 'Bitte melde dich an, um die KI zu nutzen.') {
    super(message);
    this.name = 'AiAuthError';
  }
}

// The wallet of the chat currently talking to the AI. Tool executors (e.g. extractFlyer) run
// outside React and read it from here; AnthropicChatService keeps it current.
let currentAccount: SigningAccount | null = null;

export function setCurrentAiAccount(account: SigningAccount | null): void {
  currentAccount = account;
}

export function getCurrentAiAccount(): SigningAccount | null {
  return currentAccount;
}

export function anthropicProxyUrl(): string {
  return `${getApiBaseUrl()}${ANTHROPIC_PROXY_PATH}`;
}

/** Authorization header for the AI routes. Signs in (one wallet signature) when no session is stored. */
export async function aiAuthHeaders(account: SigningAccount | null | undefined, force = false): Promise<Record<string, string>> {
  if (!account) throw new AiAuthError();
  const token = await ensureChatSession(account, { force });
  return { Authorization: `Bearer ${token}` };
}

/** Drops the stored session so the next call re-signs (after a 401 from a streaming request). */
export async function invalidateAiSession(account: SigningAccount | null | undefined): Promise<void> {
  if (account) await clearChatSession(account.address);
}

/**
 * POST JSON to an AI route with the chat-session token. On 401 (token revoked or secret rotated)
 * it re-signs once and retries, so a stale session never surfaces as an error.
 */
export async function postAi(
  path: string,
  account: SigningAccount | null | undefined,
  body: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<Response> {
  const send = async (force: boolean) => {
    const headers = await aiAuthHeaders(account, force);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
    try {
      return await fetch(`${getApiBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };
  const first = await send(false);
  if (first.status !== 401) return first;
  return send(true);
}

/** Non-streaming Anthropic Messages call through the proxy. Same request/response shape as the API. */
export async function createAnthropicMessage(
  account: SigningAccount | null | undefined,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<any> {
  const res = await postAi(ANTHROPIC_PROXY_PATH, account, body, opts);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((json as any)?.error?.message || `API call failed (${res.status})`);
  }
  return json;
}
