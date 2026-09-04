/**
 * Supabase Edge Function: merchant-registry
 *
 * The ONLY write path into merchant_payment_accounts / merchant_entities. Those
 * tables carry no write policy and no write grant (see
 * 20260904_merchant_payment_accounts.sql and its revoke follow-up), so the anon
 * key cannot touch them.
 *
 * Auth mirrors org-membership byte-for-byte: the caller signs
 *   roebel-merchant-v1:<action>:<wallet>:<timestampSec>:<sha256(sorted payload)>
 * with their thirdweb account. EOA recovery is tried first; smart accounts fall
 * through to viem's universal verifier (ERC-1271/6492) against Gnosis. The
 * VERIFIED signer -- never a wallet from the payload -- is the actor for every
 * authorization decision. An unreachable RPC is 503, not a bad-signature 401.
 *
 * Actions:
 *   upsert_account -- create/update the caller's own Konto row
 *   link_entity    -- attach a business/restaurant/account the caller owns
 *
 * Ownership differs per entity type, because the schema does:
 *   business   -> businesses.owner_wallet_address (direct column)
 *   restaurant -> restaurants.account_id -> account_owners
 *   account    -> account_owners
 * account_owners lookups use ilike, since some production rows store a
 * checksummed address (same reason org-membership does).
 *
 * Deploy: via the Supabase MCP. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * are platform-injected; GNOSIS_RPC_URL optional.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createPublicClient, http, recoverMessageAddress } from 'https://esm.sh/viem@2.21.45';
import { gnosis } from 'https://esm.sh/viem@2.21.45/chains';

const ACTIONS = ['upsert_account', 'link_entity'] as const;
type MerchantAction = (typeof ACTIONS)[number];

const ENTITY_TYPES = ['business', 'restaurant', 'account'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const ACCOUNT_STATUSES = [
  'pending_kyc',
  'kyc_approved',
  'deploying',
  'live',
  'suspended',
] as const;

/** Roles that may put an org's places on the acceptance map. */
const LINKING_ROLES = ['owner', 'admin'];

const MAX_MESSAGE_AGE_SECONDS = 300;
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE_SHAPE_RE = /^0x[0-9a-fA-F]+$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const gnosisClient = createPublicClient({
  chain: gnosis,
  transport: http(Deno.env.get('GNOSIS_RPC_URL') ?? 'https://rpc.gnosischain.com'),
});

type Admin = ReturnType<typeof createClient>;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ok = (data?: unknown) =>
  json(200, { ok: true, ...(data === undefined ? {} : { data }) });

const fail = (code: string, status: number, message: string) =>
  json(status, { ok: false, code, message });

/** Ordinal key sort + JSON.stringify + SHA-256 hex. Mirrors lib/merchant/registry.ts. */
async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const bytes = new TextEncoder().encode(JSON.stringify(sorted));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildMerchantMessage(
  action: string,
  wallet: string,
  timestampSec: number,
  payloadHash: string,
): string {
  return `roebel-merchant-v1:${action}:${wallet.toLowerCase()}:${timestampSec}:${payloadHash}`;
}

/** True when the caller may link this entity to their Konto. */
async function ownsEntity(
  admin: Admin,
  signer: string,
  entityType: EntityType,
  entityId: string,
): Promise<boolean | 'error'> {
  if (entityType === 'business') {
    const { data, error } = await admin
      .from('businesses')
      .select('id')
      .eq('id', entityId)
      .ilike('owner_wallet_address', signer)
      .maybeSingle();
    if (error) {
      console.error('merchant-registry: business ownership lookup failed', error);
      return 'error';
    }
    return Boolean(data);
  }

  // restaurants have no wallet column; they belong to an org account.
  let accountId = entityId;
  if (entityType === 'restaurant') {
    const { data, error } = await admin
      .from('restaurants')
      .select('account_id')
      .eq('id', entityId)
      .maybeSingle();
    if (error) {
      console.error('merchant-registry: restaurant lookup failed', error);
      return 'error';
    }
    if (!data?.account_id) return false;
    accountId = String(data.account_id);
  }

  const { data, error } = await admin
    .from('account_owners')
    .select('role')
    .eq('account_id', accountId)
    .ilike('wallet_address', signer)
    .maybeSingle();
  if (error) {
    console.error('merchant-registry: account_owners lookup failed', error);
    return 'error';
  }
  return Boolean(data?.role && LINKING_ROLES.includes(String(data.role)));
}

async function handleUpsertAccount(
  admin: Admin,
  signer: string,
  payload: Record<string, unknown>,
) {
  const update: Record<string, unknown> = {
    owner_wallet: signer,
    updated_at: new Date().toISOString(),
  };

  if (payload.gpUserId !== undefined) {
    if (payload.gpUserId !== null && typeof payload.gpUserId !== 'string') {
      return fail('BAD_PAYLOAD', 400, 'gpUserId must be a string or null');
    }
    update.gp_user_id = payload.gpUserId;
  }

  if (payload.safeAddress !== undefined) {
    if (payload.safeAddress === null) {
      update.gp_safe_address = null;
    } else if (typeof payload.safeAddress === 'string' && WALLET_RE.test(payload.safeAddress)) {
      update.gp_safe_address = payload.safeAddress.toLowerCase();
    } else {
      return fail('BAD_PAYLOAD', 400, 'safeAddress malformed');
    }
  }

  if (payload.status !== undefined) {
    if (
      typeof payload.status !== 'string' ||
      !(ACCOUNT_STATUSES as readonly string[]).includes(payload.status)
    ) {
      return fail('BAD_PAYLOAD', 400, 'unknown status');
    }
    update.status = payload.status;
  }

  const { error } = await admin
    .from('merchant_payment_accounts')
    .upsert(update, { onConflict: 'owner_wallet' });
  if (error) {
    console.error('merchant-registry: upsert failed', error);
    return fail('DB_ERROR', 500, error.message);
  }
  return ok();
}

async function handleLinkEntity(
  admin: Admin,
  signer: string,
  payload: Record<string, unknown>,
) {
  const entityType = String(payload.entityType ?? '');
  const entityId = String(payload.entityId ?? '');

  if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return fail('BAD_ENTITY', 400, 'unknown entityType');
  }
  if (!UUID_RE.test(entityId)) {
    return fail('BAD_ENTITY', 400, 'entityId must be a uuid');
  }

  const { data: account, error: accountError } = await admin
    .from('merchant_payment_accounts')
    .select('id')
    .eq('owner_wallet', signer)
    .maybeSingle();
  if (accountError) {
    console.error('merchant-registry: account lookup failed', accountError);
    return fail('DB_ERROR', 500, accountError.message);
  }
  if (!account) return fail('NO_ACCOUNT', 404, 'no Konto for this wallet');

  const owns = await ownsEntity(admin, signer, entityType as EntityType, entityId);
  if (owns === 'error') return fail('DB_ERROR', 500, 'ownership check failed');
  if (!owns) return fail('NOT_OWNER', 403, 'caller does not own this entity');

  const { error } = await admin
    .from('merchant_entities')
    .upsert(
      { account_id: account.id, entity_type: entityType, entity_id: entityId },
      { onConflict: 'entity_type,entity_id' },
    );
  if (error) {
    console.error('merchant-registry: link failed', error);
    return fail('DB_ERROR', 500, error.message);
  }
  return ok();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405, 'Method not allowed');

  let body: {
    action?: string;
    wallet?: string;
    timestampSec?: number;
    payload?: Record<string, unknown>;
    signature?: string;
  };
  try {
    body = await req.json();
  } catch {
    return fail('BAD_REQUEST', 400, 'Invalid JSON');
  }
  if (!body || typeof body !== 'object') {
    return fail('BAD_REQUEST', 400, 'Expected { action, wallet, timestampSec, payload, signature }');
  }

  const { action, wallet, timestampSec, payload, signature } = body;

  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return fail('BAD_ACTION', 400, 'unknown action');
  }
  if (typeof wallet !== 'string' || !WALLET_RE.test(wallet)) {
    return fail('BAD_WALLET', 400, 'wallet malformed');
  }
  if (typeof signature !== 'string' || !SIGNATURE_SHAPE_RE.test(signature)) {
    return fail('BAD_SIGNATURE', 401, 'signature malformed');
  }

  const ts = Number(timestampSec);
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (!Number.isFinite(ts) || !Number.isFinite(ageSec) || ageSec > MAX_MESSAGE_AGE_SECONDS) {
    return fail('STALE', 400, 'message expired');
  }

  const payloadObj: Record<string, unknown> =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  const message = buildMerchantMessage(action, wallet, ts, await hashPayload(payloadObj));
  const claimedWallet = wallet.toLowerCase();

  let verified = false;
  try {
    const recovered = (
      await recoverMessageAddress({ message, signature: signature as `0x${string}` })
    ).toLowerCase();
    verified = recovered === claimedWallet;
  } catch {
    // not an EOA signature -- fall through to the universal verifier
  }
  if (!verified) {
    try {
      verified = await gnosisClient.verifyMessage({
        address: claimedWallet as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    } catch (err) {
      console.error('merchant-registry: verification unavailable (RPC error)', err);
      return fail('VERIFY_UNAVAILABLE', 503, 'could not reach verification RPC');
    }
  }
  if (!verified) return fail('BAD_SIGNATURE', 401, 'signer does not match wallet');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return fail('INTERNAL', 500, 'Service not configured');

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (action as MerchantAction) {
      case 'upsert_account':
        return await handleUpsertAccount(admin, claimedWallet, payloadObj);
      case 'link_entity':
        return await handleLinkEntity(admin, claimedWallet, payloadObj);
      default:
        return fail('BAD_ACTION', 400, 'unknown action');
    }
  } catch (err) {
    console.error('merchant-registry: unhandled error', err);
    return fail('INTERNAL', 500, 'unexpected error');
  }
});
