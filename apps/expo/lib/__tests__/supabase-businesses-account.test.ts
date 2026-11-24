type Result = { data: any; error: any };
const results: Record<string, Result> = {};
const calls: { column: string; value: string }[] = [];

function mockBuilder() {
  let column = '';
  const b: any = {
    select: () => b,
    order: () => b,
    eq: (c: string, v: string) => {
      column = c;
      calls.push({ column: c, value: v });
      return b;
    },
    then: (resolve: (r: Result) => void) => resolve(results[column] ?? { data: [], error: null }),
  };
  return b;
}
jest.mock('../supabase', () => ({ supabase: { from: () => mockBuilder() } }));

import { fetchPrimaryBusinessForAccount } from '../supabase-businesses';

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
});

describe('fetchPrimaryBusinessForAccount', () => {
  it('uses the business linked to the active org account', async () => {
    results.account_id = { data: [{ id: 'biz-org' }], error: null };
    results.owner_wallet_address = { data: [{ id: 'biz-wallet' }], error: null };
    const b = await fetchPrimaryBusinessForAccount('org-1', '0xABC');
    expect(b?.id).toBe('biz-org');
    expect(calls[0]).toEqual({ column: 'account_id', value: 'org-1' });
  });

  it('falls back to the owner wallet when no business is linked', async () => {
    results.owner_wallet_address = { data: [{ id: 'biz-wallet' }], error: null };
    const b = await fetchPrimaryBusinessForAccount('org-1', '0xABC');
    expect(b?.id).toBe('biz-wallet');
  });

  it('falls back to the owner wallet when the link column does not exist yet', async () => {
    results.account_id = { data: null, error: { code: '42703', message: 'column does not exist' } };
    results.owner_wallet_address = { data: [{ id: 'biz-wallet' }], error: null };
    const b = await fetchPrimaryBusinessForAccount('org-1', '0xABC');
    expect(b?.id).toBe('biz-wallet');
  });

  it('returns null when there is nothing', async () => {
    expect(await fetchPrimaryBusinessForAccount(null, null)).toBeNull();
  });
});
