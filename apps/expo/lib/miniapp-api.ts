/**
 * Thin client for the apps/web mini-app API routes that the Expo host proxies:
 *   - Röbel-Münzen balance     → GET  {base}/api/mini-apps/muenzen-balance
 *   - server-authorized reward → POST {base}/api/mini-apps/rewards
 *   - gated notification send  → POST {base}/api/mini-apps/notifications
 *
 * The base URL comes from `expo.extra.MINIAPP_API_BASE` / `EXPO_PUBLIC_MINIAPP_API_BASE`,
 * falling back to the production origin. The env vars only existed in the local
 * dev `.env` — device builds shipped WITHOUT a base and every data/reward/balance
 * handler answered `unsupported`, so CMS-backed apps silently rendered their
 * built-in fallback content. The hardcoded production fallback ends that class
 * of failure; the env override remains for pointing dev at a local web app.
 *
 * These are SERVER-authorized surfaces (spec §4.3): the host merely relays the
 * request + identity; budget/rate-limit/idempotency are enforced server-side.
 */
import Constants from 'expo-constants';
import type {
  GrantRewardParams,
  GrantRewardResult,
  MuenzenBalance,
} from '@netizen-labs/miniapp-sdk';

const PROD_API_BASE = 'https://www.roebel.app';

const API_BASE: string | undefined =
  (Constants.expoConfig?.extra as { MINIAPP_API_BASE?: string } | undefined)?.MINIAPP_API_BASE ||
  process.env.EXPO_PUBLIC_MINIAPP_API_BASE ||
  PROD_API_BASE;

export function hasMiniAppApi(): boolean {
  return !!API_BASE;
}

/**
 * The apps/web origin — also serves every AI-built mini app at /mini/<slug>.
 * MiniAppHost uses it as the load fallback when an app's dedicated
 * <slug>.roebel.site origin fails (e.g. wildcard-cert outage).
 */
export function miniAppApiBase(): string | undefined {
  return API_BASE;
}

function unsupported(): never {
  throw {
    code: 'unsupported',
    message: 'Mini-App-API ist nicht konfiguriert (EXPO_PUBLIC_MINIAPP_API_BASE fehlt).',
  };
}

/** Zero balance, same shape the balance route answers for a logged-out caller. */
const ZERO_BALANCE: MuenzenBalance = { balance: '0', decimals: 18, symbol: 'RÖ' };

/**
 * Headers of a user-scoped call: `x-roebel-host: expo` (the server records it on wallet-only
 * calls) and `Authorization: Bearer <mini-app user token>` when the host holds one.
 */
function userHeaders(id: MiniAppApiIdentity): Record<string, string> {
  return { 'x-roebel-host': 'expo', ...(id.token ? { Authorization: `Bearer ${id.token}` } : {}) };
}

/** A 401 on a call that carried a token: tell the host so it drops that token. No retry. */
function noteRejectedToken(res: Response, user?: MiniAppApiIdentity): void {
  if (res.status !== 401 || !user?.token) return;
  try {
    user.onTokenRejected?.(user.token);
  } catch {
    // A cache callback must never change the call's outcome.
  }
}

async function post<T>(path: string, body: unknown, user: MiniAppApiIdentity): Promise<T> {
  if (!API_BASE) unsupported();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders(user) },
    body: JSON.stringify(body),
  });
  noteRejectedToken(res, user);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw {
      code: (json.code as string) || 'internal',
      message: (json.message as string) || `HTTP ${res.status}`,
    };
  }
  return json as T;
}

/** GET; `user` marks a user-scoped call (host header, token, 401 handling). */
async function get<T>(path: string, query: Record<string, string>, user?: MiniAppApiIdentity): Promise<T> {
  if (!API_BASE) unsupported();
  const qs = new URLSearchParams(query).toString();
  const res = user
    ? await fetch(`${API_BASE}${path}?${qs}`, { headers: userHeaders(user) })
    : await fetch(`${API_BASE}${path}?${qs}`);
  noteRejectedToken(res, user);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw {
      code: (json.code as string) || 'internal',
      message: (json.message as string) || `HTTP ${res.status}`,
    };
  }
  return json as T;
}

export interface MiniAppApiIdentity {
  miniAppId: string;
  slug: string;
  wallet: string | null;
  /**
   * Short-lived mini-app user token (lib/miniapp-token.ts). Sent as `Authorization: Bearer`
   * on the user-scoped calls; the wallet is still sent for older web deploys.
   */
  token?: string | null;
  /** Called with `token` when the server refused it (401), so the host's cache can drop it. */
  onTokenRejected?: (token: string) => void;
}

export async function apiGetMuenzenBalance(
  id: MiniAppApiIdentity,
): Promise<MuenzenBalance> {
  // Logged out: nothing to look up — answer zero locally instead of a wallet-less server call.
  if (!id.wallet) return { ...ZERO_BALANCE };
  return get<MuenzenBalance>('/api/mini-apps/muenzen-balance', {
    miniAppId: id.miniAppId,
    slug: id.slug,
    wallet: id.wallet,
  }, id);
}

export async function apiGrantReward(
  id: MiniAppApiIdentity,
  p: GrantRewardParams,
): Promise<GrantRewardResult> {
  return post<GrantRewardResult>('/api/mini-apps/rewards', {
    // `appId` is what the route reads first; keep miniAppId+slug for
    // compatibility with older web deploys that accept those.
    appId: id.miniAppId,
    miniAppId: id.miniAppId,
    slug: id.slug,
    wallet: id.wallet,
    amount: p.amount,
    reason: p.reason,
    idempotencyKey: p.idempotencyKey,
  }, id);
}

export async function apiSendNotification(
  id: MiniAppApiIdentity,
  p: { title: string; body: string; targetUrl?: string },
): Promise<{ sent: boolean }> {
  return post<{ sent: boolean }>('/api/mini-apps/notifications', {
    miniAppId: id.miniAppId,
    slug: id.slug,
    wallet: id.wallet,
    title: p.title,
    body: p.body,
    targetUrl: p.targetUrl,
  }, id);
}

// ── v0.3 mini-app datastore ("Mini-CMS") ─────────────────────────────────────
// App content (scope app, read-only at runtime) + per-user state (scope user,
// keyed by the host wallet). Server enforces scoping + quotas.

export async function apiDataGet(
  id: MiniAppApiIdentity,
  key: string,
): Promise<{ value: unknown; exists: boolean }> {
  return get<{ value: unknown; exists: boolean }>('/api/mini-apps/data', {
    app: id.miniAppId,
    scope: 'app',
    key,
  });
}

export async function apiDataList(
  id: MiniAppApiIdentity,
  prefix?: string,
): Promise<{ items: { key: string; value: unknown }[] }> {
  return get<{ items: { key: string; value: unknown }[] }>('/api/mini-apps/data', {
    app: id.miniAppId,
    scope: 'app',
    ...(prefix ? { prefix } : {}),
  });
}

export async function apiDataUserGet(
  id: MiniAppApiIdentity,
  key: string,
): Promise<{ value: unknown; exists: boolean }> {
  if (!id.wallet) throw { code: 'unsupported', message: 'Keine Wallet verbunden.' };
  return get<{ value: unknown; exists: boolean }>('/api/mini-apps/data', {
    app: id.miniAppId,
    scope: 'user',
    wallet: id.wallet,
    key,
  }, id);
}

export async function apiDataUserSet(
  id: MiniAppApiIdentity,
  key: string,
  value: unknown,
): Promise<{ ok: boolean }> {
  if (!id.wallet) throw { code: 'unsupported', message: 'Keine Wallet verbunden.' };
  return post<{ ok: boolean }>('/api/mini-apps/data', {
    app: id.miniAppId,
    scope: 'user',
    wallet: id.wallet,
    key,
    value,
  }, id);
}
