/**
 * X-style compact count, German decimal comma: 999 → "999", 1234 → "1,2K",
 * 12345 → "12K", 1_200_000 → "1,2M". One decimal only below 10 of a unit.
 */
export function formatCompactCount(n: number): string {
  const compact = (value: number, unit: string): string => {
    const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    if (rounded >= 10 || Number.isInteger(rounded)) {
      return `${Math.round(rounded)}${unit}`;
    }
    return `${String(rounded).replace('.', ',')}${unit}`;
  };
  if (n < 1000) return String(n);
  if (n < 1_000_000) return compact(n / 1000, 'K');
  return compact(n / 1_000_000, 'M');
}
