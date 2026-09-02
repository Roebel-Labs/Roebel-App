/**
 * The save-state toggle rule and the optimistic counter maths behind the
 * "Merken" / "Gewesen" buttons.
 *
 * Both are pure functions of (previous state, tapped state), extracted so the
 * behaviour is testable without a Supabase round trip.
 */
import { nextSaveState, applySaveDelta } from '@/lib/map/save-state';
import type { AccountSaveSummary } from '@/lib/types';

describe('nextSaveState', () => {
  it('sets the state when nothing was held', () => {
    expect(nextSaveState(null, 'to_try')).toBe('to_try');
    expect(nextSaveState(null, 'been')).toBe('been');
  });

  it('clears when the held state is tapped again', () => {
    expect(nextSaveState('to_try', 'to_try')).toBeNull();
    expect(nextSaveState('been', 'been')).toBeNull();
  });

  it('replaces rather than stacks — been supersedes merken', () => {
    expect(nextSaveState('to_try', 'been')).toBe('been');
    expect(nextSaveState('been', 'to_try')).toBe('to_try');
  });
});

describe('applySaveDelta', () => {
  const base: AccountSaveSummary = {
    account_id: 'a1',
    to_try_count: 5,
    been_count: 3,
    save_count: 8,
  };

  it('adds one when a fresh save is made', () => {
    expect(applySaveDelta(base, null, 'to_try')).toMatchObject({
      to_try_count: 6,
      been_count: 3,
      save_count: 9,
    });
  });

  it('removes one when the save is cleared', () => {
    expect(applySaveDelta(base, 'to_try', null)).toMatchObject({
      to_try_count: 4,
      been_count: 3,
      save_count: 7,
    });
  });

  it('moves the count across, not up, when flipping merken → gewesen', () => {
    expect(applySaveDelta(base, 'to_try', 'been')).toMatchObject({
      to_try_count: 4,
      been_count: 4,
      save_count: 8,
    });
  });

  it('never lets a counter go negative on a stale base', () => {
    const empty: AccountSaveSummary = {
      account_id: 'a1',
      to_try_count: 0,
      been_count: 0,
      save_count: 0,
    };
    expect(applySaveDelta(empty, 'to_try', null)).toMatchObject({
      to_try_count: 0,
      save_count: 0,
    });
  });
});
