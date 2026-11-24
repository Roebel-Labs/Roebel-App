const mockRpc = jest.fn();
jest.mock('../supabase', () => ({ supabase: { rpc: (...a: any[]) => mockRpc(...a) } }));

import { fetchAnalyticsSeries, fetchAnalyticsTotals, ALL_METRICS } from '../analytics/queries';

const range = { from: '2026-11-22', to: '2026-11-24' };

beforeEach(() => mockRpc.mockReset());

describe('fetchAnalyticsSeries', () => {
  it('turns RPC rows into one array per metric in day order, zero-filled', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { day: '2026-11-24', metric: 'view', count: 5 },
        { day: '2026-11-22', metric: 'view', count: 2 },
        { day: '2026-11-23', metric: 'like', count: 1 },
      ],
      error: null,
    });
    const s = await fetchAnalyticsSeries('org', '0xw', range, ['view', 'like']);
    expect(s.view).toEqual([2, 0, 5]);
    expect(s.like).toEqual([0, 1, 0]);
    expect(mockRpc).toHaveBeenCalledWith('get_account_analytics', {
      p_account_id: 'org',
      p_wallet: '0xw',
      p_from: '2026-11-22',
      p_to: '2026-11-24',
      p_metrics: ['view', 'like'],
      p_object_type: null,
    });
  });

  it('throws when the RPC fails (screen shows its error state)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not allowed' } });
    await expect(fetchAnalyticsSeries('org', '0xw', range, ['view'])).rejects.toThrow('not allowed');
  });
});

describe('fetchAnalyticsTotals', () => {
  it('gives every metric a zero total when nothing happened', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const t = await fetchAnalyticsTotals('org', '0xw', range);
    for (const m of ALL_METRICS) expect(t[m]).toEqual({ current: 0, previous: 0 });
  });

  it('reads current and previous', async () => {
    mockRpc.mockResolvedValue({ data: [{ metric: 'follow', current: 4, previous: 1 }], error: null });
    const t = await fetchAnalyticsTotals('org', '0xw', range);
    expect(t.follow).toEqual({ current: 4, previous: 1 });
  });
});
