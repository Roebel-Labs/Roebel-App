import { chacha20 } from "@noble/ciphers/chacha";
import { equalBytes } from "@noble/ciphers/utils";
import { secp256k1 } from "@noble/curves/secp256k1";
import { expand, extract } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { concatBytes, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";
import { base64 } from "@scure/base";

// NIP-44 v2: secp256k1 ECDH -> HKDF-SHA256 -> ChaCha20 + HMAC-SHA256, padded plaintext.
const SALT = utf8ToBytes("nip44-v2");

export function getConversationKey(secretKey: Uint8Array, pubkeyHex: string): Uint8Array {
  const sharedX = secp256k1.getSharedSecret(secretKey, hexToBytes("02" + pubkeyHex)).subarray(1, 33);
  return extract(sha256, sharedX, SALT);
}

function messageKeys(conversationKey: Uint8Array, nonce: Uint8Array) {
  const keys = expand(sha256, conversationKey, nonce, 76);
  return { chachaKey: keys.subarray(0, 32), chachaNonce: keys.subarray(32, 44), hmacKey: keys.subarray(44, 76) };
}

export function calcPaddedLen(len: number): number {
  if (len <= 32) return 32;
  const nextPower = 1 << (Math.floor(Math.log2(len - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((len - 1) / chunk) + 1);
}

function pad(plaintext: string): Uint8Array {
  const bytes = utf8ToBytes(plaintext);
  if (bytes.length < 1 || bytes.length > 65535) throw new Error("nip44: plaintext length out of range");
  const out = new Uint8Array(2 + calcPaddedLen(bytes.length));
  new DataView(out.buffer).setUint16(0, bytes.length);
  out.set(bytes, 2);
  return out;
}

function unpad(padded: Uint8Array): string {
  const len = new DataView(padded.buffer, padded.byteOffset).getUint16(0);
  if (len < 1 || padded.length !== 2 + calcPaddedLen(len)) throw new Error("nip44: invalid padding");
  return new TextDecoder().decode(padded.subarray(2, 2 + len));
}

export function nip44Encrypt(plaintext: string, conversationKey: Uint8Array, nonce: Uint8Array = randomBytes(32)): string {
  const { chachaKey, chachaNonce, hmacKey } = messageKeys(conversationKey, nonce);
  const ciphertext = chacha20(chachaKey, chachaNonce, pad(plaintext));
  const mac = hmac(sha256, hmacKey, concatBytes(nonce, ciphertext));
  return base64.encode(concatBytes(new Uint8Array([2]), nonce, ciphertext, mac));
}

export function nip44Decrypt(payload: string, conversationKey: Uint8Array): string {
  const data = base64.decode(payload);
  if (data.length < 99 || data[0] !== 2) throw new Error("nip44: unknown version or too short");
  const nonce = data.subarray(1, 33);
  const ciphertext = data.subarray(33, data.length - 32);
  const mac = data.subarray(data.length - 32);
  const { chachaKey, chachaNonce, hmacKey } = messageKeys(conversationKey, nonce);
  if (!equalBytes(hmac(sha256, hmacKey, concatBytes(nonce, ciphertext)), mac)) throw new Error("nip44: invalid MAC");
  return unpad(chacha20(chachaKey, chachaNonce, ciphertext));
}
