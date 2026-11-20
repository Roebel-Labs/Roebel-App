/**
 * Whether a mini app may be opened here and now: apps without a required audience open at once;
 * a required app waits for the credentials, then opens or locks.
 */
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import type { MiniApp } from '../miniapps';
import { openDecision } from '../miniapp-open';

const base = { audience: null } as Pick<MiniApp, 'audience'>;
const plain = base;
const citizensOnly: Pick<MiniApp, 'audience'> = { audience: { mode: 'required', anyOf: ['citizen'] } };
const citizensRecommended: Pick<MiniApp, 'audience'> = { audience: { mode: 'recommended', anyOf: ['citizen'] } };

it('an app without an audience opens at once', () => expect(openDecision(plain, [], false)).toBe('open'));

it('a recommended audience never waits or locks', () => {
  expect(openDecision(citizensRecommended, [], false)).toBe('open');
  expect(openDecision(citizensRecommended, [{ type: 'guest' }], true)).toBe('open');
});

it('a required app waits for the credentials, then locks or opens', () => {
  expect(openDecision(citizensOnly, [], false)).toBe('wait');
  expect(openDecision(citizensOnly, [{ type: 'guest' }], true)).toBe('locked'); // Review Focus 2
  expect(openDecision(citizensOnly, [{ type: 'citizen' }], true)).toBe('open');
});

it('a match already held opens without waiting', () => {
  expect(openDecision(citizensOnly, [{ type: 'citizen' }], false)).toBe('open');
});
