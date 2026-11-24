type Result = { data: any; error: any };
const mockState = {
  results: {} as Record<string, Result>,
  calls: [] as { column: string; value: string }[],
  updates: [] as { values: any; id: string }[],
};

function mockBuilder() {
  let column = '';
  let pendingUpdate: any = null;
  const b: any = {
    select: () => b,
    order: () => b,
    update: (values: any) => {
      pendingUpdate = values;
      return b;
    },
    eq: (c: string, v: string) => {
      if (pendingUpdate) {
        mockState.updates.push({ values: pendingUpdate, id: v });
        return Promise.resolve({ error: null });
      }
      column = c;
      mockState.calls.push({ column: c, value: v });
      return b;
    },
    then: (resolve: (r: Result) => void) => resolve(mockState.results[column] ?? { data: [], error: null }),
  };
  return b;
}
jest.mock('../supabase', () => ({ supabase: { from: () => mockBuilder() } }));

import { fetchPrimaryBusinessForAccount } from '../supabase-businesses';

beforeEach(() => {
  mockState.calls.length = 0;
  mockState.updates.length = 0;
  mockState.results = {};
});

describe('fetchPrimaryBusinessForAccount', () => {
  it('uses the business linked to the active org account', async () => {
    mockState.results.account_id = { data: [{ id: 'biz-org', account_id: 'org-1' }], error: null };
    const b = await fetchPrimaryBusinessForAccount('org-1', '0xABC');
    expect(b?.id).toBe('biz-org');
    expect(mockState.calls[0]).toEqual({ column: 'account_id', value: 'org-1' });
  });

  it("falls back to the wallet's unlinked business and links it to the active org", async () => {
    mockState.results.owner_wallet_address = { data: [{ id: 'biz-wallet', account_id: null, status: 'published' }], error: null };
    const b = await fetchPrimaryBusinessForAccount('org-1', '0xABC');
    expect(b?.id).toBe('biz-wallet');
    expect(mockState.updates).toEqual([{ values: { account_id: 'org-1' }, id: 'biz-wallet' }]);
  });

  it("never shows another org's business", async () => {
    mockState.results.owner_wallet_address = { data: [{ id: 'biz-other', account_id: 'org-2' }], error: null };
    expect(await fetchPrimaryBusinessForAccount('org-1', '0xABC')).toBeNull();
  });

  it('prefers an approved business among unlinked ones', async () => {
    mockState.results.owner_wallet_address = {
      data: [
        { id: 'new-draft', account_id: null, status: 'pending' },
        { id: 'approved', account_id: null, status: 'approved' },
      ],
      error: null,
    };
    expect((await fetchPrimaryBusinessForAccount(null, '0xABC'))?.id).toBe('approved');
  });

  it('falls back when the link column does not exist yet (no link written)', async () => {
    mockState.results.account_id = { data: null, error: { code: '42703', message: 'column does not exist' } };
    mockState.results.owner_wallet_address = { data: [{ id: 'biz-wallet' }], error: null };
    const b = await fetchPrimaryBusinessForAccount('org-1', '0xABC');
    expect(b?.id).toBe('biz-wallet');
    expect(mockState.updates).toEqual([]);
  });

  it('returns null when there is nothing', async () => {
    expect(await fetchPrimaryBusinessForAccount(null, null)).toBeNull();
  });
});
