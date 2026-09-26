import { hexToBytes, sha256, stringToBytes } from 'viem';
import { parseAttestationObject, publicKeyFromAttestationObject } from '../cose';
import { base64UrlEncode } from '../encoding';
import vector from './passkey-safe-vector.json';

// ---- minimal CBOR encoder (test-only) -----------------------------------
type CborValue = number | string | Uint8Array | Map<CborValue, CborValue>;

function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n];
  if (n < 0x100) return [(major << 5) | 24, n];
  if (n < 0x10000) return [(major << 5) | 25, n >> 8, n & 0xff];
  return [(major << 5) | 26, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function cbor(v: CborValue): number[] {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') {
    const b = Array.from(stringToBytes(v));
    return [...head(3, b.length), ...b];
  }
  if (v instanceof Uint8Array) return [...head(2, v.length), ...Array.from(v)];
  const out = head(5, v.size);
  for (const [k, val] of v) out.push(...cbor(k), ...cbor(val));
  return out;
}

function buildAttestationObject(x: Uint8Array, y: Uint8Array, credentialId: Uint8Array): Uint8Array {
  const coseKey = new Map<CborValue, CborValue>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, x],
    [-3, y],
  ]);
  const authData = Uint8Array.from([
    ...Array.from(hexToBytes(sha256(stringToBytes('roebel.app')))),
    0x45, // UP | UV | AT
    0, 0, 0, 0, // signCount
    ...new Array(16).fill(0), // aaguid
    credentialId.length >> 8,
    credentialId.length & 0xff,
    ...Array.from(credentialId),
    ...cbor(coseKey),
  ]);
  return Uint8Array.from(
    cbor(
      new Map<CborValue, CborValue>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    ),
  );
}

describe('cose / attestationObject parsing', () => {
  const x = hexToBytes(vector.x as `0x${string}`);
  const y = hexToBytes(vector.y as `0x${string}`);
  const credentialId = Uint8Array.from({ length: 20 }, (_, i) => i + 1);

  it('extracts the P-256 x/y and credentialId from an attestationObject', () => {
    const att = buildAttestationObject(x, y, credentialId);
    const parsed = parseAttestationObject(att);
    expect(parsed.x).toBe(vector.x);
    expect(parsed.y).toBe(vector.y);
    expect(parsed.credentialId).toEqual(credentialId);
    expect(parsed.flags & 0x04).toBe(0x04);
  });

  it('accepts the base64url form react-native-passkey returns', () => {
    const att = buildAttestationObject(x, y, credentialId);
    expect(publicKeyFromAttestationObject(base64UrlEncode(att))).toEqual({ x: vector.x, y: vector.y });
  });

  it('rejects an attestationObject without attested credential data', () => {
    const att = buildAttestationObject(x, y, credentialId);
    const parsed = parseAttestationObject(att); // sanity
    expect(parsed.x).toBeTruthy();
    const noAt = Uint8Array.from(
      cbor(
        new Map<CborValue, CborValue>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', new Uint8Array(37)],
        ]),
      ),
    );
    expect(() => parseAttestationObject(noAt)).toThrow(/attested credential data/);
  });

  it('rejects a non-P-256 key', () => {
    const bad = new Map<CborValue, CborValue>([
      [1, 1], // kty OKP (Ed25519)
      [3, -8],
      [-1, 6],
      [-2, x],
    ]);
    const authData = Uint8Array.from([
      ...new Array(32).fill(0),
      0x45,
      0, 0, 0, 0,
      ...new Array(16).fill(0),
      0,
      1,
      9,
      ...cbor(bad),
    ]);
    const att = Uint8Array.from(cbor(new Map<CborValue, CborValue>([['authData', authData]])));
    expect(() => parseAttestationObject(att)).toThrow(/P-256/);
  });
});
