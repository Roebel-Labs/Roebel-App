import { orgNameFor } from '../miniapp-names';
import { orgIdFromUuid } from '../org-safe/ops';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/constants/gnosis', () => ({
  GNOSIS_READ_RPC: 'http://localhost',
  orgRegistryGnosisAddress: '0x320b4ea2f4E31b81245e684D08AF593DE05E9919',
}));

const SAFE = '0x4444444444444444444444444444444444444444';
const PSV = '2f0c1a7e-1111-4222-8333-444455556666';
const OTHER = '9a0c1a7e-1111-4222-8333-444455556666';
const orgs = async () => [
  { id: OTHER, name: 'Anderer Verein' },
  { id: PSV, name: ' PSV Röbel ' },
];

describe('orgNameFor', () => {
  it('names the org registered for a Safe', async () =>
    expect(await orgNameFor(SAFE, { orgIdOfSafe: async () => orgIdFromUuid(PSV), orgs })).toBe('PSV Röbel'));

  it('an address with no registered org is unknown', async () =>
    expect(await orgNameFor(SAFE, { orgIdOfSafe: async () => `0x${'0'.repeat(64)}`, orgs })).toBeNull());

  it('a registered id without an account is unknown', async () =>
    expect(
      await orgNameFor(SAFE, { orgIdOfSafe: async () => orgIdFromUuid('00000000-0000-4000-8000-000000000000'), orgs }),
    ).toBeNull());

  it('a failed chain read is unknown, never a throw', async () =>
    expect(await orgNameFor(SAFE, { orgIdOfSafe: async () => Promise.reject(new Error('rpc')), orgs })).toBeNull());
});
