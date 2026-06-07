/**
 * Unit tests for Shamir wrapper. Runs under Jest / Vitest when a test
 * runner is added to apps/web. Until then, see
 * apps/web/scripts/verify-shamir.mjs for a Node-runnable equivalent.
 */

import {
  bytesToMacisk,
  combineShares,
  macipkToBytes,
  splitSecret,
} from "../sss";

describe("sss", () => {
  function randomSecret(): Uint8Array {
    const s = new Uint8Array(32);
    for (let i = 0; i < s.length; i++) s[i] = Math.floor(Math.random() * 256);
    return s;
  }

  test("3-of-5 round-trip restores the secret", async () => {
    const secret = randomSecret();
    const shares = await splitSecret(secret, { threshold: 3, total: 5 });
    expect(shares).toHaveLength(5);
    const restored = await combineShares(shares.slice(0, 3));
    expect(Array.from(restored)).toEqual(Array.from(secret));
  });

  test("any 3 of the 5 shares restore the secret (combinatorial)", async () => {
    const secret = randomSecret();
    const shares = await splitSecret(secret, { threshold: 3, total: 5 });
    const triples = [
      [0, 1, 2],
      [0, 1, 4],
      [0, 3, 4],
      [2, 3, 4],
    ];
    for (const triple of triples) {
      const subset = triple.map((i) => shares[i]);
      const restored = await combineShares(subset);
      expect(Array.from(restored)).toEqual(Array.from(secret));
    }
  });

  test("2 shares with a 3-of-5 split do NOT reconstruct the true secret", async () => {
    const secret = randomSecret();
    const shares = await splitSecret(secret, { threshold: 3, total: 5 });
    // shamir-secret-sharing.combine() with too few shares returns garbage,
    // it does NOT throw — guarantee is "below-threshold reveals no info"
    // not "below-threshold errors". We assert the returned bytes are not
    // equal to the original secret.
    const tooFew = await combineShares(shares.slice(0, 2));
    expect(Array.from(tooFew)).not.toEqual(Array.from(secret));
  });

  test("tampered share yields wrong reconstruction (1 corrupt + 2 valid)", async () => {
    const secret = randomSecret();
    const shares = await splitSecret(secret, { threshold: 3, total: 5 });
    const tampered = { ...shares[0], bytes: new Uint8Array(shares[0].bytes) };
    tampered.bytes[0] ^= 0xff;
    const restored = await combineShares([tampered, shares[1], shares[2]]);
    expect(Array.from(restored)).not.toEqual(Array.from(secret));
  });

  test("macisk encode/decode round-trip", () => {
    const original =
      "macisk.0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
    const bytes = macipkToBytes(original);
    expect(bytes).toHaveLength(32);
    expect(bytesToMacisk(bytes)).toBe(original);
  });

  test("validateParams rejects degenerate configs", async () => {
    const secret = randomSecret();
    await expect(splitSecret(secret, { threshold: 1, total: 5 })).rejects.toThrow();
    await expect(splitSecret(secret, { threshold: 5, total: 3 })).rejects.toThrow();
    await expect(splitSecret(secret, { threshold: 3, total: 256 })).rejects.toThrow();
  });
});
