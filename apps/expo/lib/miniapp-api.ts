/**
 * Thin client for the apps/web mini-app API routes that the Expo host proxies:
 *   - Röbel-Münzen balance     → GET  {base}/api/mini-apps/muenzen-balance
 *   - server-authorized reward → POST {base}/api/mini-apps/rewards
 *   - gated notification send  → POST {base}/api/mini-apps/notifications
 *
 * The base URL comes from `EXPO_PUBLIC_MINIAPP_API_BASE` (INTEGRATION NEED). If
 * unset, these host handlers reply `unsupported` rather than hitting a bad URL.
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

const API_BASE: string | undefined =
  (Constants.expoConfig?.extra as { MINIAPP_API_BASE?: string } | undefined)?.MINIAPP_API_BASE ??
  process.env.EXPO_PUBLIC_MINIAPP_API_BASE ??
  undefined;

export function hasMiniAppApi(): boolean {
  return !!API_BASE;
}

function unsupported(): never {
  throw {
    code: 'unsupported',
    message: 'Mini-App-API ist nicht konfiguriert (EXPO_PUBLIC_MINIAPP_API_BASE fehlt).',
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!API_BASE) unsupported();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw {
      code: (json.code as string) || 'internal',
      message: (json.message as string) || `HTTP ${res.status}`,
    };
  }
  return json as T;
}

async function get<T>(path: string, query: Record<string, string>): Promise<T> {
  if (!API_BASE) unsupported();
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API_BASE}${path}?${qs}`);
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
}

export async function apiGetMuenzenBalance(
  id: MiniAppApiIdentity,
): Promise<MuenzenBalance> {
  return get<MuenzenBalance>('/api/mini-apps/muenzen-balance', {
    miniAppId: id.miniAppId,
    slug: id.slug,
    wallet: id.wallet ?? '',
  });
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
  });
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
  });
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
  });
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
  });
}
