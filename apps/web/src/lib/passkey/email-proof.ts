/**
 * Proof that a request to add/remove the optional warning email comes from the passkey Safe itself.
 *
 * The client signs the fixed EIP-191 text below through the Safe's ERC-1271 path (WebAuthn
 * assertion over the Safe's SafeMessage hash of `hashMessage(text)`; see
 * contracts/passkey-accounts/test/GuardianErc1271.t.sol). The server rebuilds the text from the
 * request and checks `isValidSignature` on Gnosis (viem `verifyMessage`).
 *
 * The text is shared BYTE-EXACT with apps/expo/lib/passkey/email.ts (pinned by
 * __tests__/email-proof-vector.json in both apps). Change both or neither.
 *
 * The email is NEVER a login or a key: it only receives recovery warnings (and notifications the
 * person opts into). It is stored apart from `users.email`, so it never reaches the newsletter.
 */
import type { Address } from "viem";

export const PROOF_MAX_SKEW_SEC = 600;
export const EMAIL_MAX_LENGTH = 254;

export type EmailProofAction = "add" | "remove";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** trim + lowercase, or null when it is not a plausible address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

export function buildEmailProofMessage(
  p: { action: "add"; safe: Address; email: string; timestamp: number } | { action: "remove"; safe: Address; timestamp: number },
): string {
  const lines = [
    "Röbel: E-Mail für Warnungen",
    p.action === "add" ? "Aktion: hinzufügen" : "Aktion: entfernen",
    `Konto: ${p.safe.toLowerCase()}`,
  ];
  if (p.action === "add") lines.push(`E-Mail: ${p.email}`);
  lines.push(`Zeit: ${p.timestamp}`);
  lines.push("Keine Anmeldung. Nur für Warnungen.");
  return lines.join("\n");
}

/** Unix seconds, integer, within ±PROOF_MAX_SKEW_SEC of `nowSec`. */
export function isProofFresh(timestamp: unknown, nowSec: number): boolean {
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) return false;
  return Math.abs(nowSec - timestamp) <= PROOF_MAX_SKEW_SEC;
}
