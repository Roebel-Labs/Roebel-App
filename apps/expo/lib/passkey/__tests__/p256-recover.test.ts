import { hexToString, type Hex } from 'viem';
import { intersectKeys, isOnCurve, recoverP256PublicKeys } from '../p256-recover';
import { webAuthnSigningDigest } from '../userop';
import { assertionFor, newTestPasskey } from '../__testutils__/signin-helpers';
import rv from './recovery-vector.json';

const lower = (p: { x: string; y: string }) => ({ x: p.x.toLowerCase(), y: p.y.toLowerCase() });

describe('recoverP256PublicKeys', () => {
  it('recovers the fork-proven guardian passkey from its approval signature', () => {
    const g = rv.guardianApproval;
    const { digest } = webAuthnSigningDigest(g.authenticatorData as Hex, hexToString(g.clientDataJSONHex as Hex));
    const keys = recoverP256PublicKeys(digest, BigInt(g.r), BigInt(g.s)).map(lower);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys.length).toBeLessThanOrEqual(2);
    expect(keys).toContainEqual(lower({ x: g.guardianX, y: g.guardianY }));
  });

  it('recovers the recovered-wallet passkey from the post-recovery userOp signature', () => {
    const pr = rv.postRecoveryUserOp;
    const { digest } = webAuthnSigningDigest(pr.authenticatorData as Hex, hexToString(pr.clientDataJSONHex as Hex));
    const keys = recoverP256PublicKeys(digest, BigInt(pr.r), BigInt(pr.s)).map(lower);
    expect(keys).toContainEqual(lower({ x: rv.newX, y: rv.newY }));
    for (const k of keys) expect(isOnCurve(BigInt(k.x), BigInt(k.y))).toBe(true);
  });

  it('works for high-s signatures straight from an authenticator, and two assertions intersect to the key', () => {
    const pk = newTestPasskey();
    const sets = [1, 2].map((i) => {
      const a = assertionFor(pk, `0x${String(i).repeat(64)}` as Hex);
      const { digest } = webAuthnSigningDigest(a.authenticatorData, a.clientDataJSON);
      return recoverP256PublicKeys(digest, a.r, a.s);
    });
    for (const s of sets) expect(s.map(lower)).toContainEqual(lower(pk));
    expect(intersectKeys(sets[0], sets[1]).map(lower)).toEqual([lower(pk)]);
  });

  it('rejects out-of-range scalars', () => {
    expect(() => recoverP256PublicKeys(`0x${'11'.repeat(32)}`, 0n, 1n)).toThrow();
  });
});
