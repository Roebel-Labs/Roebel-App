/**
 * Opening a mini app straight from the home-screen widget: wait until the account has
 * reconnected (cold start) so the app never loads as logged out.
 */
import { shouldAutoOpen } from '../miniapp-autoopen';

const base = { openParam: '1', decision: 'open' as const, walletStatus: 'connected' as const, timedOut: false };

it('opens once the account is connected', () => expect(shouldAutoOpen(base)).toBe(true));

it('waits while the wallet is still reconnecting (Review Focus 1)', () => {
  expect(shouldAutoOpen({ ...base, walletStatus: 'connecting' })).toBe(false);
  expect(shouldAutoOpen({ ...base, walletStatus: 'unknown' })).toBe(false);
});

it('a logged-out user still opens the app', () =>
  expect(shouldAutoOpen({ ...base, walletStatus: 'disconnected' })).toBe(true));

it('never opens a locked or undecided app', () => {
  expect(shouldAutoOpen({ ...base, decision: 'locked' })).toBe(false);
  expect(shouldAutoOpen({ ...base, decision: 'wait' })).toBe(false);
});

it('only for widget links', () => expect(shouldAutoOpen({ ...base, openParam: undefined })).toBe(false));

it('stops waiting for a wallet that never reports back', () =>
  expect(shouldAutoOpen({ ...base, walletStatus: 'unknown', timedOut: true })).toBe(true));
