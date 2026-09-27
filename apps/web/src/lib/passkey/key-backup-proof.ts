/**
 * Proof text for the passkey key backup (PREVIEW-ONLY, /api/passkey/key-backup/*).
 *
 * The backup holds PRF-wrapped ciphertext of secrets that used to be derived from a signature
 * (MACI voting key, Nostr key, citizen-commitment salt). The ciphertext alone is useless: the key
 * is HKDF(passkey PRF output), which only the passkey's authenticator can produce. The proof below
 * only decides WHO may read or write the rows for an identity.
 *
 * The client signs this EIP-191 text with the identity (thirdweb `Account.signMessage`): a passkey
 * Safe identity signs ERC-1271 (6492 while counterfactual), a legacy identity returns the
 * Safe-admin envelope; the server checks it with verifyAccountSignature (rules a/b/c,
 * lib/auth/account-signature-core.ts) on Gnosis.
 *
 * Shared BYTE-EXACT with apps/expo/lib/passkey/key-backup.ts (pinned by key-backup-vector.json in
 * both apps). Change both or neither.
 */
import { createHash } from "node:crypto";
import type { Address } from "viem";

export const KEY_BACKUP_PROOF_MAX_SKEW_SEC = 600;
export const KEY_BACKUP_SLOTS = ["maci", "nostr", "salt"] as const;
export type KeyBackupSlot = (typeof KEY_BACKUP_SLOTS)[number];
export type KeyBackupAction = "read" | "write";

/** `pkv1:` + base64url(iv ++ AES-GCM ciphertext ++ tag) — apps/expo/lib/passkey/prf-vault.ts. */
export const KEY_BACKUP_BLOB_RE = /^pkv1:[A-Za-z0-9_-]{38,4000}$/;

export const isKeyBackupSlot = (v: unknown): v is KeyBackupSlot =>
  typeof v === "string" && (KEY_BACKUP_SLOTS as readonly string[]).includes(v);

/** Canonical content of a write: `slot=blob` lines in slot order, then `replace=0|1`. */
export function keyBackupContent(blobs: Partial<Record<KeyBackupSlot, string>>, replace: boolean): string {
  const lines = KEY_BACKUP_SLOTS.filter((s) => blobs[s] !== undefined).map((s) => `${s}=${blobs[s]}`);
  lines.push(`replace=${replace ? 1 : 0}`);
  return lines.join("\n");
}

export function keyBackupContentHash(blobs: Partial<Record<KeyBackupSlot, string>>, replace: boolean): string {
  return createHash("sha256").update(keyBackupContent(blobs, replace), "utf8").digest("hex");
}

export function buildKeyBackupProofMessage(
  p:
    | { action: "read"; identity: Address; timestamp: number }
    | { action: "write"; identity: Address; timestamp: number; contentHash: string },
): string {
  const lines = [
    "Röbel: Schlüssel-Sicherung",
    p.action === "read" ? "Aktion: lesen" : "Aktion: speichern",
    `Konto: ${p.identity.toLowerCase()}`,
  ];
  if (p.action === "write") lines.push(`Inhalt: ${p.contentHash}`);
  lines.push(`Zeit: ${p.timestamp}`);
  lines.push("Nur verschlüsselte Daten. Entsperren kann nur dein Passkey.");
  return lines.join("\n");
}

export function isKeyBackupProofFresh(timestamp: unknown, nowSec: number): boolean {
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) return false;
  return Math.abs(nowSec - timestamp) <= KEY_BACKUP_PROOF_MAX_SKEW_SEC;
}
