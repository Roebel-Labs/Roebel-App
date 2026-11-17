/**
 * The shown-credential code and the signed statement behind it. Dependency-free (QRScanner, the
 * show screen and the verifier all import it). Mirrors apps/web/src/lib/credentials/presentations.ts
 * (SHOW_SCOPE, showMessage, SHOW_TTL_SECONDS) and apps/web/src/lib/chat/pairing.ts (CODE_ALPHABET);
 * a test pins both.
 */
export const SHOW_SCOPE = 'roebel-credential-show-v1';
export const SHOW_TTL_SECONDS = 300;
export const QR_PREFIX = 'roebel-ausweis:';
/** Same alphabet and length as the server's presentation codes (no 0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PRESENTATION_CODE_LENGTH = 12;

export function showMessage(p: { typeId: string; account: string; issuedAtSec: number; nonce: string }): string {
  return `${SHOW_SCOPE}:${p.typeId}:${p.account.toLowerCase()}:${p.issuedAtSec}:${p.nonce}`;
}

export const qrPayload = (code: string): string => `${QR_PREFIX}${code}`;

/** The code inside a scanned `roebel-ausweis:<code>`, normalised; null for anything else. */
export function parseAusweisPayload(data: string): string | null {
  if (typeof data !== 'string' || !data.startsWith(QR_PREFIX)) return null;
  const code = data.slice(QR_PREFIX.length).trim().toUpperCase();
  if (code.length !== PRESENTATION_CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}
