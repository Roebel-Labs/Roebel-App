import { MAX_TARGETS, parseFollowPayload, parseTargetPayload, followNotice } from '../../supabase/functions/account-relations/core';

const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';

describe('account-relations core', () => {
  it('accepts a deduped uuid list and a known source', () => {
    expect(parseFollowPayload({ targets: [U, U.toUpperCase(), V], source: 'onboarding' }))
      .toEqual({ ok: true, targets: [U, V], source: 'onboarding' });
  });
  it('rejects bad sources, non-uuids, empty and oversized lists', () => {
    expect(parseFollowPayload({ targets: [U], source: 'x' }).ok).toBe(false);
    expect(parseFollowPayload({ targets: ['nope'], source: 'manual' }).ok).toBe(false);
    expect(parseFollowPayload({ targets: [], source: 'manual' }).ok).toBe(false);
    const many = Array.from({ length: MAX_TARGETS + 1 }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
    expect(parseFollowPayload({ targets: many, source: 'manual' }).ok).toBe(false);
  });
  it('parses a single mute target', () => {
    expect(parseTargetPayload({ target: U })).toEqual({ ok: true, target: U });
    expect(parseTargetPayload({}).ok).toBe(false);
  });
  it('builds the German notice copy per source and target kind', () => {
    expect(followNotice({ followerName: 'Anna', source: 'onboarding', orgName: null }))
      .toEqual({ title: 'Neu in Röbel: Anna folgt dir', body: 'Sag doch Hallo!' });
    expect(followNotice({ followerName: 'Anna', source: 'manual', orgName: null }))
      .toEqual({ title: 'Anna folgt dir jetzt', body: '' });
    expect(followNotice({ followerName: 'Anna', source: 'intro', orgName: 'Angelverein' }))
      .toEqual({ title: 'Anna folgt jetzt Angelverein', body: '' });
  });
});
