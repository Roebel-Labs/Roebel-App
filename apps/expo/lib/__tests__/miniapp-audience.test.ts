/**
 * On-device audience matching: open / match / locked, "Für dich", "Meine Vereine" and the
 * lock text. Pure — no network, no tracking.
 */
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import type { MiniApp } from '../miniapps';
import { audienceState, forYou, isForYou, lockInfo, myOrgApps } from '../miniapp-audience';

const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER = '9c1f0d2e-1111-4222-8333-944455556666';
const T = 'type:0x' + 'a1'.repeat(32);
const A_ORG = { mode: 'required' as const, anyOf: ['org:' + ORG] };
const A_CIT = { mode: 'required' as const, anyOf: ['citizen'] };

const app = (slug: string, over: Partial<MiniApp> = {}): MiniApp => ({
  id: slug,
  slug,
  name: slug,
  iconUrl: null,
  homeUrl: `https://${slug}.example`,
  description: null,
  category: 'utility',
  tags: [],
  screenshots: [],
  permissions: [],
  primaryColor: '#00498B',
  featured: false,
  featureImageUrl: null,
  createdAt: '',
  authorName: null,
  manifestVersion: 2,
  identity: null,
  contracts: [],
  audience: null,
  orgAccountId: null,
  orgName: null,
  ...over,
});

const plain = app('plain');
const citizensOnly = app('buerger', { audience: A_CIT });
const forCitizens = app('empfohlen', { audience: { mode: 'recommended', anyOf: ['citizen'] } });
const psv = app('psv', { orgAccountId: ORG, orgName: 'PSV Röbel' });
const unconfirmed = app('fremd', { orgAccountId: null, orgName: null });
const apps = [plain, citizensOnly, forCitizens, psv, unconfirmed];

describe('audienceState', () => {
  it('no audience is open', () => expect(audienceState({ audience: null }, [])).toBe('open'));
  it('a required audience locks who does not match', () =>
    expect(audienceState({ audience: A_CIT }, [{ type: 'guest' }])).toBe('locked'));
  it('a required audience locks a signed-out person', () => expect(audienceState({ audience: A_CIT }, [])).toBe('locked'));
  it('a recommended audience never locks', () =>
    expect(audienceState({ audience: { mode: 'recommended', anyOf: ['citizen'] } }, [{ type: 'guest' }])).toBe('open'));
  it('a match is a match in both modes', () => {
    expect(audienceState({ audience: A_CIT }, [{ type: 'citizen' }])).toBe('match');
    expect(audienceState({ audience: { mode: 'recommended', anyOf: ['citizen'] } }, [{ type: 'citizen' }])).toBe('match');
  });
  it('an org pattern matches a held type of that org', () =>
    expect(audienceState({ audience: A_ORG }, [{ type: T, org: ORG }])).toBe('match'));
  it('and not a type of another org', () =>
    expect(audienceState({ audience: A_ORG }, [{ type: T, org: OTHER }])).toBe('locked'));
  it('a type pattern matches that type', () =>
    expect(audienceState({ audience: { mode: 'required', anyOf: [T] } }, [{ type: T }])).toBe('match'));
});

describe('forYou / myOrgApps', () => {
  it('nothing is for you when you hold nothing and belong nowhere', () => expect(forYou(apps, [], [])).toEqual([]));
  it('a guest gets nothing either', () => expect(forYou(apps, [{ type: 'guest' }], [])).toEqual([]));
  it('a citizen gets the citizen apps, order kept', () =>
    expect(forYou(apps, [{ type: 'citizen' }], []).map((a) => a.slug)).toEqual(['buerger', 'empfohlen']));
  it('an app of my org is for me even without an audience', () => {
    expect(isForYou(psv, [], [ORG])).toBe(true);
    expect(forYou(apps, [], [ORG.toUpperCase()]).map((a) => a.slug)).toEqual(['psv']);
  });
  it('an app whose org did not confirm is not', () => {
    expect(isForYou(unconfirmed, [], [ORG])).toBe(false);
    expect(myOrgApps(apps, [ORG]).map((a) => a.slug)).toEqual(['psv']);
  });
  it('no orgs, no org apps', () => expect(myOrgApps(apps, [])).toEqual([]));
});

describe('lockInfo', () => {
  it('the lock text names the org only when it confirmed', () => {
    expect(lockInfo({ audience: A_ORG, orgAccountId: null, orgName: null })).toEqual({ text: 'Für Mitglieder.' });
    expect(lockInfo({ audience: A_ORG, orgAccountId: ORG, orgName: 'PSV Röbel' })).toEqual({
      text: 'Für Mitglieder von PSV Röbel.',
      cta: { label: 'Mitglied werden', href: `/account/${ORG}` },
    });
  });
  it('a confirmed org without a name still gets no name', () =>
    expect(lockInfo({ audience: A_ORG, orgAccountId: ORG, orgName: null })).toEqual({
      text: 'Für Mitglieder.',
      cta: { label: 'Mitglied werden', href: `/account/${ORG}` },
    }));
  it('citizens-only points to becoming a citizen', () =>
    expect(lockInfo({ audience: A_CIT, orgAccountId: null, orgName: null })).toEqual({
      text: 'Für Bürger:innen.',
      cta: { label: 'Bürger:in werden', href: '/citizen-verification' },
    }));
  it('attesters and guests', () => {
    expect(lockInfo({ audience: { mode: 'required', anyOf: ['attester'] }, orgAccountId: null, orgName: null })).toEqual({
      text: 'Für Bescheiniger:innen.',
    });
    expect(lockInfo({ audience: { mode: 'required', anyOf: ['guest'] }, orgAccountId: null, orgName: null })).toEqual({
      text: 'Für Gäste.',
    });
  });
  it('a type reference reads like a membership', () =>
    expect(lockInfo({ audience: { mode: 'required', anyOf: [T] }, orgAccountId: null, orgName: null })).toEqual({
      text: 'Für Mitglieder.',
    }));
});
