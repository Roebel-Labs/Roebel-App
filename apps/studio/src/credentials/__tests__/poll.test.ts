import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchActions } from '../poll';
import type { ActionStatus, ActionView } from '../types';

const action = (id: string, status: ActionStatus): ActionView => ({
  id,
  status,
  summary: { title: 'x', lines: [], orgName: null },
  via: 'studio',
  preparedByMe: true,
  confirmedByMe: false,
  txHash: null,
  error: null,
  createdAt: '2026-11-18T10:00:00Z',
  expiresAt: '2026-11-25T10:00:00Z',
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('watchActions', () => {
  it('polls fast while something is pending and slows down when all are final', async () => {
    const answers = [[action('a', 'awaiting_confirmation')], [action('a', 'submitted')], [action('a', 'done')], [action('a', 'done')]];
    let i = 0;
    const fetchOnce = vi.fn(async () => answers[Math.min(i++, answers.length - 1)]);
    const ctrl = new AbortController();
    watchActions(fetchOnce, () => {}, { signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchOnce).toHaveBeenCalledTimes(2); // submitted: still fast
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchOnce).toHaveBeenCalledTimes(3); // done now: slow from here
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(55_000);
    expect(fetchOnce).toHaveBeenCalledTimes(4);
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchOnce).toHaveBeenCalledTimes(4);
  });

  it('reports each status change once, including done after another admin confirmed', async () => {
    // The other admin's phone confirmed: Studio only sees the status flip, and shows it once.
    const answers = [
      [action('a', 'awaiting_confirmation')],
      [action('a', 'awaiting_confirmation')],
      [action('a', 'done')],
      [action('a', 'done')],
      [action('a', 'done')],
    ];
    let i = 0;
    const seen: ActionStatus[][] = [];
    const ctrl = new AbortController();
    watchActions(async () => answers[Math.min(i++, answers.length - 1)], (list) => seen.push(list.map((a) => a.status)), { signal: ctrl.signal, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    for (let k = 0; k < 4; k++) await vi.advanceTimersByTimeAsync(60_000);
    ctrl.abort();
    expect(seen).toEqual([['awaiting_confirmation'], ['done']]);
  });

  it('keeps polling after a failed fetch', async () => {
    let i = 0;
    const fetchOnce = vi.fn(async () => {
      if (i++ === 0) throw new Error('offline');
      return [action('a', 'done')];
    });
    const onChange = vi.fn();
    const ctrl = new AbortController();
    watchActions(fetchOnce, onChange, { signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    ctrl.abort();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('statusLine', () => {
  it('names every action state in German without suggesting it is done early', async () => {
    const { statusLine } = await import('../poll');
    expect(statusLine({ status: 'awaiting_confirmation', error: null })).toBe('Wartet auf Bestätigung');
    expect(statusLine({ status: 'submitted', error: null })).toBe('Wird eingetragen');
    expect(statusLine({ status: 'done', error: null })).toBe('Erledigt');
    // Server errors are internal English ('transaction reverted'): never shown to the user.
    expect(statusLine({ status: 'failed', error: 'transaction reverted' })).toBe('Fehlgeschlagen');
    expect(statusLine({ status: 'failed', error: null })).toBe('Fehlgeschlagen');
    expect(statusLine({ status: 'expired', error: null })).toBe('Abgelaufen');
    expect(statusLine({ status: 'cancelled', error: null })).toBe('Verworfen');
  });
});

describe('standalonePending', () => {
  it('shows the own pending card only while the action is not in the list yet', async () => {
    const { standalonePending } = await import('../poll');
    expect(standalonePending(null, [])).toBe(false);
    expect(standalonePending('a', [])).toBe(true);
    expect(standalonePending('a', [action('a', 'awaiting_confirmation')])).toBe(false);
    // Once confirmed, the history row shows the final state: no second card.
    expect(standalonePending('a', [action('a', 'done')])).toBe(false);
  });
});
