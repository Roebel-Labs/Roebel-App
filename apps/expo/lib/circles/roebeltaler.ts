/** Pure, unit-tested core. No SDK/network here. */

/**
 * Returns true when `amount` is a positive number that does not exceed
 * the caller's available personal CRC balance (`availablePersonalCrc`).
 */
export function canMint(amount: number, availablePersonalCrc: number): boolean {
	return amount > 0 && amount <= availablePersonalCrc;
}

/**
 * Formats a Röbeltaler amount to 2 decimal places with the currency suffix.
 * Example: formatRoebeltaler(12.3456) → "12.35 Röbeltaler"
 */
export function formatRoebeltaler(amount: number): string {
	return `${amount.toFixed(2)} Röbeltaler`;
}
