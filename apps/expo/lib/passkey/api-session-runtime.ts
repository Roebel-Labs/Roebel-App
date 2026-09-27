/**
 * App wiring for the passkey API session token (api-session.ts): SecureStore key
 * `passkey_api_session_v1`, the passkey API base (EXPO_PUBLIC_PASSKEY_API_URL), CSPRNG.
 * No native passkey code: the one signature per session goes through `account.signMessage`
 * (the passkey adapter), so importing this module never prompts by itself.
 */
import * as SecureStore from '@/lib/storage/secureStorage';
import { passkeySessionOf } from './active';
import { createApiSessionManager, runWithApiSession, type SessionSigner, type TokenAttempt } from './api-session';
import { PASSKEY_API_URL } from './constants';
import { randomBytes } from './random';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const passkeyApiSession = createApiSessionManager({
  apiUrl: PASSKEY_API_URL.replace(/\/$/, ''),
  storage: {
    getItem: (k) => SecureStore.getItemAsync(k),
    setItem: (k, v) => SecureStore.setItemAsync(k, v),
    deleteItem: (k) => SecureStore.deleteItemAsync(k),
  },
  randomHex: (n) => hex(randomBytes(n)),
});

const unsupported = new Set<string>();

/**
 * A signed request: on a passkey session with the API session token (one fingerprint per
 * device session), else exactly as before with `withSignature`. thirdweb sessions always take
 * `withSignature` (their signatures are silent).
 */
export function signedOrSession<R>(
  account: SessionSigner,
  p: {
    kind: 'web' | 'edge';
    endpoint: string;
    withToken: (headers: Record<string, string>) => Promise<TokenAttempt<R>>;
    withSignature: () => Promise<R>;
  },
): Promise<R> {
  if (!passkeySessionOf(account)) return p.withSignature();
  return runWithApiSession({ manager: passkeyApiSession, account, unsupported, ...p });
}

/**
 * Background work (polling, focus reloads): may this account sign right now WITHOUT a prompt?
 * thirdweb: always. Passkey: only with a cached session token.
 */
export async function canSignSilently(account: SessionSigner | null | undefined): Promise<boolean> {
  if (!account) return false;
  if (!passkeySessionOf(account)) return true;
  return (await passkeyApiSession.peek(account.address)) !== null;
}
