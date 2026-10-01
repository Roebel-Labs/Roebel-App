// Import-free copy of apps/web/src/lib/vorhaben/money.ts (toAtto/fromAtto).
// A web test asserts both produce identical results.
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
