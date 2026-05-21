/**
 * Supabase Edge Function: buyer-card-interest
 *
 * Records Röbel Card interest signals from the Expo app into the same
 * `card_interest` table the web landing page writes to via
 * `apps/web/src/app/actions/card-interest.ts`. We don't show a modal in the
 * app — the user is already logged in, so we resolve their email and
 * username server-side from the `users` row keyed by wallet.
 *
 * Modes:
 *   - check  → has the user already submitted? (no write)
 *   - submit → upsert by email (UNIQUE constraint dedups; 23505 → alreadyRegistered)
 *
 * Deploy: supabase functions deploy buyer-card-interest
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are platform-injected.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

type CheckBody = { mode: 'check'; wallet: string };
type SubmitBody = { mode: 'submit'; wallet: string };
type Body = CheckBody | SubmitBody;

type ErrorCode =
  | 'NO_WALLET'
  | 'BAD_REQUEST'
  | 'USER_NOT_FOUND'
  | 'NO_EMAIL_ON_USER'
  | 'INSERT_FAILED'
  | 'INTERNAL';

const PLZ_ROEBEL = '17207';
const SOURCE = 'roebel-card-app-expo';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(code: ErrorCode, status = 400, error?: string) {
  return json(status, { ok: false, code, ...(error ? { error } : {}) });
}

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return fail('BAD_REQUEST', 405, 'Method not allowed');
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail('BAD_REQUEST', 400, 'Invalid JSON');
  }

  if (!body || (body.mode !== 'check' && body.mode !== 'submit')) {
    return fail('BAD_REQUEST', 400, 'mode must be "check" or "submit"');
  }

  if (!isHexAddress(body.wallet)) {
    return fail('NO_WALLET', 400, 'wallet must be a 0x-prefixed 40-char hex address');
  }

  const wallet = body.wallet.toLowerCase();

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return fail('INTERNAL', 500, 'Server misconfigured');
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('email, username')
    .eq('wallet_address', wallet)
    .maybeSingle();

  if (userError) {
    console.error('users lookup failed:', userError);
    return fail('INTERNAL', 500, userError.message);
  }

  if (!userRow) {
    return fail('USER_NOT_FOUND', 404);
  }

  const rawEmail = typeof userRow.email === 'string' ? userRow.email.trim() : '';
  if (!rawEmail) {
    return fail('NO_EMAIL_ON_USER', 422);
  }

  const email = rawEmail.toLowerCase();
  const firstName =
    typeof userRow.username === 'string' && userRow.username.trim().length > 0
      ? userRow.username.trim()
      : null;

  if (body.mode === 'check') {
    const { data: existing, error: checkError } = await supabase
      .from('card_interest')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (checkError) {
      console.error('card_interest check failed:', checkError);
      return fail('INTERNAL', 500, checkError.message);
    }

    return json(200, { ok: true, alreadyRegistered: !!existing, email });
  }

  // mode === 'submit'
  const { error: insertError } = await supabase.from('card_interest').insert({
    email,
    plz: PLZ_ROEBEL,
    first_name: firstName,
    source: SOURCE,
  });

  if (insertError) {
    // 23505 = unique_violation → already registered
    if ((insertError as { code?: string }).code === '23505') {
      return json(200, { ok: true, alreadyRegistered: true, email });
    }
    console.error('card_interest insert failed:', insertError);
    return fail('INSERT_FAILED', 500, insertError.message);
  }

  return json(200, { ok: true, alreadyRegistered: false, email });
});
