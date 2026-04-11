// Supabase helpers for Röbel Card charges (two-step partner → buyer flow).
//
// - createCharge: partner-side INSERT via RLS policy (must be an approved
//   partner owned by the caller's wallet).
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

export interface CreateChargeInput {
  cardId: string;
  partnerId: string;
  amountCents: number;
  partnerNote?: string;
}

/**
 * Partner-side: create a new pending charge targeting the buyer's card.
 * Status defaults to 'pending' with expires_at = now() + 2 minutes.
 */
export async function createCharge(
  input: CreateChargeInput,
): Promise<RoebelCardChargeRow> {
  const builder = supabase.from('roebel_card_charges' as any) as any;
  const { data, error } = await builder
    .insert({
      card_id: input.cardId,
      partner_id: input.partnerId,
      amount_cents: input.amountCents,
      partner_note: input.partnerNote ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data as RoebelCardChargeRow;
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

  const { data, error } = await supabase
    .from('roebel_card_charges' as any)
    .select(
      '*, roebel_card_partners!inner(id, accounts!inner(name))',
    )
    .eq('card_id', cardId)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchPendingChargesForCard error:', error);
    return [];
  }

  return (data as any[]).map((row) => {
    const partnerAccount = row.roebel_card_partners?.accounts;
    const partnerName: string | null =
      partnerAccount && typeof partnerAccount === 'object'
        ? (partnerAccount.name as string | null) ?? null
        : null;
    const {
      roebel_card_partners: _partner,
      ...rest
    } = row;
    return {
      ...(rest as RoebelCardChargeRow),
      partner_name: partnerName,
    };
  });
}

/**
 * Call the approve RPC. Throws on any business-logic error
 * (insufficient balance, expired, not owner, etc.).
 */
export async function approveCharge(
  chargeId: string,
): Promise<RoebelCardChargeRow> {
  const { data, error } = await supabase.rpc(
    'approve_roebel_card_charge' as any,
    { p_charge_id: chargeId } as any,
  );
  if (error) throw error;
  return data as RoebelCardChargeRow;
}

/**
 * Call the decline RPC. Throws if the charge is no longer pending.
 */
export async function declineCharge(
  chargeId: string,
): Promise<RoebelCardChargeRow> {
  const { data, error } = await supabase.rpc(
    'decline_roebel_card_charge' as any,
    { p_charge_id: chargeId } as any,
  );
  if (error) throw error;
  return data as RoebelCardChargeRow;
}

/**
 * Map the Postgres error message strings (thrown as exception names in the
 * RPC functions) to German user-facing messages.
 */
export function chargeErrorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? '';
  if (msg.includes('guthaben_nicht_ausreichend')) return 'Guthaben nicht ausreichend';
  if (msg.includes('zahlung_abgelaufen')) return 'Zahlung ist abgelaufen';
  if (msg.includes('zahlung_nicht_offen')) return 'Zahlung ist nicht mehr offen';
  if (msg.includes('karte_nicht_aktiv')) return 'Karte ist nicht aktiv';
  if (msg.includes('nicht_berechtigt')) return 'Nicht berechtigt';
  if (msg.includes('nicht_authentifiziert')) return 'Nicht angemeldet';
  if (msg.includes('zahlung_nicht_gefunden')) return 'Zahlung nicht gefunden';
  return 'Etwas ist schiefgelaufen';
}
