import { supabase } from './supabase';

export type BuyerInterestErrorCode =
  | 'NO_WALLET'
  | 'BAD_REQUEST'
  | 'USER_NOT_FOUND'
  | 'NO_EMAIL_ON_USER'
  | 'INSERT_FAILED'
  | 'INTERNAL'
  | 'INVOKE_FAILED';

export type BuyerInterestResult =
  | { ok: true; alreadyRegistered: boolean; email: string }
  | { ok: false; code: BuyerInterestErrorCode; error?: string };

type EdgeResponse = {
  ok?: boolean;
  alreadyRegistered?: boolean;
  email?: string;
  code?: BuyerInterestErrorCode;
  error?: string;
};

async function invoke(mode: 'check' | 'submit', wallet: string): Promise<BuyerInterestResult> {
  // Mock-client fallback (when SUPABASE_URL/KEY are missing in dev).
  // The mock builder in lib/supabase.ts doesn't include `.functions`.
  const fn = (supabase as unknown as { functions?: typeof supabase.functions }).functions;
  if (!fn || typeof fn.invoke !== 'function') {
    console.warn('Supabase functions client unavailable — skipping buyer-card-interest invoke.');
    return { ok: false, code: 'INTERNAL', error: 'Supabase functions unavailable' };
  }

  const { data, error } = await fn.invoke<EdgeResponse>('buyer-card-interest', {
    body: { mode, wallet },
  });

  if (error) {
    return { ok: false, code: 'INVOKE_FAILED', error: error.message };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, code: 'INTERNAL', error: 'Empty response' };
  }

  if (data.ok && typeof data.email === 'string') {
    return {
      ok: true,
      alreadyRegistered: !!data.alreadyRegistered,
      email: data.email,
    };
  }

  return {
    ok: false,
    code: data.code ?? 'INTERNAL',
    error: data.error,
  };
}

export function checkBuyerCardInterest(wallet: string): Promise<BuyerInterestResult> {
  return invoke('check', wallet);
}

export function submitBuyerCardInterest(wallet: string): Promise<BuyerInterestResult> {
  return invoke('submit', wallet);
}
