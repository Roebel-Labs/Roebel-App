// Expo client for the account-relations edge function (follow / unfollow / mute). Same signed-request
// grammar as lib/org-membership.ts under its own scope, so a follow signature can never replay as an org action.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { passkeySessionOf } from './passkey/active';
import { signedOrSession } from './passkey/api-session-runtime';
import type { SigningAccount } from './org-membership';
import type { RelationsSnapshot } from './relations-state';

export type RelationsAction = 'list' | 'follow' | 'unfollow' | 'mute' | 'unmute' | 'followers';
type Result = { ok: true; data: RelationsSnapshot } | { ok: false; code: string; message: string };

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(sorted));
}

export async function buildRelationsMessage(action: RelationsAction, wallet: string, ts: number, payload: Record<string, unknown>) {
  return `roebel-relations-v1:${action}:${wallet.toLowerCase()}:${ts}:${await hashPayload(payload)}`;
}

type Extra = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
const extra = (Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra) as Extra | undefined;
const SUPABASE_URL = extra?.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = extra?.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function callRelations(account: SigningAccount, action: RelationsAction, payload: Record<string, unknown>): Promise<Result> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, code: 'NOT_CONFIGURED', message: 'Supabase ist nicht konfiguriert.' };
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/account-relations`;
  const post = async (body: unknown, extraHeaders: Record<string, string> = {}) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, ...extraHeaders },
        body: JSON.stringify(body),
      });
      return { status: res.status ?? 200, json: (await res.json()) as Result };
    } catch (err) {
      return { status: 0, json: { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' } as Result };
    }
  };
  const wallet = account.address.toLowerCase();
  const withSignature = async () => {
    const timestampSec = Math.floor(Date.now() / 1000);
    const signature = await account.signMessage({ message: await buildRelationsMessage(action, wallet, timestampSec, payload) });
    return (await post({ action, wallet, timestampSec, payload, signature })).json;
  };
  if (!passkeySessionOf(account)) return withSignature();
  return signedOrSession<Result>(account, {
    kind: 'edge',
    endpoint: 'edge:account-relations',
    withToken: async (headers) => {
      const r = await post({ action, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers);
      return { status: r.status, code: r.json.ok ? undefined : r.json.code, value: r.json };
    },
    withSignature,
  });
}

export type FollowerRow = { name: string | null; avatar_url: string | null; username: string | null };

/** Follower names for an account the signer owns/admins (or their own personal account). [] on any failure. */
export async function fetchFollowers(account: SigningAccount, accountId: string, offset = 0): Promise<FollowerRow[]> {
  const res = (await callRelations(account, 'followers', { accountId, offset })) as unknown as
    { ok: true; data: FollowerRow[] } | { ok: false };
  return res.ok ? res.data : [];
}

const cacheKey = (wallet: string) => `@roebel/relations/${wallet.toLowerCase()}`;

export async function loadCachedSnapshot(wallet: string): Promise<RelationsSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(wallet));
    return raw ? (JSON.parse(raw) as RelationsSnapshot) : null;
  } catch {
    return null;
  }
}

export async function saveCachedSnapshot(wallet: string, s: RelationsSnapshot): Promise<void> {
  try { await AsyncStorage.setItem(cacheKey(wallet), JSON.stringify(s)); } catch { /* cache only */ }
}
