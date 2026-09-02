/**
 * Pure rules behind the "Merken" / "Gewesen" buttons.
 *
 * Kept out of the hook so the toggle behaviour and the optimistic counter
 * maths can be tested without a Supabase round trip.
 */
import type { AccountSaveState, AccountSaveSummary } from '@/lib/types';

/**
 * What tapping `tapped` does to a viewer currently holding `current`.
 *
 * Tapping the state you already hold clears it; tapping the other one replaces
 * it. A person never holds both — "Gewesen" supersedes "Merken".
 */
export function nextSaveState(
  current: AccountSaveState | null,
  tapped: AccountSaveState
): AccountSaveState | null {
  return current === tapped ? null : tapped;
}

/**
 * Move the counters for a state change, without waiting for the server.
 *
 * Clamped at zero: the base summary can be stale (someone else's save landed
 * between fetch and tap) and a negative count on screen is worse than being
 * one off until the next refresh.
 */
export function applySaveDelta(
  base: AccountSaveSummary,
  previous: AccountSaveState | null,
  next: AccountSaveState | null
): AccountSaveSummary {
  const delta = (state: AccountSaveState) =>
    (next === state ? 1 : 0) - (previous === state ? 1 : 0);

  const toTry = Math.max(0, base.to_try_count + delta('to_try'));
  const been = Math.max(0, base.been_count + delta('been'));

  return { ...base, to_try_count: toTry, been_count: been, save_count: toTry + been };
}
