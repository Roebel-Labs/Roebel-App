jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import type { Hex } from 'viem';
import { PasskeyCancelledError } from '../webauthn';
import { MIGRATION_STORE_KEY, loadMigrationRecord } from '../migration';
import { predictSafeAddress } from '../safe-address';
import { ensureStandalonePasskey } from '../standalone';
import vector from './passkey-safe-vector.json';

const x = vector.x as Hex;
const y = vector.y as Hex;

function mem() {
  const m = new Map<string, string>();
  return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) };
}

describe('ensureStandalonePasskey', () => {
  it('creates a legacy-less record for the counterfactual Safe', async () => {
    const storage = mem();
    const r = await ensureStandalonePasskey('Anna', {
      storage,
      createPasskey: async () => ({ credentialId: 'c', x, y, prfSupported: false }),
    });
    expect(r.status).toBe('created');
    const rec = await loadMigrationRecord(storage);
    expect(rec).toMatchObject({ safe: predictSafeAddress({ x, y }), status: 'passkeyCreated', ownerType: 'sharedSigner' });
    expect(rec?.legacy).toBeUndefined();
  });

  it('never creates a second passkey when a record exists', async () => {
    const storage = mem();
    const createPasskey = jest.fn(async () => ({ credentialId: 'c', x, y, prfSupported: false }));
    await ensureStandalonePasskey('Anna', { storage, createPasskey });
    const again = await ensureStandalonePasskey('Anna', { storage, createPasskey });
    expect(again.status).toBe('existing');
    expect(createPasskey).toHaveBeenCalledTimes(1);
  });

  it('a cancelled sheet leaves nothing behind', async () => {
    const storage = mem();
    const r = await ensureStandalonePasskey('Anna', {
      storage,
      createPasskey: async () => Promise.reject(new PasskeyCancelledError()),
    });
    expect(r.status).toBe('cancelled');
    expect(storage.m.has(MIGRATION_STORE_KEY)).toBe(false);
  });
});
