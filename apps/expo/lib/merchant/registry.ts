/**
 * Reads and writes for the merchant acceptance registry.
 *
 * Reads go straight to Postgres: the public view exposes only entity ids, and a
 * security-definer function returns one owner's own account by wallet. Writes
 * cannot -- RLS grants no write policy -- so they are signed with the owner's
 * smart account and posted to the merchant-registry edge function, mirroring
 * lib/org-membership.ts.
 *
 * hashPayload matches org-membership byte-for-byte (ordinal key sort,
 * JSON.stringify, SHA-256 hex) so the server can re-derive the same message.
 */
import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

import { supabase } from '../supabase';
import { passkeySessionOf } from '../passkey/active';
import { signedOrSession } from '../passkey/api-session-runtime';
import type {
  MerchantAccountStatus,
  MerchantEntityType,
  MerchantPaymentAccount,
  MerchantRegistryResponse,
} from './types';

export type MerchantAction = 'upsert_account' | 'link_entity';

/** Structural subset of thirdweb's Account -- in-app wallets sign silently. */
export interface SigningAccount {
  address: string;
  signMessage: (args: { message: string }) => Promise<string>;
}

export interface MerchantRequestBody {
  action: MerchantAction;
  wallet: string;
  timestampSec: number;
  payload: Record<string, unknown>;
  signature: string;
}

/** Stable key for joining map rows against the acceptance list. */
export function acceptanceKey(entityType: MerchantEntityType, entityId: string): string {
  return `${entityType}:${entityId.toLowerCase()}`;
}

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(sorted));
}

export async function buildMerchantRequestBody(
  account: SigningAccount,
  action: MerchantAction,
  payload: Record<string, unknown>,
  timestampSec: number = Math.floor(Date.now() / 1000),
): Promise<MerchantRequestBody> {
  const wallet = account.address.toLowerCase();
  const message = `roebel-merchant-v1:${action}:${wallet}:${timestampSec}:${await hashPayload(payload)}`;
  const signature = await account.signMessage({ message });
  return { action, wallet, timestampSec, payload, signature };
}

type Extra = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const SUPABASE_URL = extra.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  extra.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function postSigned(
  account: SigningAccount,
  action: MerchantAction,
  payload: Record<string, unknown>,
): Promise<MerchantRegistryResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'Supabase nicht konfiguriert' };
  }
  const post = async (body: unknown, extraHeaders: Record<string, string> = {}) => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/merchant-registry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    return { status: response.status ?? 200, json: (await response.json()) as MerchantRegistryResponse };
  };
  try {
    const withSignature = async () => (await post(await buildMerchantRequestBody(account, action, payload))).json;
    if (!passkeySessionOf(account)) return await withSignature();
    // Passkey session: the passkey API session token instead of one fingerprint per action.
    return await signedOrSession<MerchantRegistryResponse>(account, {
      kind: 'edge',
      endpoint: 'edge:merchant-registry',
      withToken: async (headers) => {
        const wallet = account.address.toLowerCase();
        const r = await post({ action, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers);
        const code = (r.json as { ok?: boolean; code?: string } | null)?.ok ? undefined : (r.json as { code?: string } | null)?.code;
        return { status: r.status, code, value: r.json };
      },
      withSignature,
    });
  } catch (error) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Netzwerkfehler',
    };
  }
}

export function upsertMerchantAccount(
  account: SigningAccount,
  params: {
    gpUserId?: string | null;
    safeAddress?: string | null;
    status?: MerchantAccountStatus;
  },
): Promise<MerchantRegistryResponse> {
  return postSigned(account, 'upsert_account', params as Record<string, unknown>);
}

export function linkEntity(
  account: SigningAccount,
  params: { entityType: MerchantEntityType; entityId: string },
): Promise<MerchantRegistryResponse> {
  return postSigned(account, 'link_entity', params as Record<string, unknown>);
}

/**
 * The generated Supabase types predate merchant_account_for_wallet, so
 * `supabase.rpc` types its argument as `undefined` and rejects the call.
 * Narrowing the boundary here keeps the cast to one well-named place instead of
 * sprinkling `as any` at the call site (which is what lib/supabase-invites.ts
 * does, and which still does not typecheck).
 */
type RpcCaller = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const callRpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

/** The owner's own Konto, via the security-definer function. */
export async function fetchMerchantAccount(
  wallet: string,
): Promise<MerchantPaymentAccount | null> {
  const { data, error } = await callRpc('merchant_account_for_wallet', {
    p_wallet: wallet.toLowerCase(),
  });
  if (error) {
    console.error('fetchMerchantAccount error:', error);
    return null;
  }
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return null;
  return {
    id: String(row.id),
    gpUserId: (row.gp_user_id as string | null) ?? null,
    safeAddress: (row.gp_safe_address as string | null) ?? null,
    status: row.status as MerchantAccountStatus,
    token: String(row.token ?? 'EURe'),
    chainId: Number(row.chain_id ?? 100),
  };
}

/** Every live acceptance point, as `${entityType}:${entityId}` keys. */
export async function fetchAcceptanceSet(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('merchant_acceptance_public')
    .select('entity_type, entity_id');
  if (error) {
    console.error('fetchAcceptanceSet error:', error);
    return new Set();
  }
  const rows = (data ?? []) as { entity_type: MerchantEntityType; entity_id: string }[];
  return new Set(rows.map((r) => acceptanceKey(r.entity_type, r.entity_id)));
}
