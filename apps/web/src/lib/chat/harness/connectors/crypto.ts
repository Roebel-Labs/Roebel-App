// AES-256-GCM for connector secrets (agent_connectors.secret_enc).
// Key: env CHAT_CONNECTOR_KEY = base64 of exactly 32 bytes.
// Format: "v1:" + base64(iv[12] | tag[16] | ciphertext). The row id is bound as
// additional authenticated data when given, so a secret copied onto another
// row does not decrypt.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class ConnectorCryptoError extends Error {}

/** Parses CHAT_CONNECTOR_KEY (or the given base64) into a 32-byte key. */
export function connectorKey(raw: string | undefined = process.env.CHAT_CONNECTOR_KEY): Buffer {
  if (!raw) throw new ConnectorCryptoError("CHAT_CONNECTOR_KEY ist nicht gesetzt.");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new ConnectorCryptoError("CHAT_CONNECTOR_KEY muss 32 Bytes (base64) lang sein.");
  return key;
}

export function encryptSecret(value: unknown, opts: { key?: Buffer; aad?: string } = {}): string {
  const key = opts.key ?? connectorKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value ?? null), "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret<T = unknown>(blob: string, opts: { key?: Buffer; aad?: string } = {}): T {
  if (typeof blob !== "string" || !blob.startsWith(PREFIX)) throw new ConnectorCryptoError("Unbekanntes Geheimnis-Format.");
  const raw = Buffer.from(blob.slice(PREFIX.length), "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new ConnectorCryptoError("Geheimnis ist beschädigt.");
  const key = opts.key ?? connectorKey();
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  if (opts.aad) decipher.setAAD(Buffer.from(opts.aad, "utf8"));
  try {
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as T;
  } catch {
    throw new ConnectorCryptoError("Geheimnis konnte nicht entschlüsselt werden.");
  }
}
