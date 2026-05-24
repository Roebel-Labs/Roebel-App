// Browser-side Supabase helpers for the Röbel Card partner registration.
// Mirrors apps/expo/lib/supabase-roebel-card-partners.ts so org owners can
// register from either platform against the same roebel_card_partners table.

import { createClient } from "@/lib/supabase/client";
import { ibanLast4, normalizeIban } from "@/lib/iban";
import type { AgreementMetadata } from "@/lib/roebel-card-agreement-metadata";
import type {
  PartnerStatus,
  Rechtsform,
  RoebelCardPartnerRow,
} from "@/types/roebel-card-voucher";

export type { PartnerStatus, Rechtsform, RoebelCardPartnerRow };
export { RECHTSFORM_LABELS } from "@/types/roebel-card-voucher";

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
 *   2. RPC set_partner_iban() which encrypts the IBAN server-side via
 *      pg_sodium / pgp_sym_encrypt (see migration 20260420).
 *
 * The plain IBAN is never stored — it lives only in iban_encrypted_bytea and
 * can only be decrypted by admins via admin_get_partner_iban (service_role).
 */
export async function createRoebelCardPartner(
  input: CreatePartnerInput,
): Promise<RoebelCardPartnerRow> {
  const supabase = createClient();
  const iban = normalizeIban(input.iban);

  const { data, error } = await supabase
    .from("roebel_card_partners")
    .insert({
      account_id: input.accountId,
      iban_last4: ibanLast4(iban),
      bic: input.bic || null,
      account_holder: input.accountHolder,
      rechtsform: input.rechtsform,
      vat_id: input.vatId || null,
      agreement_metadata: input.agreementMetadata,
      agreement_version: input.agreementMetadata.agreement_version,
      agreement_signed_at: input.agreementMetadata.accepted_at,
      status: "pending" as PartnerStatus,
    })
    .select()
    .single();

  if (error) throw error;
  const partnerRow = data as RoebelCardPartnerRow;

  const { error: ibanError } = await supabase.rpc("set_partner_iban", {
    p_partner_id: partnerRow.id,
    p_iban_plain: iban,
  });

  if (ibanError) throw ibanError;

  return partnerRow;
}

export async function fetchPartnerByAccountId(
  accountId: string,
): Promise<RoebelCardPartnerRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roebel_card_partners")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("fetchPartnerByAccountId error:", error);
    return null;
  }
  return (data as RoebelCardPartnerRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Charges (read-only for the partner-facing dashboard)
// ---------------------------------------------------------------------------

export type RoebelCardChargeStatus =
  | "pending"
  | "approved"
  | "declined"
  | "expired"
  | "reversed";

export interface RoebelCardChargeRow {
  id: string;
  card_id: string;
  partner_id: string;
  amount_cents: number;
  offer_id: string | null;
  status: RoebelCardChargeStatus;
  partner_note: string | null;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  declined_at: string | null;
}

/**
 * Fetch a partner's charges from the last `days` days (default 90). Used by
 * the Übersicht and Transaktionen pages. The 90-day window plus the
 * idx_roebel_charges_partner index keeps this a single, fast query — KPIs
 * and the revenue chart both derive from the same array client-side so we
 * never round-trip twice for the same screen.
 */
export async function fetchChargesForPartner(
  partnerId: string,
  days = 90,
): Promise<RoebelCardChargeRow[]> {
  const supabase = createClient();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("roebel_card_charges")
    .select(
      "id, card_id, partner_id, amount_cents, offer_id, status, partner_note, created_at, expires_at, approved_at, declined_at",
    )
    .eq("partner_id", partnerId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchChargesForPartner error:", error);
    return [];
  }
  return (data ?? []) as RoebelCardChargeRow[];
}

/**
 * Update a partner's IBAN. Mirrors the second step of createRoebelCardPartner
 * so the Einstellungen page can let an approved partner rotate their IBAN
 * without re-running the entire registration. Updates iban_last4 directly
 * (RLS allows anon update on roebel_card_partners per migration 20260418 +
 * 20260523 prod repair) and then encrypts the full IBAN server-side via
 * the set_partner_iban RPC.
 */
export async function updatePartnerIban(
  partnerId: string,
  ibanPlain: string,
): Promise<void> {
  const supabase = createClient();
  const iban = normalizeIban(ibanPlain);

  const { error: updateError } = await supabase
    .from("roebel_card_partners")
    .update({ iban_last4: ibanLast4(iban) })
    .eq("id", partnerId);
  if (updateError) throw updateError;

  const { error: rpcError } = await supabase.rpc("set_partner_iban", {
    p_partner_id: partnerId,
    p_iban_plain: iban,
  });
  if (rpcError) throw rpcError;
}
