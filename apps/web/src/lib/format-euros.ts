// Cents → de-DE Euro display helper for the Röbel Card voucher system.

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatEuros(cents: number): string {
  return `${formatCents(cents)} €`;
}
