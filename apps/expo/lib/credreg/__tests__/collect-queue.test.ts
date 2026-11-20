jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { collectQueueKey, enqueueCollect, flushCollectQueue, readCollectQueue } from '../collect-queue';

const ADDR = '0x' + 'cd'.repeat(20);
const DAY = 24 * 3600_000;

describe('collect queue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('flushCollectQueue sends each scan once, keeps it on network error, removes it on any answer', async () => {
    await enqueueCollect(ADDR, 'paid-1');
    await enqueueCollect(ADDR, 'already-1');
    await enqueueCollect(ADDR, 'rejected-1');
    await enqueueCollect(ADDR, 'offline-1');
    await enqueueCollect(ADDR, 'paid-1'); // deduplicated
    const answers: Record<string, any> = {
      'paid-1': { status: 'paid', amountAtto: '1', txHash: '0x' },
      'already-1': { status: 'already_claimed' },
      'rejected-1': { status: 'rejected', reason: 'event ended' },
      'offline-1': { status: 'failed', reason: 'Network request failed' },
    };
    const claim = jest.fn(async (_a: string, _action: string, id?: string) => answers[id!]);
    const onAnswer = jest.fn();
    // Two flushes at once (foreground + back online): the second joins the first, each scan is sent once.
    const [r1, r2] = await Promise.all([flushCollectQueue(ADDR, { claim, onAnswer }), flushCollectQueue(ADDR, { claim, onAnswer })]);
    expect(claim).toHaveBeenCalledTimes(4);
    expect(claim).toHaveBeenCalledWith(ADDR, 'event_attend', 'paid-1');
    expect(r1).toEqual({ sent: 3, kept: 1 });
    expect(r2).toEqual(r1);
    expect(onAnswer).toHaveBeenCalledTimes(3);
    expect((await readCollectQueue(ADDR)).map((e) => e.eventId)).toEqual(['offline-1']);
    // Next time the network is back: sent and gone.
    answers['offline-1'] = { status: 'paid', amountAtto: '1', txHash: '0x' };
    expect(await flushCollectQueue(ADDR, { claim })).toEqual({ sent: 1, kept: 0 });
    expect(await readCollectQueue(ADDR)).toEqual([]);
    expect(await AsyncStorage.getItem(collectQueueKey(ADDR))).toBeNull();
  });

  it('queue entries older than 7 days are dropped', async () => {
    const t0 = Date.parse('2026-12-01T10:00:00Z');
    await enqueueCollect(ADDR, 'old', t0);
    await enqueueCollect(ADDR, 'fresh', t0 + 6 * DAY);
    const claim = jest.fn(async () => ({ status: 'paid' as const, amountAtto: '1', txHash: '0x' }));
    expect(await flushCollectQueue(ADDR, { claim, now: () => t0 + 7 * DAY + 1 })).toEqual({ sent: 1, kept: 0 });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(ADDR, 'event_attend', 'fresh');
  });

  it('a broken stored queue reads as empty', async () => {
    await AsyncStorage.setItem(collectQueueKey(ADDR), '{not json');
    expect(await readCollectQueue(ADDR)).toEqual([]);
  });
});
