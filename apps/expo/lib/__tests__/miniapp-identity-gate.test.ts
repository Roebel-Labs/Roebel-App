/**
 * Identity gate: version-2 apps wait for the consent decision; the wallet only with the address grant.
 */
import { createIdentityGate, walletAllowed } from '../miniapp-identity-gate';
import type { IdentityState } from '../miniapp-identity';

const state: IdentityState = {
  subject: 'nz_abc',
  asked: ['address'],
  granted: { profile: false, address: true, credentials: [] },
  credentials: [],
  types: {},
};

describe('walletAllowed', () => {
  it('version 2 without the address grant has no wallet', () =>
    expect(walletAllowed({ manifestVersion: 2 }, { ...state, granted: { ...state.granted, address: false } })).toBe(false));
  it('version 2 with the address grant has the wallet', () => expect(walletAllowed({ manifestVersion: 2 }, state)).toBe(true));
  it('version 2 without a state has no wallet', () => expect(walletAllowed({ manifestVersion: 2 }, null)).toBe(false));
  it('version 1 always has the wallet', () => {
    expect(walletAllowed({ manifestVersion: 1 }, null)).toBe(true);
    expect(walletAllowed({ manifestVersion: 1 }, { ...state, granted: { ...state.granted, address: false } })).toBe(true);
  });
});

describe('createIdentityGate', () => {
  it('the gate resolves once and settle is idempotent', async () => {
    const gate = createIdentityGate();
    let resolved = 0;
    void gate.settled.then(() => resolved++);
    await Promise.resolve();
    expect(resolved).toBe(0);
    gate.settle();
    gate.settle();
    await gate.settled;
    await Promise.resolve();
    expect(resolved).toBe(1);
    expect(gate.isSettled()).toBe(true);
  });
});
