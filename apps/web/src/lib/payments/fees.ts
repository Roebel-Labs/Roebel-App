// Platform fee shared by all payment rails. PLATFORM_FEE_* are the provider-neutral names; the old
// STRIPE_PLATFORM_FEE_* names stay as fallbacks so existing Vercel env keeps working.

function readInt(primary: string, fallback: string, dflt: string): number {
  const n = Number(process.env[primary] ?? process.env[fallback] ?? dflt);
  return Number.isFinite(n) ? n : 0;
}

/** Platform fee for one paid order: bps of amount + fixed part, capped so the org always nets ≥ 1 ct. */
export function platformFeeCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  const bps = readInt("PLATFORM_FEE_BPS", "STRIPE_PLATFORM_FEE_BPS", "200");
  const fixed = readInt("PLATFORM_FEE_FIXED_CENTS", "STRIPE_PLATFORM_FEE_FIXED_CENTS", "10");
  const raw = Math.round((amountCents * bps) / 10000) + fixed;
  return Math.max(0, Math.min(raw, amountCents - 1));
}

/**
 * Mollie caps the application fee on a Payments API payment at amount − (€0.35 + 6 % of amount).
 * We clamp to that cap (floor 0) instead of failing the checkout: a tiny ticket simply carries a
 * smaller platform fee.
 */
export function clampMollieApplicationFee(feeCents: number, amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  const cap = Math.floor(amountCents - (35 + amountCents * 0.06));
  return Math.max(0, Math.min(feeCents, cap));
}
