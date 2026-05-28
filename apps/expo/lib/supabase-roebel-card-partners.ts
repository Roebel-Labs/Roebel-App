// Supabase helpers for the Röbel Card partner voucher system.
// Reads/writes the roebel_card_partners table.

import { supabase } from './supabase';
import { normalizeIban, ibanLast4 } from './iban';
import type { AgreementMetadata } from './roebel-card-agreement-metadata';

export type Rechtsform =
  | 'einzelunternehmen'
  | 'gbr'
  | 'ug'
  | 'gmbh'
  | 'gmbh_co_kg'
  | 'ag'
  | 'ev'
  | 'ek'
  | 'ohg'
  | 'kg'
  | 'sonstige';

export const RECHTSFORM_LABELS: Record<Rechtsform, string> = {
  einzelunternehmen: 'Einzelunternehmen',
  gbr: 'GbR',
  ug: 'UG (haftungsbeschränkt)',
  gmbh: 'GmbH',
  gmbh_co_kg: 'GmbH & Co. KG',
  ag: 'AG',
  ev: 'e.V.',
  ek: 'e.K.',
  ohg: 'OHG',
  kg: 'KG',
  sonstige: 'Sonstige',
};

export type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface RoebelCardPartnerRow {
  id: string;
  account_id: string;
  iban_encrypted: string | null;
  iban_last4: string | null;
  bic: string | null;
  account_holder: string | null;
  rechtsform: Rechtsform | null;
  vat_id: string | null;
  agreement_metadata: AgreementMetadata | null;
  agreement_version: string | null;
  agreement_signed_at: string | null;
  status: PartnerStatus;
  pending_balance_cents: number;
  lifetime_volume_cents: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePartnerInput {
  accountId: string;
  rechtsform: Rechtsform;
  vatId: string | null;
  iban: string;
  bic: string | null;
  accountHolder: string;
  agreementMetadata: AgreementMetadata;
}

/**
 * Two-step partner creation:
 *   1. INSERT the row WITHOUT the IBAN so RLS + check constraints apply.
 *   2. RPC set_partner_iban() which encrypts the IBAN using the server
 *      side GUC key (see migration 20260414).
 *
 * The IBAN is never stored plain — it lives only in iban_encrypted_bytea
 * and can only be decrypted by the admin dashboard via the service_role
 * key (see admin_get_partner_iban RPC).
 */
export async function createRoebelCardPartner(
  input: CreatePartnerInput,
): Promise<RoebelCardPartnerRow> {
  const iban = normalizeIban(input.iban);

  const { data, error } = await supabase
    .from('roebel_card_partners' as any)
    .insert({
      account_id: input.accountId,
      // iban_encrypted left NULL — set via RPC below.
      iban_last4: ibanLast4(iban),
      bic: input.bic || null,
      account_holder: input.accountHolder,
      rechtsform: input.rechtsform,
      vat_id: input.vatId || null,
      agreement_metadata: input.agreementMetadata,
      agreement_version: input.agreementMetadata.agreement_version,
      agreement_signed_at: input.agreementMetadata.accepted_at,
      status: 'pending' as PartnerStatus,
    } as any)
    .select()
    .single();

  if (error) throw error;
  const partnerRow = data as RoebelCardPartnerRow;

  // Encrypt the IBAN server-side. If this fails, surface the error but
  // leave the row in place — the partner can retry and we'll update
  // iban_encrypted_bytea without creating a duplicate row (account_id is
  // UNIQUE, so re-inserting the same org would fail).
  const { error: ibanError } = await supabase.rpc(
    'set_partner_iban' as any,
    { p_partner_id: partnerRow.id, p_iban_plain: iban } as any,
  );

  if (ibanError) {
    throw ibanError;
  }

  return partnerRow;
}

export async function fetchPartnerByAccountId(
  accountId: string,
): Promise<RoebelCardPartnerRow | null> {
  const { data, error } = await supabase
    .from('roebel_card_partners' as any)
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('fetchPartnerByAccountId error:', error);
    return null;
  }
  return (data as RoebelCardPartnerRow | null) ?? null;
}

/**
 * Find all `roebel_card_partners` rows that belong to any org the given
 * wallet is a member of (creator OR invited admin OR member). Used to
 * decide whether to show the partner dashboard or the registration ad.
 *
 * Implemented as two simple queries to dodge PostgREST's flaky chained
 * `!inner` embeds — the previous single-query version with
 * `accounts!inner(account_owners!inner(...))` only resolved the partner
 * for the org's *creator*, not for invited admins added later via
 * acceptInvite (both end up in account_owners with the same shape, but
 * the chained embed-filter silently dropped non-creator rows).
 */
export async function fetchPartnersByWallet(
  walletAddress: string,
): Promise<RoebelCardPartnerRow[]> {
  const normalized = walletAddress.toLowerCase();

  // Step 1: every account this wallet has access to.
  const { data: ownerRows, error: ownerError } = await supabase
    .from('account_owners' as any)
    .select('account_id')
    .eq('wallet_address', normalized);

  if (ownerError) {
    console.error('fetchPartnersByWallet owners error:', ownerError);
    return [];
  }

  const accountIds = Array.from(
    new Set(
      ((ownerRows ?? []) as { account_id: string }[]).map((r) => r.account_id),
    ),
  );
  console.log('[fetchPartnersByWallet] owners', {
    wallet: normalized,
    accountCount: accountIds.length,
  });
  if (accountIds.length === 0) return [];

  // Step 2: partner rows for those accounts.
  const { data, error } = await supabase
    .from('roebel_card_partners' as any)
    .select('*')
    .in('account_id', accountIds);

  if (error) {
    console.error('fetchPartnersByWallet partners error:', error);
    return [];
  }

  const rows = (data ?? []) as RoebelCardPartnerRow[];
  console.log('[fetchPartnersByWallet] partners', {
    wallet: normalized,
    partnerCount: rows.length,
    statuses: rows.map((r) => r.status),
  });
  return rows;
}

/**
 * Recent charges for a partner. For session 2 this is always empty (no real
 * charge flow yet) but the query is ready for the next session.
 */
export interface PartnerChargeRow {
  id: string;
  card_id: string;
  partner_id: string | null;
  amount_cents: number;
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'reversed';
  partner_note: string | null;
  created_at: string;
  approved_at: string | null;
}

/**
 * Fetch all approved partners with their org name + avatar for the
 * buyer-facing partner list on the "Meine Karte" screen.
 */
export interface ApprovedPartnerDisplay {
  id: string;
  account_id: string;
  account_name: string;
  avatar_url: string | null;
}

export async function fetchApprovedPartners(): Promise<ApprovedPartnerDisplay[]> {
  const { data, error } = await supabase
    .from('roebel_card_partners' as any)
    .select('id, account_id, accounts!account_id(name, avatar_url)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchApprovedPartners error:', error);
    return [];
  }

  return (data as any[]).map((row: any) => ({
    id: row.id as string,
    account_id: row.account_id as string,
    account_name: (row.accounts?.name as string) ?? 'Partner',
    avatar_url: (row.accounts?.avatar_url as string | null) ?? null,
  }));
}

export async function fetchRecentChargesByPartner(
  partnerId: string,
  limit = 200,
): Promise<PartnerChargeRow[]> {
  const { data, error } = await supabase
    .from('roebel_card_charges' as any)
    .select('id, card_id, partner_id, amount_cents, status, partner_note, created_at, approved_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('fetchRecentChargesByPartner error:', error);
    return [];
  }
  return (data as any[]) as PartnerChargeRow[];
}
