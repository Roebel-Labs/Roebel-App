/**
 * P-256 (secp256r1) public-key recovery from an ECDSA signature.
 *
 * Why: a discoverable WebAuthn `get` (sign-in on a device that has no local record) returns the
 * credential id, the signature and the userHandle, but NOT the public key. The Safe address is
 * derived from the key, and the key cannot be put into the userHandle at creation (the key does
 * not exist before the authenticator creates it). So the key is recovered from the assertion:
 * ECDSA recovery yields up to two candidates (the two y parities of R; the r + n case is included
 * for completeness), and the caller picks the one whose Safe is known (on chain / users row) or
 * intersects with a second assertion.
 *
 * Pure bigint arithmetic in Jacobian coordinates (no dependency: @noble/curves is not a direct
 * dependency of the Expo app and pnpm does not hoist it). Only public data is handled here, so
 * constant-time behaviour is irrelevant.
 */
import { numberToHex, type Hex } from 'viem';

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const A = P - 3n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

type Jac = { x: bigint; y: bigint; z: bigint };
const INF: Jac = { x: 0n, y: 1n, z: 0n };

const mod = (a: bigint, m: bigint = P) => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

const inv = (a: bigint, m: bigint) => modPow(a, m - 2n, m); // m is prime

function double(p: Jac): Jac {
  if (p.z === 0n || p.y === 0n) return INF;
  const delta = mod(p.z * p.z);
  const gamma = mod(p.y * p.y);
  const beta = mod(p.x * gamma);
  const alpha = mod(3n * (p.x - delta) * (p.x + delta)); // a = -3
  const x3 = mod(alpha * alpha - 8n * beta);
  const z3 = mod((p.y + p.z) * (p.y + p.z) - gamma - delta);
  const y3 = mod(alpha * (4n * beta - x3) - 8n * gamma * gamma);
  return { x: x3, y: y3, z: z3 };
}

function add(p: Jac, q: Jac): Jac {
  if (p.z === 0n) return q;
  if (q.z === 0n) return p;
  const z1z1 = mod(p.z * p.z);
  const z2z2 = mod(q.z * q.z);
  const u1 = mod(p.x * z2z2);
  const u2 = mod(q.x * z1z1);
  const s1 = mod(p.y * q.z * z2z2);
  const s2 = mod(q.y * p.z * z1z1);
  if (u1 === u2) return s1 === s2 ? double(p) : INF;
  const h = mod(u2 - u1);
  const r = mod(s2 - s1);
  const hh = mod(h * h);
  const hhh = mod(h * hh);
  const x3 = mod(r * r - hhh - 2n * u1 * hh);
  const y3 = mod(r * (u1 * hh - x3) - s1 * hhh);
  const z3 = mod(h * p.z * q.z);
  return { x: x3, y: y3, z: z3 };
}

function toAffine(p: Jac): { x: bigint; y: bigint } | null {
  if (p.z === 0n) return null;
  const zi = inv(p.z, P);
  const zi2 = mod(zi * zi);
  return { x: mod(p.x * zi2), y: mod(p.y * zi2 * zi) };
}

/** u1·G + u2·Q (Shamir's trick). */
function mulAdd(u1: bigint, u2: bigint, q: Jac): Jac {
  const g: Jac = { x: GX, y: GY, z: 1n };
  const gq = add(g, q);
  let acc = INF;
  for (let i = 255; i >= 0; i--) {
    acc = double(acc);
    const b1 = (u1 >> BigInt(i)) & 1n;
    const b2 = (u2 >> BigInt(i)) & 1n;
    if (b1 && b2) acc = add(acc, gq);
    else if (b1) acc = add(acc, g);
    else if (b2) acc = add(acc, q);
  }
  return acc;
}

export function isOnCurve(x: bigint, y: bigint): boolean {
  if (x < 0n || x >= P || y < 0n || y >= P) return false;
  return mod(y * y) === mod(x * x * x + A * x + B);
}

export type P256Point = { x: Hex; y: Hex };

/**
 * All public keys Q for which (r, s) is a valid ECDSA signature over the 32-byte `digest`
 * (for WebAuthn: sha256(authenticatorData ++ sha256(clientDataJSON))). Usually 2 candidates.
 * Accepts high or low s (normalising s only swaps which candidate belongs to which parity).
 */
export function recoverP256PublicKeys(digest: Hex, r: bigint, s: bigint): P256Point[] {
  if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error('invalid P-256 signature scalars');
  const e = mod(BigInt(digest), N);
  const rInv = inv(r, N);
  const u1 = mod(-e * rInv, N);
  const u2 = mod(s * rInv, N);
  const out: P256Point[] = [];
  const xs = [r];
  if (r + N < P) xs.push(r + N);
  for (const rx of xs) {
    const alpha = mod(rx * rx * rx + A * rx + B);
    const beta = modPow(alpha, (P + 1n) / 4n, P); // P ≡ 3 (mod 4)
    if (mod(beta * beta) !== alpha) continue; // rx is not an x coordinate on the curve
    for (const y of [beta, P - beta]) {
      const q = toAffine(mulAdd(u1, u2, { x: rx, y, z: 1n }));
      if (!q || !isOnCurve(q.x, q.y)) continue;
      const pt = { x: numberToHex(q.x, { size: 32 }), y: numberToHex(q.y, { size: 32 }) };
      if (!out.some((o) => o.x === pt.x && o.y === pt.y)) out.push(pt);
    }
  }
  return out;
}

/** Keys that appear in both candidate sets (two assertions by the same credential → exactly one). */
export function intersectKeys(a: readonly P256Point[], b: readonly P256Point[]): P256Point[] {
  return a.filter((p) => b.some((q) => q.x.toLowerCase() === p.x.toLowerCase() && q.y.toLowerCase() === p.y.toLowerCase()));
}
