// Supabase helpers for Röbel Card charges (two-step partner → buyer flow).
//
// - createChargeFromQr: partner-side create via HMAC-verified RPC. Takes
//   the scanned v2 QR payload, the amount, and an optional note. The
//   server parses + verifies the HMAC against the card's qr_secret and
//   inserts the row (see migration 20260415).
// - fetchSignedCardQr: buyer-side. Returns a freshly signed v2 payload
//   valid for 60 seconds.
// - fetchChargeById: poll target for partner waiting state.
// - fetchPendingChargesForCard: poll target for buyer approval modal.
// - approveCharge / declineCharge: RPC calls (security definer functions).

import { supabase } from './supabase';

export type ChargeStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'expired'
  | 'reversed';

export interface RoebelCardChargeRow {
  id: string;
  card_id: string;
  partner_id: string;
  amount_cents: number;
  offer_id: string | null;
  status: ChargeStatus;
  partner_note: string | null;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  declined_at: string | null;
}

export interface PendingChargeWithPartner extends RoebelCardChargeRow {
  partner_name: string | null;
}

/**
 * Partner-side: create a pending charge via the HMAC-verified RPC.
 * The partner hands the FULL v2 payload string (including the HMAC and
 * expiry) returned by the buyer's scanned QR. The server parses the
 * payload, verifies the HMAC against the card's qr_secret, checks
 * expiry, and validates that the caller is an approved partner before
 * inserting. See migration 20260415.
 */
export async function createChargeFromQr(input: {
  qrPayload: string;
  amountCents: number;
  partnerNote?: string;
  walletAddress: string;
}): Promise<RoebelCardChargeRow> {
  const { data, error } = await supabase.rpc(
    'create_roebel_card_charge_from_qr' as any,
    {
      p_qr_payload: input.qrPayload,
      p_amount_cents: input.amountCents,
      p_partner_note: input.partnerNote ?? null,
      p_wallet_address: input.walletAddress.toLowerCase(),
    } as any,
  );

  if (error) {
    console.error('createChargeFromQr error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  return data as RoebelCardChargeRow;
}

/**
 * Buyer-side: fetch a freshly-signed QR payload. Valid for 60 seconds.
 * The screen that shows the QR should refresh this every ~30 seconds
 * so the displayed code is always at least 30 seconds away from expiry.
 */
export async function fetchSignedCardQr(
  cardId: string,
  walletAddress: string,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    'sign_roebel_card_qr' as any,
    { p_card_id: cardId, p_wallet_address: walletAddress.toLowerCase() } as any,
  );
  if (error) throw error;
  return data as string;
}

export async function fetchChargeById(
  chargeId: string,
): Promise<RoebelCardChargeRow | null> {
  const { data, error } = await supabase
    .from('roebel_card_charges' as any)
    .select('*')
    .eq('id', chargeId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('fetchChargeById error:', error);
    return null;
  }
  return (data as RoebelCardChargeRow | null) ?? null;
}

/**
 * Buyer-side: fetch all pending charges targeting a given card.
 * Also joins the partner's account name so the approval modal can show
 * "Partner X wants to charge Y €" without a second round-trip.
 *
 * Filters to non-expired at query time so stale pendings don't surface.
 */
export async function fetchPendingChargesForCard(
  cardId: string,
): Promise<PendingChargeWithPartner[]> {
  const nowIso = new Date().toISOString();

  // Step 1: charges only. No PostgREST embed — schema-cache /
  // relationship-resolution issues silently dropped rows here in the past.
  const { data, error } = await supabase
    .from('roebel_card_charges' as any)
    .select('*')
    .eq('card_id', cardId)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchPendingChargesForCard error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  const charges = (data ?? []) as RoebelCardChargeRow[];
  console.log('[fetchPendingChargesForCard]', {
    cardId,
    nowIso,
    rowCount: charges.length,
  });
  if (charges.length === 0) return [];

  // Step 2: fan out to partner names with one round-trip per unique
  // partner_id. Uses .in() so it's still a single query.
  const partnerIds = Array.from(new Set(charges.map((c) => c.partner_id)));
  const partnerNameById = new Map<string, string | null>();
  const { data: partnerRows, error: partnerError } = await supabase
    .from('roebel_card_partners' as any)
    .select('id, accounts(name)')
    .in('id', partnerIds);

  if (partnerError) {
    console.error('fetchPendingChargesForCard partner lookup error:', partnerError);
  } else {
    for (const row of (partnerRows ?? []) as any[]) {
      const acc = row.accounts;
      const name: string | null =
        acc && typeof acc === 'object' ? (acc.name as string | null) ?? null : null;
      partnerNameById.set(row.id as string, name);
    }
  }

  return charges.map((c) => ({
    ...c,
    partner_name: partnerNameById.get(c.partner_id) ?? null,
  }));
}

/**
 * Resolve a partner's display name (= their account.name) from the
 * partner id. Used by the Realtime path on my-card to enrich the bare
 * charge row delivered by `postgres_changes` (which carries no joined
 * data). Returns null if the lookup fails or the partner has no name.
 */
export async function fetchPartnerName(
  partnerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('roebel_card_partners' as any)
    .select('accounts(name)')
    .eq('id', partnerId)
    .maybeSingle();

  if (error) {
    console.error('fetchPartnerName error:', error);
    return null;
  }
  const acc = (data as any)?.accounts;
  return acc && typeof acc === 'object'
    ? ((acc.name as string | null) ?? null)
    : null;
}

/**
 * Call the approve RPC. Throws on any business-logic error
 * (insufficient balance, expired, not owner, etc.).
 */
export async function approveCharge(
  chargeId: string,
  walletAddress: string,
): Promise<RoebelCardChargeRow> {
  const { data, error } = await supabase.rpc(
    'approve_roebel_card_charge' as any,
    { p_charge_id: chargeId, p_wallet_address: walletAddress.toLowerCase() } as any,
  );
  if (error) throw error;
  return data as RoebelCardChargeRow;
}

/**
 * Call the decline RPC. Throws if the charge is no longer pending.
 */
export async function declineCharge(
  chargeId: string,
  walletAddress: string,
): Promise<RoebelCardChargeRow> {
  const { data, error } = await supabase.rpc(
    'decline_roebel_card_charge' as any,
    { p_charge_id: chargeId, p_wallet_address: walletAddress.toLowerCase() } as any,
  );
  if (error) throw error;
  return data as RoebelCardChargeRow;
}

/**
 * Map RPC errors to German user-facing messages.
 *
 * Primary path: SQLSTATE code from the RPC's `using errcode = 'P0xxx'` clauses
 * in 20260419_roebel_card_rpc_wallet_param.sql — stable contract.
 * Fallback: legacy substring match on message text.
 * Final fallback includes the raw code/message so device logs and screenshots
 * are self-diagnosing.
 */
export function chargeErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const msg = e?.message ?? '';

  switch (code) {
    case 'P0001': return 'Nicht angemeldet';
    case 'P0002': return 'Zahlung nicht gefunden';
    case 'P0003': return 'Zahlung ist nicht mehr offen';
    case 'P0004': return 'Zahlung ist abgelaufen';
    case 'P0005': return 'Karte nicht gefunden';
    case 'P0006': return 'Nicht berechtigt';
    case 'P0007': return 'Karte ist nicht aktiv';
    case 'P0008': return 'Guthaben nicht ausreichend';
    case 'P0010': return 'Ungültiger Betrag';
    case 'P0011': return 'Betrag zu hoch (max. 10.000 €)';
    case 'P0012': return 'QR-Code konnte nicht gelesen werden';
    case 'P0013': return 'QR-Code ist ungültig oder manipuliert';
    case 'P0014': return 'QR-Code ist abgelaufen. Bitte neu scannen.';
    case 'P0015': return 'Dein Partnerzugang ist nicht freigeschaltet. Bitte warte auf Admin-Freigabe.';
  }

  if (msg.includes('guthaben_nicht_ausreichend')) return 'Guthaben nicht ausreichend';
  if (msg.includes('zahlung_abgelaufen')) return 'Zahlung ist abgelaufen';
  if (msg.includes('zahlung_nicht_offen')) return 'Zahlung ist nicht mehr offen';
  if (msg.includes('karte_nicht_aktiv')) return 'Karte ist nicht aktiv';
  if (msg.includes('karte_nicht_gefunden')) return 'Karte nicht gefunden';
  if (msg.includes('nicht_berechtigt')) return 'Nicht berechtigt';
  if (msg.includes('nicht_authentifiziert')) return 'Nicht angemeldet';
  if (msg.includes('zahlung_nicht_gefunden')) return 'Zahlung nicht gefunden';
  if (msg.includes('betrag_ungueltig')) return 'Ungültiger Betrag';
  if (msg.includes('betrag_zu_hoch')) return 'Betrag zu hoch (max. 10.000 €)';
  if (msg.includes('qr_signatur_ungueltig')) return 'QR-Code ist ungültig oder manipuliert';
  if (msg.includes('qr_abgelaufen')) return 'QR-Code ist abgelaufen. Bitte neu scannen.';
  if (msg.includes('qr_ungueltig')) return 'QR-Code konnte nicht gelesen werden';
  if (msg.includes('partner_nicht_freigeschaltet')) return 'Dein Partnerzugang ist nicht freigeschaltet';

  const tag = code || msg || 'unbekannt';
  return `Etwas ist schiefgelaufen (${tag})`;
}
