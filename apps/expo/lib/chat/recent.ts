// Lightweight read for surfaces outside ChatProvider (the profile banner). Only ever uses a chat
// session token that is already stored — it never asks the wallet for a signature.
import { getApiBaseUrl } from '@/lib/signed-request';
import { getStoredChatSession } from './session';
import { pickRecentThreads } from './format';
import type { ChatThread } from './types';

const RECENT_TIMEOUT_MS = 10_000;

/** Up to `count` most recent threads, or null when there is no stored session or the call fails. */
export async function loadRecentThreadsIfSession(
  wallet: string | null | undefined,
  count = 2,
): Promise<ChatThread[] | null> {
  if (!wallet) return null;
  const session = await getStoredChatSession(wallet);
  if (!session) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECENT_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/chat/bootstrap`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { threads?: ChatThread[] } | null;
    return pickRecentThreads(json?.threads, count);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
