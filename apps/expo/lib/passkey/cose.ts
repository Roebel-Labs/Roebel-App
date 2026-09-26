/**
 * Minimal CBOR + COSE reader for WebAuthn registration results.
 *
 * Only what a passkey attestationObject needs: definite-length unsigned/negative
 * ints, byte/text strings, arrays, maps and simple values. The COSE key must be
 * EC2 / P-256 (ES256) — the only curve the Safe WebAuthn signer verifies.
 */
import { bytesToHex, sha256, stringToBytes, type Hex } from 'viem';
import { PASSKEY_RP_ID } from './constants';
import { base64UrlDecode, utf8Decode } from './encoding';

type CborValue = number | bigint | string | Uint8Array | CborValue[] | Map<CborValue, CborValue> | boolean | null | undefined;

class CborReader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}

  get offset(): number {
    return this.i;
  }

  private byte(): number {
    if (this.i >= this.b.length) throw new Error('CBOR: unexpected end of input');
    return this.b[this.i++];
  }

  private arg(info: number): number {
    if (info < 24) return info;
    if (info === 24) return this.byte();
    if (info === 25) return (this.byte() << 8) | this.byte();
    if (info === 26) return ((this.byte() << 24) >>> 0) + (this.byte() << 16) + (this.byte() << 8) + this.byte();
    throw new Error('CBOR: unsupported length encoding');
  }

  private take(n: number): Uint8Array {
    if (this.i + n > this.b.length) throw new Error('CBOR: unexpected end of input');
    const out = this.b.slice(this.i, this.i + n);
    this.i += n;
    return out;
  }

  read(): CborValue {
    const initial = this.byte();
    const major = initial >> 5;
    const info = initial & 0x1f;
    switch (major) {
      case 0:
        return this.arg(info);
      case 1:
        return -1 - this.arg(info);
      case 2:
        return this.take(this.arg(info));
      case 3:
        return utf8Decode(this.take(this.arg(info)));
      case 4: {
        const n = this.arg(info);
        const arr: CborValue[] = [];
        for (let k = 0; k < n; k++) arr.push(this.read());
        return arr;
      }
      case 5: {
        const n = this.arg(info);
        const m = new Map<CborValue, CborValue>();
        for (let k = 0; k < n; k++) {
          const key = this.read();
          m.set(key, this.read());
        }
        return m;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        if (info === 23) return undefined;
        throw new Error('CBOR: unsupported simple/float value');
      default:
        throw new Error(`CBOR: unsupported major type ${major}`);
    }
  }
}

export function decodeCbor(bytes: Uint8Array): { value: CborValue; bytesRead: number } {
  const r = new CborReader(bytes);
  const value = r.read();
  return { value, bytesRead: r.offset };
}

export type ParsedAttestation = {
  rpIdHash: Hex;
  flags: number;
  signCount: number;
  credentialId: Uint8Array;
  x: Hex;
  y: Hex;
};

const FLAG_AT = 0x40;

function to32(b: Uint8Array): Hex {
  if (b.length !== 32) throw new Error('COSE: P-256 coordinate must be 32 bytes');
  return bytesToHex(b);
}

/** Parses the COSE_Key map and returns the P-256 public key coordinates. */
export function coseToP256(key: CborValue): { x: Hex; y: Hex } {
  if (!(key instanceof Map)) throw new Error('COSE: key is not a map');
  const kty = key.get(1);
  const alg = key.get(3);
  const crv = key.get(-1);
  const x = key.get(-2);
  const y = key.get(-3);
  if (kty !== 2 || alg !== -7 || crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
    throw new Error('COSE: passkey is not an EC2 P-256 (ES256) key');
  }
  return { x: to32(x), y: to32(y) };
}

/** Parses a raw attestationObject (CBOR bytes). Rejects a credential not scoped to `rpId`. */
export function parseAttestationObject(attestationObject: Uint8Array, rpId: string = PASSKEY_RP_ID): ParsedAttestation {
  const { value } = decodeCbor(attestationObject);
  if (!(value instanceof Map)) throw new Error('attestationObject is not a CBOR map');
  const authData = value.get('authData');
  if (!(authData instanceof Uint8Array)) throw new Error('attestationObject has no authData');
  if (authData.length < 37) throw new Error('authData too short');
  const rpIdHash = bytesToHex(authData.slice(0, 32));
  if (rpIdHash !== sha256(stringToBytes(rpId))) {
    throw new Error(`authData rpIdHash is not sha256("${rpId}"): credential belongs to another rpId`);
  }

  const flags = authData[32];
  const signCount = ((authData[33] << 24) >>> 0) + (authData[34] << 16) + (authData[35] << 8) + authData[36];
  if (!(flags & FLAG_AT) || authData.length < 37 + 18) {
    throw new Error('authData carries no attested credential data');
  }
  let o = 37 + 16; // skip aaguid
  const credLen = (authData[o] << 8) | authData[o + 1];
  o += 2;
  const credentialId = authData.slice(o, o + credLen);
  o += credLen;
  const { value: coseKey } = decodeCbor(authData.slice(o));
  const { x, y } = coseToP256(coseKey);

  return {
    rpIdHash,
    flags,
    signCount,
    credentialId,
    x,
    y,
  };
}

/** Convenience for react-native-passkey's base64url `response.attestationObject`. */
export function publicKeyFromAttestationObject(attestationObjectB64Url: string): { x: Hex; y: Hex } {
  const { x, y } = parseAttestationObject(base64UrlDecode(attestationObjectB64Url));
  return { x, y };
}
