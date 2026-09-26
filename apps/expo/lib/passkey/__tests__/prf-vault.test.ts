import { webcrypto } from 'crypto';
import { hexToBytes, stringToBytes, type Hex } from 'viem';
import { unwrapSecret, wrapSecret, PRF_VAULT_HKDF_INFO } from '../prf-vault';
import { base64UrlDecode } from '../encoding';

const prf: Hex = `0x${'42'.repeat(32)}`;
const otherPrf: Hex = `0x${'43'.repeat(32)}`;
const secret = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);

describe('prf-vault (AES-256-GCM, HKDF-SHA256(prf, salt=label))', () => {
  it('round-trips and uses the versioned pkv1: prefix', async () => {
    const blob = await wrapSecret(prf, 'maci', secret);
    expect(blob.startsWith('pkv1:')).toBe(true);
    expect(await unwrapSecret(prf, 'maci', blob)).toEqual(secret);
  });

  it('uses a fresh IV per wrap', async () => {
    expect(await wrapSecret(prf, 'maci', secret)).not.toBe(await wrapSecret(prf, 'maci', secret));
  });

  it('fails to unwrap with the wrong label', async () => {
    const blob = await wrapSecret(prf, 'maci', secret);
    await expect(unwrapSecret(prf, 'nostr', blob)).rejects.toThrow();
  });

  it('fails to unwrap with the wrong PRF', async () => {
    const blob = await wrapSecret(prf, 'maci', secret);
    await expect(unwrapSecret(otherPrf, 'maci', blob)).rejects.toThrow();
  });

  it('rejects tampered ciphertext and unknown versions', async () => {
    const blob = await wrapSecret(prf, 'maci', secret);
    const last = blob.slice(-1) === 'A' ? 'B' : 'A';
    await expect(unwrapSecret(prf, 'maci', blob.slice(0, -1) + last)).rejects.toThrow();
    await expect(unwrapSecret(prf, 'maci', blob.replace('pkv1:', 'pkv2:'))).rejects.toThrow(/version/);
  });

  it('refuses a missing / malformed PRF (never derives from nothing)', async () => {
    await expect(wrapSecret('0x' as Hex, 'maci', secret)).rejects.toThrow(/PRF/);
    await expect(wrapSecret(`0x${'00'.repeat(16)}` as Hex, 'maci', secret)).rejects.toThrow(/PRF/);
  });

  it('is interoperable with standard WebCrypto HKDF + AES-GCM (node)', async () => {
    const blob = await wrapSecret(prf, 'nostr', secret);
    const raw = base64UrlDecode(blob.slice('pkv1:'.length));
    const iv = raw.slice(0, 12);
    const ct = raw.slice(12);
    const ikm = await webcrypto.subtle.importKey('raw', hexToBytes(prf), 'HKDF', false, ['deriveKey']);
    const key = await webcrypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: stringToBytes('nostr'), info: stringToBytes(PRF_VAULT_HKDF_INFO) },
      ikm,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const pt = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: stringToBytes('nostr'), tagLength: 128 },
      key,
      ct,
    );
    expect(new Uint8Array(pt)).toEqual(secret);
  });
});
