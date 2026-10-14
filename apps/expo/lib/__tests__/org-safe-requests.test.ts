import { getAddress, type Hex } from 'viem';
import { orgIdFromUuid } from '../org-safe/ops';
import { actionableCount, orgDirectory, selectOpenOrgRequests, type RawOrgRequest } from '../org-safe/requests';

jest.mock('expo-updates', () => ({ channel: null }));
jest.mock('@/lib/supabase-app-settings', () => ({
  fetchOrgSafesEnabled: jest.fn(),
  fetchOrgSafesEnabledProduction: jest.fn(),
}));
jest.mock('../org-safe/chain', () => ({ orgSafesConfigured: () => true }));
// eslint-disable-next-line import/first
import { orgSafesAllowed } from '../org-safe/gate';

const U1 = '6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10';
const U2 = '0b3660d4-2c59-48cf-bd29-9ed66f68da06';
const SAFE = getAddress('0x' + 'f'.repeat(40));
const NOW = 1_800_000_000;

function req(over: Partial<RawOrgRequest> = {}): RawOrgRequest {
  return {
    requestType: 0,
    status: 0,
    orgId: orgIdFromUuid(U1),
    safe: SAFE,
    approvals: 1,
    rejections: 0,
    requiredApprovals: 3,
    requiredRejections: 2,
    expiresAt: NOW + 100,
    ...over,
  };
}

describe('orgDirectory', () => {
  it('keys app orgs by their NSP-14 org id and skips non-uuids', () => {
    const dir = orgDirectory([
      { id: U1, name: 'Eins' },
      { id: 'not-a-uuid', name: 'Kaputt' },
    ]);
    expect(dir.size).toBe(1);
    expect(dir.get(orgIdFromUuid(U1).toLowerCase())?.name).toBe('Eins');
  });
});

describe('selectOpenOrgRequests', () => {
  const directory = orgDirectory([{ id: U1, name: 'Eins' }]);

  it('keeps only pending, unexpired registrations, newest first, with ids from firstId', () => {
    const items = selectOpenOrgRequests({
      requests: [
        req(), // id 10
        req({ status: 2 }), // executed
        req({ requestType: 1 }), // revocation
        req({ expiresAt: NOW }), // expired
        req({ orgId: orgIdFromUuid(U2) as Hex }), // id 14, unknown org
      ],
      firstId: 10,
      now: NOW,
      directory,
      voted: new Set([10]),
      selfOwned: new Set([14]),
    });
    expect(items.map((i) => i.requestId)).toEqual([14, 10]);
    expect(items[0].org).toBeNull();
    expect(items[0].selfOwned).toBe(true);
    expect(items[1].org?.name).toBe('Eins');
    expect(items[1].voted).toBe(true);
    expect(items[1].required).toBe(3);
    expect(actionableCount(items)).toBe(1);
  });
});

describe('orgSafesAllowed', () => {
  const base = { flag: true, productionFlag: false, channel: 'preview', dev: false };
  it('needs the flag', () => expect(orgSafesAllowed({ ...base, flag: false })).toBe(false));
  it('opens on preview channels', () => expect(orgSafesAllowed(base)).toBe(true));
  it('opens in dev', () => expect(orgSafesAllowed({ ...base, channel: null, dev: true })).toBe(true));
  it('stays closed with no channel', () => expect(orgSafesAllowed({ ...base, channel: null })).toBe(false));
  it('needs the production flag on production', () => {
    expect(orgSafesAllowed({ ...base, channel: 'production' })).toBe(false);
    expect(orgSafesAllowed({ ...base, channel: 'production', productionFlag: true })).toBe(true);
  });
});
