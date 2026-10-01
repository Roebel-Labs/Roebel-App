/**
 * Budget input for new proposals. Local copy of the Expo euro parsing rule
 * (the web cannot import from apps/expo). Used by the form AND the store route.
 */
export type BudgetInput =
  | { ok: true; amount: string | null; beneficiary: string | null }
  | { ok: false; error: string };

const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;
export const BENEFICIARY_MAX = 140;

export function parseBudgetInput(amount?: string | null, beneficiary?: string | null): BudgetInput {
  const rawAmount = (amount ?? "").trim().replace(",", ".");
  const ben = (beneficiary ?? "").trim();
  if (ben.length > BENEFICIARY_MAX) {
    return { ok: false, error: `Empfänger darf höchstens ${BENEFICIARY_MAX} Zeichen haben.` };
  }
  if (rawAmount !== "" && !AMOUNT_RE.test(rawAmount)) {
    return { ok: false, error: "Betrag ungültig (max. 9.999.999,99 €, höchstens 2 Nachkommastellen)." };
  }
  if (rawAmount !== "" && Number(rawAmount) <= 0) {
    return { ok: false, error: "Betrag muss größer als 0 sein." };
  }
  return { ok: true, amount: rawAmount || null, beneficiary: ben || null };
}
