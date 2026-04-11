// IBAN helpers — validation, display formatting, masking.
//
// Pure: no network calls, no dependencies. Unit-testable in isolation.

const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/**
 * Validate an IBAN via format + ISO 13616 mod-97 checksum.
 * Accepts spaced or compact input; returns true only for valid structures.
 */
export function isValidIban(raw: string): boolean {
  const normalized = raw.replace(/\s+/g, '').toUpperCase();
  if (!IBAN_REGEX.test(normalized)) return false;

  // Move the first 4 characters (country code + check digits) to the end.
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);

  // Replace letters with their A=10, B=11, ..., Z=35 numeric values.
  const numericString = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );

  // Mod-97 via chunked big-number math (strings may exceed 2^53).
  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    const chunk = String(remainder) + numericString.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }
  return remainder === 1;
}

/**
 * Canonicalise: strip whitespace, uppercase.
 * "de89 3704 0044 0532 0130 00" -> "DE89370400440532013000"
 */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Display formatting: groups of 4.
 * "DE89370400440532013000" -> "DE89 3704 0044 0532 0130 00"
 */
export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Masked display — only the last 4 digits visible.
 * "DE89370400440532013000" -> "DE** **** **** **** **** 3000"
 */
export function maskIban(raw: string): string {
  const normalized = normalizeIban(raw);
  if (normalized.length < 8) return normalized;
  const last4 = normalized.slice(-4);
  const masked = '*'.repeat(normalized.length - 6);
  return `${normalized.slice(0, 2)}${masked}${last4}`.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Last 4 digits only (for DB storage in iban_last4).
 */
export function ibanLast4(raw: string): string {
  return normalizeIban(raw).slice(-4);
}
