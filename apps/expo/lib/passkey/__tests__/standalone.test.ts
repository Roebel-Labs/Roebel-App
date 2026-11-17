jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { getAddress, type Hex } from 'viem';
import { WORDS_KEY_PLACEHOLDER } from '../session';
import ecdsaVector from './ecdsa-safe-vector.json';
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

  it('a words record on the device does not block a passkey sign-up', async () => {
    const storage = mem();
    const words = {
      credentialId: '',
      x: WORDS_KEY_PLACEHOLDER,
      y: WORDS_KEY_PLACEHOLDER,
      safe: getAddress(ecdsaVector.safeAddress),
      ownerType: 'ecdsa',
      owner: getAddress(ecdsaVector.owner),
      status: 'passkeyCreated',
    };
    storage.m.set(MIGRATION_STORE_KEY, JSON.stringify(words));
    expect(await loadMigrationRecord(storage)).toEqual(words); // the loader reads it as an ecdsa record
    const createPasskey = jest.fn(async () => ({ credentialId: 'c', x, y, prfSupported: false }));
    const r = await ensureStandalonePasskey('Anna', { storage, createPasskey });
    expect(r.status).toBe('created');
    expect(createPasskey).toHaveBeenCalledTimes(1);
    expect(await loadMigrationRecord(storage)).toMatchObject({ credentialId: 'c', ownerType: 'sharedSigner', safe: predictSafeAddress({ x, y }) });
  });

  it('the record loader keeps the passkey rules and accepts an ecdsa record only with the placeholder key', async () => {
    const storage = mem();
    const base = { safe: getAddress(ecdsaVector.safeAddress), owner: getAddress(ecdsaVector.owner), status: 'passkeyCreated' };
    storage.m.set(MIGRATION_STORE_KEY, JSON.stringify({ ...base, credentialId: '', x: WORDS_KEY_PLACEHOLDER, y: `0x${'11'.repeat(32)}`, ownerType: 'ecdsa' }));
    expect(await loadMigrationRecord(storage)).toBeNull();
    storage.m.set(MIGRATION_STORE_KEY, JSON.stringify({ ...base, credentialId: 'c', x: WORDS_KEY_PLACEHOLDER, y: WORDS_KEY_PLACEHOLDER, ownerType: 'ecdsa' }));
    expect(await loadMigrationRecord(storage)).toBeNull();
    storage.m.set(MIGRATION_STORE_KEY, JSON.stringify({ ...base, credentialId: '', x, y, ownerType: 'sharedSigner' }));
    expect(await loadMigrationRecord(storage)).toBeNull();
  });
});
