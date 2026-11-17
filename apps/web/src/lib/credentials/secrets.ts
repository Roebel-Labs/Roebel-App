// AES-256-GCM sealing for claim keys and link tokens (credential_invitations.claim_key_enc /
// token_enc). Same construction as the connector / provider-key secrets
// (lib/chat/harness/connectors/crypto.ts), own key and an explicit, dotted format:
//   "v1.<iv>.<ciphertext>.<tag>", each part base64url.
// Key: env CREDENTIAL_SECRETS_KEY = base64 of exactly 32 bytes. Missing or malformed → throws.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD = Buffer.from("roebel-credential-secret-v1", "utf8");

export class CredentialSecretError extends Error {}

function secretsKey(raw: string | undefined = process.env.CREDENTIAL_SECRETS_KEY): Buffer {
  if (!raw) throw new CredentialSecretError("CREDENTIAL_SECRETS_KEY is not set");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new CredentialSecretError("CREDENTIAL_SECRETS_KEY must be 32 bytes (base64)");
  return key;
}

export function sealSecret(plain: string): string {
  const key = secretsKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function openSecret(sealed: string): string {
  const key = secretsKey();
  const parts = typeof sealed === "string" ? sealed.split(".") : [];
  if (parts.length !== 4 || parts[0] !== VERSION) throw new CredentialSecretError("unknown sealed secret format");
  const iv = Buffer.from(parts[1], "base64url");
  const body = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new CredentialSecretError("sealed secret is damaged");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new CredentialSecretError("sealed secret could not be opened");
  }
}
