// Pure cap evaluation. Every generation costs money (~$0.15 per pair), so the
// kill switch and the daily budget apply to everyone; per-draft and per-account
// limits apply to non-admin callers.
import { MAX_BATCHES_PER_ACCOUNT_PER_DAY, MAX_BATCHES_PER_DRAFT } from "./constants";
import type { PosterRequester } from "./types";

export interface CapInput {
  requestedBy: PosterRequester;
  enabled: boolean;
  budgetLimitUsd: number;
  budgetSpentTodayUsd: number;
  batchesForDraft: number;
  batchesForAccountToday: number;
}

export type CapResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "budget" | "draft_limit" | "account_limit"; message: string };

export function evaluateCaps(i: CapInput): CapResult {
  if (!i.enabled) {
    return { ok: false, reason: "disabled", message: "Plakat-Vorschläge sind derzeit deaktiviert." };
  }
  if (i.budgetSpentTodayUsd >= i.budgetLimitUsd) {
    return { ok: false, reason: "budget", message: "Das Tagesbudget für Plakat-Vorschläge ist aufgebraucht." };
  }
  if (i.requestedBy === "admin") return { ok: true };
  if (i.batchesForDraft >= MAX_BATCHES_PER_DRAFT) {
    return { ok: false, reason: "draft_limit", message: "Für diese Einreichung wurden schon zwei Vorschlagsrunden erzeugt." };
  }
  if (i.batchesForAccountToday >= MAX_BATCHES_PER_ACCOUNT_PER_DAY) {
    return { ok: false, reason: "account_limit", message: "Tageslimit für Plakat-Vorschläge erreicht. Bitte morgen weitermachen." };
  }
  return { ok: true };
}
