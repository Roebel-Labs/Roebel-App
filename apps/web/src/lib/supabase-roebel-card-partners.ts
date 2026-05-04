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
