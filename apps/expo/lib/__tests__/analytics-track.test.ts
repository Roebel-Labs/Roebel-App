const mockRpc = jest.fn().mockResolvedValue({ error: null });
jest.mock('../supabase', () => ({ supabase: { rpc: (...args: any[]) => mockRpc(...args) } }));

import { trackEvent, setTrackerWallet, setTrackingEnabled, flushEvents, resetTracker } from '../analytics/track';

const view = (id: string) => ({ objectType: 'post' as const, objectId: id, metric: 'view' as const, surface: 'detail' });

describe('analytics tracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRpc.mockClear();
    resetTracker();
    setTrackingEnabled(true);
    setTrackerWallet('0xAbC');
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends ten queued events in one call', () => {
    for (let i = 0; i < 10; i++) trackEvent(view(`p${i}`));
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('track_events');
    expect(args.p_events).toHaveLength(10);
    expect(args.p_events[0]).toEqual({ object_type: 'post', object_id: 'p0', metric: 'view', surface: 'detail' });
    expect(args.p_wallet).toBe('0xabc');
  });

  it('flushes after 3 seconds', () => {
    trackEvent(view('a'));
    expect(mockRpc).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3000);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('counts the same view only once within 10 seconds', () => {
    trackEvent(view('a'));
    jest.advanceTimersByTime(5000);
    trackEvent(view('a'));
    flushEvents();
    const sent = mockRpc.mock.calls.flatMap((c) => c[1].p_events);
    expect(sent).toHaveLength(1);
  });

  it('counts every click', () => {
    trackEvent({ objectType: 'deal', objectId: 'd', metric: 'click' });
    trackEvent({ objectType: 'deal', objectId: 'd', metric: 'click' });
    flushEvents();
    expect(mockRpc.mock.calls[0][1].p_events).toHaveLength(2);
  });

  it('sends nothing when tracking is switched off', () => {
    setTrackingEnabled(false);
    trackEvent(view('a'));
    flushEvents();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('tracks logged-out viewers without a wallet', () => {
    setTrackerWallet(null);
    trackEvent(view('a'));
    flushEvents();
    expect(mockRpc.mock.calls[0][1].p_wallet).toBeNull();
  });

  it('swallows a failing call', async () => {
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    trackEvent(view('a'));
    expect(() => flushEvents()).not.toThrow();
    await Promise.resolve();
  });
});
