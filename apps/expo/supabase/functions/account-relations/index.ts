/**
 * Supabase Edge Function: account-relations
 *
 * The ONLY write path for the follow graph (account_follows / account_hides):
 * follow, unfollow, mute, unmute, plus the `list` snapshot of the caller's own
 * relations and the owner-only `followers` list.
 *
 * Auth: identical to org-membership under its own scope. The signed message is
 * "roebel-relations-v1:<action>:<wallet>:<timestampSec>:<sha256(sorted payload)>"
 * (or a passkey API session token). The verified signer is the actor.
 *
 * Deploy: via the Supabase MCP (deploy_edge_function) with core.ts and the two
 * _shared files. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform-injected),
 * GNOSIS_RPC_URL optional, PASSKEY_SESSION_SECRET optional.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  recoverMessageAddress,
  createPublicClient,
  http,
  hashMessage,
  hashTypedData,
  recoverTypedDataAddress,
} from 'https://esm.sh/viem@2.21.45';
import { makeAccountSignatureVerifier, type AccountSignatureClient } from '../_shared/verify-account-signature.ts';
import { gnosis } from 'https://esm.sh/viem@2.21.45/chains';
import {
  authenticateEdgeSession,
  supabasePasskeySessionLookup,
  type SessionLookupClient,
} from '../_shared/verify-session-token.ts';
import { followNotice, parseFollowPayload, parseTargetPayload, parseUnfollowPayload, type FollowSource } from './core.ts';

// ── Contract ──────────────────────────────────────────────────────────

const ACTIONS = ['list', 'follow', 'unfollow', 'mute', 'unmute', 'followers'] as const;
type RelationsAction = (typeof ACTIONS)[number];

type Body = {
  action: string;
  wallet: string;
  timestampSec: number;
  payload: Record<string, unknown>;
  signature: string;
};

const MAX_MESSAGE_AGE_SECONDS = 300;

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
// Loose shape check, not a real signature parse: 0x + even-length hex,
// at least 65 bytes (132 chars total — a plain ECDSA sig; ERC-6492-wrapped
// smart-account sigs are longer). Used to reject garbage BEFORE calling any
// verifier, so a malformed signature reads as 401 BAD_SIGNATURE, never a
// 503 that implies the RPC itself is the problem.
const SIGNATURE_SHAPE_RE = /^0x[0-9a-fA-F]+$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-roebel-session, x-roebel-device',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ERC-1271/6492 verification needs the chain the smart account lives on.
const gnosisClient = createPublicClient({
  chain: gnosis,
  transport: http(Deno.env.get('GNOSIS_RPC_URL') ?? 'https://rpc.gnosischain.com'),
});

// Shared server-side signature rule (see _shared/verify-account-signature.ts):
// ERC-1271/6492 via gnosisClient.verifyHash, OR a passkey Safe that is admin of
// the account (Safe-admin envelope), OR a thirdweb chainId-8453 admin signature.
const verifyAccountSignature = makeAccountSignatureVerifier({
  client: gnosisClient as unknown as AccountSignatureClient,
  utils: { hashMessage, hashTypedData, recoverTypedDataAddress },
});

// Passkey API session token (x-roebel-session + x-roebel-device) as an alternative to a fresh
// wallet signature: one signature per device session instead of one per request. Same HMAC secret
// as the web app (edge secret PASSKEY_SESSION_SECRET); revocation in passkey_api_sessions. Unset
// secret = off (every request needs its signature as before). See _shared/verify-session-token.ts.
function sessionLookup() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return supabasePasskeySessionLookup(db as unknown as SessionLookupClient);
}

type Admin = ReturnType<typeof createClient>;

// ── Message hashing — MUST mirror the client signer (same as org-membership)
//    byte-for-byte: ordinal key sort (not localeCompare), JSON.stringify,
//    SHA-256 hex. ──────────────────────────────────────────────────────

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const bytes = new TextEncoder().encode(JSON.stringify(sorted));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildRelationsMessage(
  action: string,
  wallet: string,
  timestampSec: number,
  payloadHash: string,
): string {
  return `roebel-relations-v1:${action}:${wallet.toLowerCase()}:${timestampSec}:${payloadHash}`;
}

// ── Response helpers ─────────────────────────────────────────────────

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function ok(data?: unknown) {
  return json(200, { ok: true, ...(data === undefined ? {} : { data }) });
}

function fail(code: string, status: number, message: string) {
  return json(status, { ok: false, code, message });
}

function isWellFormedSignature(sig: string): boolean {
  if (!SIGNATURE_SHAPE_RE.test(sig)) return false;
  const hexLen = sig.length - 2; // strip '0x'
  if (hexLen % 2 !== 0) return false;
  if (sig.length < 132) return false;
  return true;
}


// ── Handlers ─────────────────────────────────────────────────────────

async function snapshot(admin: Admin, viewer: string) {
  const [{ data: fol, error: folErr }, { data: hides, error: hidesErr }] = await Promise.all([
    admin.from('account_follows').select('target_account_id').eq('follower_wallet', viewer),
    admin.from('account_hides').select('target_account_id, kind').eq('viewer_wallet', viewer),
  ]);
  if (folErr) throw folErr;
  if (hidesErr) throw hidesErr;
  const unfollowed = (hides ?? []).filter((h: any) => h.kind === 'unfollowed').map((h: any) => h.target_account_id);
  const muted = (hides ?? []).filter((h: any) => h.kind === 'muted').map((h: any) => h.target_account_id);
  const ownerWallets = async (ids: string[]) => {
    if (ids.length === 0) return [] as string[];
    const { data, error } = await admin.from('account_owners')
      .select('wallet_address, accounts!inner(account_type)')
      .in('account_id', ids).eq('accounts.account_type', 'personal');
    if (error) throw error;
    return [...new Set((data ?? []).map((r: any) => String(r.wallet_address).toLowerCase()))];
  };
  return {
    following: (fol ?? []).map((f: any) => f.target_account_id),
    unfollowed, muted,
    unfollowedWallets: await ownerWallets(unfollowed),
    mutedWallets: await ownerWallets(muted),
  };
}

async function existingIds(admin: Admin, ids: string[]): Promise<string[]> {
  const { data, error } = await admin.from('accounts').select('id').in('id', ids);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id);
}

async function handleFollow(admin: Admin, viewer: string, payload: Record<string, unknown>) {
  const parsed = parseFollowPayload(payload);
  if (!parsed.ok) return fail('BAD_PAYLOAD', 400, parsed.message);
  const own = await admin.rpc('personal_account_id', { p_wallet: viewer });
  if (own.error) return fail('INTERNAL', 500, own.error.message);
  const targets = (await existingIds(admin, parsed.targets)).filter((id) => id !== own.data);
  if (targets.length > 0) {
    // Deterministic idempotency: only targets without an existing follow row are inserted AND
    // notified, so a retry never sends a second notice.
    const { data: existing, error: exErr } = await admin.from('account_follows')
      .select('target_account_id').eq('follower_wallet', viewer).in('target_account_id', targets);
    if (exErr) return fail('INTERNAL', 500, exErr.message);
    const have = new Set((existing ?? []).map((r: any) => r.target_account_id));
    const newIds = targets.filter((t) => !have.has(t));
    if (newIds.length > 0) {
      const { error } = await admin.from('account_follows')
        .upsert(newIds.map((t) => ({ follower_wallet: viewer, target_account_id: t, source: parsed.source })),
          { onConflict: 'follower_wallet,target_account_id', ignoreDuplicates: true });
      if (error) return fail('INTERNAL', 500, error.message);
    }
    const { error: hideErr } = await admin.from('account_hides').delete()
      .eq('viewer_wallet', viewer).eq('kind', 'unfollowed').in('target_account_id', targets);
    if (hideErr) return fail('INTERNAL', 500, hideErr.message);
    await insertNotices(admin, viewer, newIds, parsed.source);
  }
  return ok(await snapshot(admin, viewer));
}

async function insertNotices(admin: Admin, viewer: string, targetIds: string[], source: FollowSource) {
  if (targetIds.length === 0) return;
  const { data: me } = await admin.from('users').select('display_name, username').ilike('wallet_address', viewer).maybeSingle();
  const followerName = (me as any)?.display_name || (me as any)?.username || 'Jemand Neues';
  const { data: accounts } = await admin.from('accounts').select('id, name, account_type').in('id', targetIds);
  const { data: owners } = await admin.from('account_owners').select('account_id, wallet_address, role').in('account_id', targetIds);
  const rows: Record<string, unknown>[] = [];
  for (const acc of (accounts ?? []) as any[]) {
    const isOrg = acc.account_type === 'organisation';
    const recipients = ((owners ?? []) as any[])
      .filter((o) => o.account_id === acc.id && (isOrg ? ['owner', 'admin'].includes(o.role) : true))
      .map((o) => String(o.wallet_address).toLowerCase())
      .filter((w) => w !== viewer);
    const { title, body } = followNotice({ followerName, source, orgName: isOrg ? acc.name : null });
    for (const w of new Set(recipients)) {
      rows.push({ recipient_wallet: w, type: 'new_follower', title, body,
        metadata: { actor_wallet: viewer, follower_wallet: viewer, account_id: acc.id, source } });
    }
  }
  // Chunked: one onboarding can address a few hundred accounts.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from('notifications').insert(rows.slice(i, i + 200));
    if (error) console.error('new_follower notices failed (non-fatal)', error);
  }
}

async function handleUnfollow(admin: Admin, viewer: string, payload: Record<string, unknown>) {
  const parsed = parseUnfollowPayload(payload);
  if (!parsed.ok) return fail('BAD_PAYLOAD', 400, parsed.message);
  const targets = await existingIds(admin, parsed.targets);
  if (targets.length > 0) {
    const { error: delErr } = await admin.from('account_follows').delete()
      .eq('follower_wallet', viewer).in('target_account_id', targets);
    if (delErr) return fail('INTERNAL', 500, delErr.message);
    const { error } = await admin.from('account_hides').upsert(
      targets.map((t) => ({ viewer_wallet: viewer, target_account_id: t, kind: 'unfollowed' })),
      { onConflict: 'viewer_wallet,target_account_id,kind', ignoreDuplicates: true });
    if (error) return fail('INTERNAL', 500, error.message);
  }
  return ok(await snapshot(admin, viewer));
}

async function handleMute(admin: Admin, viewer: string, payload: Record<string, unknown>, mute: boolean) {
  const parsed = parseTargetPayload(payload);
  if (!parsed.ok) return fail('BAD_PAYLOAD', 400, parsed.message);
  if ((await existingIds(admin, [parsed.target])).length === 0) return fail('BAD_PAYLOAD', 400, 'unknown account');
  const q = mute
    ? admin.from('account_hides').upsert({ viewer_wallet: viewer, target_account_id: parsed.target, kind: 'muted' },
        { onConflict: 'viewer_wallet,target_account_id,kind', ignoreDuplicates: true })
    : admin.from('account_hides').delete().eq('viewer_wallet', viewer).eq('target_account_id', parsed.target).eq('kind', 'muted');
  const { error } = await q;
  if (error) return fail('INTERNAL', 500, error.message);
  return ok(await snapshot(admin, viewer));
}

// Follower lists: only the account's owners/admins, or the person whose personal account it is.
async function handleFollowers(admin: Admin, viewer: string, payload: Record<string, unknown>) {
  const parsed = parseTargetPayload({ target: payload.accountId });
  if (!parsed.ok) return fail('BAD_PAYLOAD', 400, parsed.message);
  const { data: owner } = await admin.from('account_owners').select('role, accounts!inner(account_type)')
    .eq('account_id', parsed.target).ilike('wallet_address', viewer).maybeSingle();
  const o = owner as { role: string; accounts: { account_type: string } } | null;
  const allowed = !!o && (o.accounts.account_type === 'personal' || ['owner', 'admin'].includes(o.role));
  if (!allowed) return fail('FORBIDDEN', 403, 'not your account');
  const offset = Math.min(10000, Math.max(0, Math.floor(Number(payload.offset ?? 0)) || 0));
  const { data, error } = await admin.rpc('list_account_followers', { p_account_id: parsed.target, p_limit: 50, p_offset: offset });
  if (error) return fail('INTERNAL', 500, error.message);
  return json(200, { ok: true, data: data ?? [] });
}

// ── Entry point ──────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 405, 'Method not allowed');
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
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
  // A request WITHOUT a signature may carry a passkey API session token for this wallet.
  const session = await authenticateEdgeSession({
    headers: req.headers,
    wallet,
    signature,
    secret: Deno.env.get('PASSKEY_SESSION_SECRET'),
    nowSec: Math.floor(Date.now() / 1000),
    isActive: sessionLookup(),
  });
  if (session && !session.ok) return fail(session.code, session.status, 'session invalid or expired');
  if (!session) {
    if (typeof signature !== 'string' || signature.length === 0) {
      return fail('BAD_REQUEST', 400, 'signature required');
    }
    // Shape-check BEFORE calling any verifier: a malformed signature is a bad
    // request, not a verifier outage — reject it as 401 here so it never
    // reaches the try/catch below and gets misread as 503 VERIFY_UNAVAILABLE.
    if (!isWellFormedSignature(signature)) {
      return fail('BAD_SIGNATURE', 401, 'signature malformed');
    }
  }

  const ts = Number(timestampSec);
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (!Number.isFinite(ts) || !Number.isFinite(ageSec) || ageSec > MAX_MESSAGE_AGE_SECONDS) {
    return fail('STALE', 400, 'message expired');
  }

  const payloadObj: Record<string, unknown> =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  const message = buildRelationsMessage(action, wallet, ts, await hashPayload(payloadObj));
  const claimedWallet = wallet.toLowerCase();

  // Fast path: plain EOA recovery. Smart accounts (ERC-1271/6492) fall
  // through to viem's universal verifier, which checks against the
  // account contract on Gnosis.
  // A valid session token (checked above) authenticates the wallet; otherwise the signature does.
  let verified = !!session?.ok;
  if (!verified) {
    try {
      const recovered = (
        await recoverMessageAddress({ message, signature: signature as `0x${string}` })
      ).toLowerCase();
      verified = recovered === claimedWallet;
    } catch {
      // not an EOA signature — try the universal path
    }
  }
  if (!verified) {
    try {
      verified = await verifyAccountSignature({
        address: claimedWallet,
        message,
        signature,
      });
    } catch (err) {
      // A transport/RPC failure here is NOT a bad-signature verdict — it's
      // the verifier being unreachable. Conflating the two would make an
      // RPC outage look like an attack; report it as unavailable instead.
      console.error('signature verification unavailable (RPC/transport error)', err);
      return fail('VERIFY_UNAVAILABLE', 503, 'could not reach verification RPC');
    }
  }
  if (!verified) {
    return fail('BAD_SIGNATURE', 401, 'signer does not match wallet');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return fail('INTERNAL', 500, 'Service not configured');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const signer = claimedWallet;

  try {
    switch (action as RelationsAction) {
      case 'list': return ok(await snapshot(admin, signer));
      case 'follow': return await handleFollow(admin, signer, payloadObj);
      case 'unfollow': return await handleUnfollow(admin, signer, payloadObj);
      case 'mute': return await handleMute(admin, signer, payloadObj, true);
      case 'unmute': return await handleMute(admin, signer, payloadObj, false);
      case 'followers': return await handleFollowers(admin, signer, payloadObj);
      default: return fail('BAD_ACTION', 400, 'unknown action');
    }
  } catch (err) {
    console.error('account-relations failed', action, err);
    return fail('INTERNAL', 500, 'internal error');
  }
});
