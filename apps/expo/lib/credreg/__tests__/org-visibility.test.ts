jest.mock('thirdweb/react', () => ({ useActiveAccount: () => null }));
jest.mock('@/context/AccountContext', () => ({ useAccount: () => ({}) }));
jest.mock('../gate', () => ({ useCredentialsGate: () => null }));
const mockFetchOrgs = jest.fn();
jest.mock('../api', () => ({ fetchOrgs: (...a: unknown[]) => mockFetchOrgs(...a) }));

import { __resetSessionOrgs, orgCredentialsVisible, sessionOrgList } from '../org-visibility';

const account = { address: '0xAbC', signMessage: async () => '0x' };
const org = (onChain: 'ready' | 'org_not_registered') => ({
  accountId: 'o1', name: 'Verein', avatarUrl: null, subType: null, role: 'owner', membersMayBePublic: false, onChain,
});

describe('orgCredentialsVisible', () => {
  it('hides the register entries when the gate is open but the org is not on chain', () => {
    expect(orgCredentialsVisible({ gate: true, onChain: 'org_not_registered' })).toBe(false);
    expect(orgCredentialsVisible({ gate: true, onChain: 'no_chain_authority' })).toBe(false);
    expect(orgCredentialsVisible({ gate: true, onChain: null })).toBe(false);
  });
  it('shows them when the gate is open and the org is ready', () => {
    expect(orgCredentialsVisible({ gate: true, onChain: 'ready' })).toBe(true);
  });
  it('hides them when the gate is closed or still loading', () => {
    expect(orgCredentialsVisible({ gate: false, onChain: 'ready' })).toBe(false);
    expect(orgCredentialsVisible({ gate: null, onChain: 'ready' })).toBe(false);
  });
});

describe('sessionOrgList', () => {
  beforeEach(() => { __resetSessionOrgs(); mockFetchOrgs.mockReset(); });

  it('reads orgs_list once per wallet', async () => {
    mockFetchOrgs.mockResolvedValue({ ok: true, data: [org('ready')] });
    await sessionOrgList(account);
    expect(await sessionOrgList({ ...account, address: '0xabc' })).toEqual([org('ready')]);
    expect(mockFetchOrgs).toHaveBeenCalledTimes(1);
  });

  it('fails closed and tries again after a failed read', async () => {
    mockFetchOrgs.mockResolvedValueOnce({ ok: false, code: 'NETWORK_ERROR', message: 'x' });
    expect(await sessionOrgList(account)).toBeNull();
    mockFetchOrgs.mockResolvedValueOnce({ ok: true, data: [org('org_not_registered')] });
    expect(await sessionOrgList(account)).toEqual([org('org_not_registered')]);
    expect(mockFetchOrgs).toHaveBeenCalledTimes(2);
  });
});
