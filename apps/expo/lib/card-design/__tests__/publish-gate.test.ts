jest.mock('thirdweb/react', () => ({ useActiveAccount: () => null }));
jest.mock('@/lib/credreg/gate', () => ({ useCredentialsGate: () => null }));
jest.mock('@/lib/credreg/org-visibility', () => ({ sessionOrgList: jest.fn() }));

import { PUBLISH_NOT_IN_REGISTER, PUBLISH_REGISTER_OFF, publishGate } from '../publish-gate';

describe('publishGate', () => {
  it('allows publishing only with the register on and the org ready', () => {
    expect(publishGate({ gate: true, onChain: 'ready' })).toEqual({ allowed: true });
  });
  it('explains a not-registered org (drafting still works)', () => {
    expect(publishGate({ gate: true, onChain: 'org_not_registered' })).toEqual({ allowed: false, loading: false, reason: PUBLISH_NOT_IN_REGISTER });
    expect(publishGate({ gate: true, onChain: null })).toMatchObject({ allowed: false, reason: PUBLISH_NOT_IN_REGISTER });
    expect(PUBLISH_NOT_IN_REGISTER).toBe('Veröffentlichen geht, sobald eure Organisation im Register eingetragen ist.');
  });
  it('explains a closed register and waits while loading', () => {
    expect(publishGate({ gate: false, onChain: 'ready' })).toMatchObject({ allowed: false, reason: PUBLISH_REGISTER_OFF });
    expect(publishGate({ gate: null, onChain: 'ready' })).toMatchObject({ allowed: false, loading: true });
    expect(publishGate({ gate: true, onChain: null, loading: true })).toMatchObject({ allowed: false, loading: true });
  });
});
