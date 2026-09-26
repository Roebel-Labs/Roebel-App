/**
 * PRF vault: wraps signature-derived secrets (MACI voting key, Nostr key) under a key derived
 * from the passkey's PRF output.
 *
 *   key  = HKDF-SHA256(ikm = prf (32 bytes), salt = utf8(label), info = PRF_VAULT_HKDF_INFO, 32)
 *   blob = "pkv1:" + base64url(iv(12) ++ AES-256-GCM(key, iv, secret, aad = utf8(label)) ++ tag(16))
 *
 * Pure JS (@noble/ciphers + @noble/hashes, audited) so the same code runs in Hermes and jest and
 * interoperates with standard WebCrypto (see the prf-vault test). A missing PRF is an error:
 * callers must skip re-wrapping instead of deriving a key from nothing.
 */
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { hexToBytes, type Hex } from 'viem';
import { base64UrlDecode, base64UrlEncode, concatBytes, utf8Encode } from './encoding';
import { randomBytes } from './random';

export const PRF_VAULT_VERSION = 'pkv1';
export const PRF_VAULT_HKDF_INFO = 'id.ortis.app/passkey-vault/v1';
const IV_LENGTH = 12;

function deriveKey(prf: Hex, label: string): Uint8Array {
  if (typeof prf !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(prf)) {
    throw new Error('PRF output missing or not 32 bytes');
  }
  if (!label) throw new Error('vault label required');
  return hkdf(sha256, hexToBytes(prf), utf8Encode(label), utf8Encode(PRF_VAULT_HKDF_INFO), 32);
}

export async function wrapSecret(prf: Hex, label: string, secret: Uint8Array): Promise<string> {
  const key = deriveKey(prf, label);
  const iv = randomBytes(IV_LENGTH);
  const ct = gcm(key, iv, utf8Encode(label)).encrypt(secret);
  key.fill(0);
  return `${PRF_VAULT_VERSION}:${base64UrlEncode(concatBytes(iv, ct))}`;
}

export async function unwrapSecret(prf: Hex, label: string, blob: string): Promise<Uint8Array> {
  const sep = blob.indexOf(':');
  if (sep < 0 || blob.slice(0, sep) !== PRF_VAULT_VERSION) throw new Error('unsupported vault blob version');
  const raw = base64UrlDecode(blob.slice(sep + 1));
  if (raw.length < IV_LENGTH + 16) throw new Error('vault blob too short');
  const key = deriveKey(prf, label);
  try {
    return gcm(key, raw.slice(0, IV_LENGTH), utf8Encode(label)).decrypt(raw.slice(IV_LENGTH));
  } finally {
    key.fill(0);
  }
}
