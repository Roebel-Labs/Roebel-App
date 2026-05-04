// IBAN helpers — validation, display formatting, masking.
//
// Pure: no network calls, no dependencies. Unit-testable in isolation.
// Mirrors apps/expo/lib/iban.ts so both apps share identical behaviour.

const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

export function isValidIban(raw: string): boolean {
  const normalized = raw.replace(/\s+/g, "").toUpperCase();
  if (!IBAN_REGEX.test(normalized)) return false;

  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numericString = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );

  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    const chunk = String(remainder) + numericString.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }
  return remainder === 1;
}

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, "$1 ").trim();
}

export function maskIban(raw: string): string {
  const normalized = normalizeIban(raw);
  if (normalized.length < 8) return normalized;
  const last4 = normalized.slice(-4);
  const masked = "*".repeat(normalized.length - 6);
  return `${normalized.slice(0, 2)}${masked}${last4}`
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export function ibanLast4(raw: string): string {
  return normalizeIban(raw).slice(-4);
}
