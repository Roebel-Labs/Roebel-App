// Currency formatting helpers for the Röbel Card voucher system.
// Cents-based amounts (bigint/number) are converted to the de-DE display
// format. Pure — no IO.

/**
 * Format cents as a de-DE decimal string, two decimals, NO currency symbol.
 * 2500 -> "25,00"
 * 0 -> "0,00"
 * 12345 -> "123,45"
 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format cents as a full de-DE Euro string, with the "€" suffix.
 * 2500 -> "25,00 €"
 */
export function formatEuros(cents: number): string {
  return `${formatCents(cents)} €`;
}
