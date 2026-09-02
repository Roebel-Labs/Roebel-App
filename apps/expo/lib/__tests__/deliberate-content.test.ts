import { createHash } from 'crypto';

import {
  assertValidContent,
  bytes32ToDigest,
  digestToBytes32,
  sha256HexOf,
} from '../deliberate/content';

const nodeSha256 = async (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256HexOf', () => {
  it('matches the known sha-256 vector for "hello"', async () => {
    await expect(sha256HexOf('hello', nodeSha256)).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('digestToBytes32 / bytes32ToDigest', () => {
  const digest = 'a'.repeat(64);
  it('round-trips a digest through the 0x form', () => {
    expect(digestToBytes32(digest)).toBe(`0x${digest}`);
    expect(bytes32ToDigest(`0x${digest.toUpperCase()}`)).toBe(digest);
  });
  it('rejects non-digests', () => {
    expect(() => digestToBytes32('0xzz')).toThrow();
    expect(() => digestToBytes32('a'.repeat(63))).toThrow();
  });
});

describe('assertValidContent', () => {
  it('accepts a normal argument text', () => {
    expect(() => assertValidContent('Röbel braucht mehr Fahrradwege. 🚲')).not.toThrow();
  });
  it('rejects empty text', () => {
    expect(() => assertValidContent('')).toThrow();
  });
  it('rejects text over 1024 UTF-8 bytes', () => {
    expect(() => assertValidContent('ä'.repeat(513))).toThrow(/zu lang/);
  });
});
