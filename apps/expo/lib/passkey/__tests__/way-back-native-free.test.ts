/**
 * way-back.ts is loaded by the citizenship screens for EVERY login. It must not pull in the
 * native passkey module (or the userop/webauthn/guardians chain that leads to it) at import time.
 * Each of those modules throws on load here; way-back.ts must still import and answer a provider
 * account (and the pure rule must still run for a passkey account with injected deps).
 */
jest.mock('react-native-passkey', () => {
  throw new Error('react-native-passkey must not load with way-back.ts');
});
jest.mock('../webauthn', () => {
  throw new Error('webauthn must not load with way-back.ts');
});
jest.mock('../userop', () => {
  throw new Error('userop must not load with way-back.ts');
});
jest.mock('../guardians', () => {
  throw new Error('guardians must not load with way-back.ts');
});
jest.mock('../way-back-runtime', () => {
  throw new Error('a provider login must never load the way-back runtime');
});

import { PASSKEY_SESSION_PROP } from '../active';
import { checkWayBack, readWayBack } from '../way-back';

describe('way-back.ts stays native-free', () => {
  it('imports and answers a provider account without loading any passkey native', async () => {
    expect(await checkWayBack({})).toEqual({ ok: true, kind: 'provider', option: { label: 'Vertrauensperson hinzufügen', route: '/settings/passkey' } });
  });

  it('the people/words split still works for a passkey account (injected deps)', async () => {
    const safe = '0x1111111111111111111111111111111111111111';
    const pool = { addresses: [0, 1, 2, 3, 4].map((i) => `0x444444444444444444444444444444444444444${i}`) as `0x${string}`[], confirmedAt: 1 };
    const account = { [PASSKEY_SESSION_PROP]: { credentialId: 'c', safe, identity: safe } };
    const r = await readWayBack(account, {
      readState: async () => ({ guardians: [pool.addresses[0]], threshold: 1 }),
      loadPool: async () => pool,
    });
    expect(r).toEqual({ kind: 'passkey', ok: true });
  });
});
