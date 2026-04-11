import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

// The default/primary Stripe client — used for event tickets and anything
// else that shares the main Stripe account.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Röbel Card Stripe client. The voucher system runs on a SEPARATE Stripe
 * account (different business entity / compliance profile), so it has its
 * own secret key, publishable key, and webhook signing secret:
 *
 *   STRIPE_SECRET_KEY_CARD          (used here, server-side)
 *   NEXT_PUBLIC_STRIPE_PUBLIC_KEY_CARD (client-side, for Stripe Elements)
 *   STRIPE_WEBHOOK_SECRET_CARD      (webhook signature verification)
 *
 * Falls back to the default key if the card-specific key is missing so
 * local dev without the split setup still works.
 */
const cardSecretKey =
  process.env.STRIPE_SECRET_KEY_CARD ?? process.env.STRIPE_SECRET_KEY;
export const stripeCard = new Stripe(cardSecretKey);

// Event ticket configuration
export const TICKET_CONFIG = {
  event_name: "MV Boxen Landesmeisterschaft 2026",
  event_location: "Turnhalle am Gotthunskamp, Röbel/Müritz",
  price_cents: 299, // €2.99
  currency: "eur",
  days: {
    saturday: { date: "7. März 2026", label: "Samstag" },
    sunday: { date: "8. März 2026", label: "Sonntag" },
  },
} as const;

export type EventDay = keyof typeof TICKET_CONFIG.days;

// Generate a unique ticket code
export function generateTicketCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like 0/O, 1/I
  let code = "BOXEN-2026-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ---------------------------------------------------------------------------
// Röbel Card voucher configuration
// ---------------------------------------------------------------------------

/**
 * Röbel Card voucher configuration.
 *
 * Fee model: "fee on top". Buyer picks a face value `A`; Stripe charges
 * `A + fee`. The full `A` is credited to the card; the fee is split:
 *   - 5 % to the chosen Verein (or Röbeler Topf)
 *   - 4 % reserved as partner redemption bonus (stays in Treuhand until spent)
 *   - 1 % operational
 */
export const ROEBEL_CARD_CONFIG = {
  currency: "eur",
  MIN_AMOUNT_CENTS: 500, //   5 €
  MAX_AMOUNT_CENTS: 50000, // 500 €
  PRESET_AMOUNTS_CENTS: [1000, 2500, 5000, 10000] as const,
  FEE_BPS: 1000, // 10 %
  VEREINE_BPS: 500, // 5 %
  // Partner pool & ops shares are implicit (fee - vereine share).
} as const;

export function computeRoebelCardFee(amountCents: number): {
  feeCents: number;
  vereineCents: number;
  totalCents: number;
} {
  const feeCents = Math.floor((amountCents * ROEBEL_CARD_CONFIG.FEE_BPS) / 10000);
  const vereineCents = Math.floor(
    (amountCents * ROEBEL_CARD_CONFIG.VEREINE_BPS) / 10000,
  );
  return {
    feeCents,
    vereineCents,
    totalCents: amountCents + feeCents,
  };
}

export interface RoebelCardCheckoutMetadata {
  kind: "roebel_card";
  wallet_address: string;
  amount_cents: string;
  fee_cents: string;
  vereine_cents: string;
  beneficiary_account_id: string;
  purchase_id: string;
}

/**
 * Validates that a Stripe session's metadata is a well-formed
 * Röbel Card checkout. Throws on missing/invalid fields so the webhook
 * handler can fail loudly with a specific error.
 */
export function parseRoebelCardMetadata(
  metadata: Stripe.Metadata | null,
): RoebelCardCheckoutMetadata {
  if (!metadata) {
    throw new Error("missing metadata on Stripe session");
  }
  if (metadata.kind !== "roebel_card") {
    throw new Error(`unexpected metadata.kind: ${metadata.kind}`);
  }
  const required = [
    "wallet_address",
    "amount_cents",
    "fee_cents",
    "vereine_cents",
    "purchase_id",
  ] as const;
  for (const key of required) {
    if (!metadata[key]) {
      throw new Error(`missing metadata.${key}`);
    }
  }
  return {
    kind: "roebel_card",
    wallet_address: metadata.wallet_address,
    amount_cents: metadata.amount_cents,
    fee_cents: metadata.fee_cents,
    vereine_cents: metadata.vereine_cents,
    beneficiary_account_id: metadata.beneficiary_account_id ?? "",
    purchase_id: metadata.purchase_id,
  };
}
