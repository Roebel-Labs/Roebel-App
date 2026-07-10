const mockRpc = jest.fn().mockResolvedValue({ error: null });
jest.mock('../supabase', () => ({ supabase: { rpc: (...args: any[]) => mockRpc(...args) } }));

import { setViewTrackerWallet, trackPostViews, flushPostViews, resetViewTracker } from '../viewTracker';

describe('viewTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRpc.mockClear();
    resetViewTracker();
    setViewTrackerWallet('0xAbC');
  });

  afterEach(() => {
    flushPostViews();
    mockRpc.mockClear();
    jest.useRealTimers();
  });

  it('does nothing without a wallet', () => {
    setViewTrackerWallet(null);
    trackPostViews(['a']);
    jest.advanceTimersByTime(5000);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('batches ids and flushes after the debounce with a lowercased wallet', () => {
    trackPostViews(['a', 'b']);
    expect(mockRpc).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3000);
    expect(mockRpc).toHaveBeenCalledWith('increment_post_views', {
      p_post_ids: expect.arrayContaining(['a', 'b']),
      p_wallet: '0xabc',
    });
  });

  it('throttles re-impressions of the same post within 10s but counts them after', () => {
    trackPostViews(['a']);
    jest.advanceTimersByTime(3000); // flush 1
    trackPostViews(['a']); // < 10s since first count → dropped
    jest.advanceTimersByTime(3000);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10_000);
    trackPostViews(['a']); // > 10s → counts again (X-style)
    jest.advanceTimersByTime(3000);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('flushes immediately at 10 pending ids', () => {
    trackPostViews(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
