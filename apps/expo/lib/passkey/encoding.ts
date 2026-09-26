/**
 * Pure byte helpers shared by the passkey modules (no native imports, so they
 * run unchanged under jest).
 */
import { bytesToHex, hexToBytes, type Hex } from 'viem';
import { P256_N } from './constants';

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_LOOKUP: Record<string, number> = (() => {
  const t: Record<string, number> = {};
  for (let i = 0; i < 64; i++) t[B64URL[i]] = i;
  // Also accept standard base64 characters.
  t['+'] = 62;
  t['/'] = 63;
  return t;
})();

/** base64url WITHOUT padding (WebAuthn / Safe WebAuthn library flavour). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buf = (buf << 8) | bytes[i];
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64URL[(buf >> bits) & 0x3f];
    }
    buf &= (1 << bits) - 1;
  }
  if (bits > 0) out += B64URL[(buf << (6 - bits)) & 0x3f];
  return out;
}

/** Decodes base64url or standard base64, with or without padding. */
export function base64UrlDecode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64_LOOKUP[ch];
    if (v === undefined) throw new Error(`invalid base64 character: ${ch}`);
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
    buf &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}

export function hexToBase64Url(hex: Hex): string {
  return base64UrlEncode(hexToBytes(hex));
}

export function base64UrlToHex(b64: string): Hex {
  return bytesToHex(base64UrlDecode(b64));
}

export function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function utf8Decode(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function bytesToBigInt(b: Uint8Array): bigint {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}

/** Normalizes a P-256 `s` to the lower half of the curve order (Safe WebAuthn requires low-s). */
export function lowS(s: bigint): bigint {
  return s > P256_N / 2n ? P256_N - s : s;
}

/**
 * Parses an ASN.1 DER ECDSA signature `SEQUENCE { INTEGER r, INTEGER s }` as
 * returned by WebAuthn authenticators. `s` is normalized to low-s.
 */
export function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  let i = 0;
  const readLen = (): number => {
    const first = der[i++];
    if (first < 0x80) return first;
    const n = first & 0x7f;
    if (n === 0 || n > 2) throw new Error('DER: unsupported length');
    let len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | der[i++];
    return len;
  };
  if (der[i++] !== 0x30) throw new Error('DER: expected SEQUENCE');
  const seqLen = readLen();
  if (i + seqLen !== der.length) throw new Error('DER: bad SEQUENCE length');
  const readInt = (): bigint => {
    if (der[i++] !== 0x02) throw new Error('DER: expected INTEGER');
    const len = readLen();
    const v = bytesToBigInt(der.slice(i, i + len));
    i += len;
    return v;
  };
  const r = readInt();
  const s = readInt();
  if (i !== der.length) throw new Error('DER: trailing bytes');
  if (r <= 0n || r >= P256_N || s <= 0n || s >= P256_N) throw new Error('DER: r/s out of range');
  return { r, s: lowS(s) };
}
