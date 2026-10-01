// Import-free: decides whether the funder hot wallet can cover a payout.
// Tested from apps/web/tests/vorhaben-funder-float.test.ts.
export const XDAI_GAS_RESERVE_ATTO = 5n * 10n ** 17n; // 0.5 xDAI stays for gas

export function floatDecision(
  rail: "funder_muenzen" | "funder_xdai", amountAtto: bigint, muenzenBal: bigint, xdaiBal: bigint,
): "ok" | "float_low" {
  if (rail === "funder_muenzen") return muenzenBal >= amountAtto && xdaiBal >= XDAI_GAS_RESERVE_ATTO ? "ok" : "float_low";
  return xdaiBal >= amountAtto + XDAI_GAS_RESERVE_ATTO ? "ok" : "float_low";
}

// A funder rail may only pay out its own asset.
export function assetMatchesRail(rail: "funder_muenzen" | "funder_xdai", asset: string): boolean {
  return rail === "funder_muenzen" ? asset === "MUENZEN" : asset === "XDAI";
}
