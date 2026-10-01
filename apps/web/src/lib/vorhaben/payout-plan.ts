import type { Asset, LineRole, Rail } from "./constants";
import { feeAtto, fromAtto, toAtto } from "./money";

export interface LineDraft {
  role: LineRole;
  recipient_wallet: string | null;
  recipient_label: string;
  amount: string;
  asset: Asset;
  rail: Rail;
  reference_type: "proposal" | "task" | "wahlhelfer";
  reference_id: string;
}
export interface FeeConfig { bps: number; platformSafe: string; budgetFeeRail: Rail }

export function railForAsset(asset: Asset): Rail {
  switch (asset) {
    case "MUENZEN": return "funder_muenzen";
    case "XDAI": return "funder_xdai";
    case "EURe": return "safe_eure";
    case "EURC": return "safe_eurc_base";
  }
}

const assetForRail = (rail: Rail, fallback: Asset): Asset =>
  rail === "funder_xdai" ? "XDAI" : rail === "funder_muenzen" ? "MUENZEN" : fallback;

/** The platform fee always sits on top of `main` and shares its reference. */
function feeLine(main: LineDraft, fee: FeeConfig, rail: Rail): LineDraft[] {
  const amount = feeAtto(toAtto(main.amount), fee.bps);
  if (amount === 0n) return [];
  return [{
    role: "plattform",
    recipient_wallet: fee.platformSafe.toLowerCase(),
    recipient_label: "Plattform",
    amount: fromAtto(amount),
    asset: assetForRail(rail, main.asset),
    rail,
    reference_type: main.reference_type,
    reference_id: main.reference_id,
  }];
}

export function planWahlhelferLines(
  i: { wahlhelferId: string; wallet: string; label: string; amount: string; asset: Asset }, fee: FeeConfig,
): LineDraft[] {
  const main: LineDraft = {
    role: "wahlhelfer", recipient_wallet: i.wallet.toLowerCase(), recipient_label: i.label,
    amount: fromAtto(toAtto(i.amount)), asset: i.asset, rail: railForAsset(i.asset),
    reference_type: "wahlhelfer", reference_id: i.wahlhelferId,
  };
  return [main, ...feeLine(main, fee, main.rail)];
}

export function planTaskLines(
  i: { taskId: string; wallet: string; label: string; amount: string; asset: Asset }, fee: FeeConfig,
): LineDraft[] {
  const main: LineDraft = {
    role: "aufgabe", recipient_wallet: i.wallet.toLowerCase(), recipient_label: i.label,
    amount: fromAtto(toAtto(i.amount)), asset: i.asset, rail: railForAsset(i.asset),
    reference_type: "task", reference_id: i.taskId,
  };
  return [main, ...feeLine(main, fee, main.rail)];
}

export function planBudgetLines(
  i: { proposalId: string; beneficiary: string; amount: string; asset: Asset }, fee: FeeConfig,
): LineDraft[] {
  const main: LineDraft = {
    role: "empfaenger", recipient_wallet: null, recipient_label: i.beneficiary,
    amount: fromAtto(toAtto(i.amount)), asset: i.asset, rail: "manual_safe",
    reference_type: "proposal", reference_id: i.proposalId,
  };
  return [main, ...feeLine(main, fee, fee.budgetFeeRail)];
}
