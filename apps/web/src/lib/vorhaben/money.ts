// 18-decimal fixed-point helpers for Münzen, xDAI and EURe (all 18 decimals on Gnosis).
// EURC on Base (6 decimals) gets its own helper when that rail is built.
// Keep in sync with apps/expo/supabase/functions/_shared/payout-amount.ts (test-enforced).
const UNIT = 10n ** 18n;

export function toAtto(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * UNIT + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

export function fromAtto(atto: bigint): string {
  const whole = atto / UNIT;
  const frac = (atto % UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function feeAtto(amountAtto: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error(`bps out of range: ${bps}`);
  return (amountAtto * BigInt(bps)) / 10000n;
}
