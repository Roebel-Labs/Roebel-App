import Stripe from "stripe";
import { ADDR } from "@/lib/muenzen/constants";

/**
 * Gemeinschaftskasse contribution ("Unterstützungsbeitrag") configuration.
 *
 * Wording is deliberately NOT "Spende": Stripe's ToS restricts charitable
 * fundraising by non-charities in Germany, and without a gemeinnütziger e.V.
 * no tax-deductible Spende exists. Flip the copy (and apply for Stripe's
 * nonprofit program) once the e.V. + Freistellungsbescheid are in place.
 * Background: docs/MONERIUM_FIAT_TREASURY_RESEARCH.md §5/§6.
 */
export const DONATION_CONFIG = {
  currency: "eur",
  MIN_AMOUNT_CENTS: 100, //      1 €
  MAX_AMOUNT_CENTS: 500000, // 5000 €
  PRESET_AMOUNTS_CENTS: [500, 1000, 2500, 5000, 10000] as const,
  MAX_DONOR_NAME_LEN: 60,
  MAX_DONOR_MESSAGE_LEN: 280,
} as const;

/** The Gemeinschaftskasse Safe on Gnosis — where every rail ultimately settles. */
export const TREASURY_SAFE = ADDR.safe;

// ---------------------------------------------------------------------------
// SEPA reference codes
// ---------------------------------------------------------------------------

// No confusing chars (0/O, 1/I) — donors retype this into their banking app.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Matches a reference code anywhere inside a SEPA memo / Verwendungszweck. */
export const DONATION_CODE_REGEX = /RBL-[A-HJ-NP-Z2-9]{6}/i;

export function generateDonationCode(): string {
  let code = "RBL-";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

// ---------------------------------------------------------------------------
// Stripe checkout metadata
// ---------------------------------------------------------------------------

export interface TreasuryDonationMetadata {
  kind: "treasury_donation";
  donation_id: string;
  amount_cents: string;
  donor_name: string;
  donor_wallet_address: string;
  public_visible: string;
}

/**
 * Validates a Stripe session's metadata as a well-formed treasury
 * contribution. Throws on missing/invalid fields so the webhook fails
 * loudly (mirrors parseRoebelCardMetadata).
 */
export function parseTreasuryDonationMetadata(
  metadata: Stripe.Metadata | null,
): TreasuryDonationMetadata {
  if (!metadata) {
    throw new Error("missing metadata on Stripe session");
  }
  if (metadata.kind !== "treasury_donation") {
    throw new Error(`unexpected metadata.kind: ${metadata.kind}`);
  }
  if (!metadata.donation_id) {
    throw new Error("missing metadata.donation_id");
  }
  if (!metadata.amount_cents) {
    throw new Error("missing metadata.amount_cents");
  }
  return {
    kind: "treasury_donation",
    donation_id: metadata.donation_id,
    amount_cents: metadata.amount_cents,
    donor_name: metadata.donor_name ?? "",
    donor_wallet_address: metadata.donor_wallet_address ?? "",
    public_visible: metadata.public_visible ?? "true",
  };
}
