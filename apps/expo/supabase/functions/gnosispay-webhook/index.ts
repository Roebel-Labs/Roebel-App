/**
 * Supabase Edge Function: gnosispay-webhook
 *
 * Receives partner events from Gnosis Pay and advances the merchant registry so
 * the app never has to poll KYC. Registered in the partner dashboard at
 * https://partners.gnosispay.com -> Integrations -> Webhooks.
 *
 * Events handled:
 *   user.created             -> bind gp_user_id to the pending Konto
 *   kyc.status.changed       -> pending_kyc -> kyc_approved (or suspended)
 *   card.transaction.created -> acknowledged only; card ledger is spec 3
 *
 * There is NO inbound-transfer event in the Gnosis Pay API. Payment detection
 * is the EURe Transfer-log indexer (slice 1b), not this function.
 *
 * Auth: Ed25519 over `${X-Webhook-Timestamp}.${rawBody}`, public key from
 * webhooks.gnosispay.com (cached 1 h). Following the org-membership idiom, a
 * verifier that cannot be REACHED is reported as 503 (Gnosis Pay retries) while
 * a signature that genuinely does not match is 401 (it must not be retried).
 * Gnosis Pay retries non-2xx three times with 1/5/15-minute backoff and times
 * out at 30 s, so this handler stays fast and does no on-chain work.
 *
 * Deploy: via the Supabase MCP (this repo has no supabase CLI).
 * Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are platform-injected.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const PUBLIC_KEY_URL = 'https://webhooks.gnosispay.com/api/v1/public-key';
const PUBLIC_KEY_TTL_MS = 60 * 60 * 1000;
const MAX_SKEW_MS = 5 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64ToBytes(value: string): Uint8Array {
  // Accept both standard and URL-safe base64, with or without padding.
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Pulls the raw key bytes out of whatever envelope the vendor returns. */
function extractKeyMaterial(payload: unknown): string | null {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['publicKey', 'public_key', 'key', 'data']) {
      const value = record[key];
      if (typeof value === 'string') return value;
    }
  }
  return null;
}

let cachedKey: { key: CryptoKey; fetchedAt: number } | null = null;

/** Returns null when the key cannot be fetched or imported — a 503, not a 401. */
async function getPublicKey(): Promise<CryptoKey | null> {
  if (cachedKey && Date.now() - cachedKey.fetchedAt < PUBLIC_KEY_TTL_MS) {
    return cachedKey.key;
  }
  try {
    const response = await fetch(PUBLIC_KEY_URL);
    if (!response.ok) {
      console.error('gnosispay-webhook: public key fetch HTTP', response.status);
      return null;
    }
    const raw = extractKeyMaterial(await response.json());
    if (!raw) {
      console.error('gnosispay-webhook: public key payload had no recognisable field');
      return null;
    }
    // Strip PEM armour if present, leaving base64 in either case.
    const body = raw.includes('-----')
      ? raw.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
      : raw;

    const bytes = base64ToBytes(body);
    // A bare Ed25519 public key is 32 bytes; anything longer is SPKI-wrapped.
    const key = await crypto.subtle.importKey(
      bytes.length === 32 ? 'raw' : 'spki',
      bytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    cachedKey = { key, fetchedAt: Date.now() };
    return key;
  } catch (error) {
    console.error('gnosispay-webhook: public key unavailable', error);
    return null;
  }
}

type Verdict = 'valid' | 'invalid' | 'unavailable';

async function verify(rawBody: string, timestamp: string, signature: string): Promise<Verdict> {
  const key = await getPublicKey();
  if (!key) return 'unavailable';
  try {
    const valid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      base64ToBytes(signature),
      new TextEncoder().encode(`${timestamp}.${rawBody}`),
    );
    return valid ? 'valid' : 'invalid';
  } catch (error) {
    // A malformed signature lands here; that is a bad request, not an outage.
    console.error('gnosispay-webhook: signature could not be checked', error);
    return 'invalid';
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const timestamp = req.headers.get('X-Webhook-Timestamp') ?? '';
  const signature = req.headers.get('X-Webhook-Signature') ?? '';
  const rawBody = await req.text();

  if (!timestamp || !signature) {
    return json(401, { ok: false, code: 'MISSING_SIGNATURE' });
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS) {
    return json(401, { ok: false, code: 'STALE_TIMESTAMP' });
  }

  const verdict = await verify(rawBody, timestamp, signature);
  if (verdict === 'unavailable') {
    // Ask Gnosis Pay to retry rather than dropping a legitimate event.
    return json(503, { ok: false, code: 'VERIFY_UNAVAILABLE' });
  }
  if (verdict === 'invalid') {
    return json(401, { ok: false, code: 'BAD_SIGNATURE' });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    // Signed but malformed: acknowledge so it is not retried forever.
    console.error('gnosispay-webhook: signed body was not JSON');
    return json(200, { ok: true });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, code: 'NOT_CONFIGURED' });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const data = event.data ?? {};
  const gpUserId =
    typeof data.userId === 'string'
      ? data.userId
      : typeof data.id === 'string'
        ? data.id
        : null;

  try {
    if (event.type === 'kyc.status.changed' && gpUserId) {
      const status = typeof data.status === 'string' ? data.status : '';
      // Only the transition the app waits on. Everything else is informational:
      // the wizard polls GET /user while foregrounded and will see it anyway.
      if (status === 'approved') {
        const { error } = await admin
          .from('merchant_payment_accounts')
          .update({ status: 'kyc_approved', updated_at: new Date().toISOString() })
          .eq('gp_user_id', gpUserId)
          .eq('status', 'pending_kyc');
        if (error) throw error;
      }
    }
    // user.created and card.transaction.created carry no slice-1a behaviour:
    // gp_user_id is bound by the app right after signup, and the card ledger
    // is spec 3. They are acknowledged so Gnosis Pay stops retrying.
  } catch (error) {
    console.error('gnosispay-webhook: registry update failed', error);
    // 500 so the event is redelivered — losing an approval would strand a
    // merchant on the waiting screen.
    return json(500, { ok: false, code: 'UPDATE_FAILED' });
  }

  return json(200, { ok: true });
});
