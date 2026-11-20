/**
 * Erkunden suggestions: one fitting app, never locked / pinned / suggested before, a just
 * accepted org's app first, nothing for a person with nothing.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import type { MiniApp } from '../miniapps';
import { pickSuggestion } from '../miniapp-suggestions';

const ORG_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ORG_B = '9c1f0d2e-1111-4222-8333-944455556666';

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

const open = app('open');
const forCitizens = app('citizens', { audience: { mode: 'recommended', anyOf: ['citizen'] } });
const lockedForAttesters = app('attesters', { audience: { mode: 'required', anyOf: ['attester'] } });
const orgA = app('org-a', { orgAccountId: ORG_A, orgName: 'A' });
const orgB = app('org-b', { orgAccountId: ORG_B, orgName: 'B' });
const apps = [open, lockedForAttesters, forCitizens, orgA, orgB];
const citizen = [{ type: 'citizen' }];
const base = { apps, held: citizen, myOrgIds: [] as string[], pinned: [] as string[], alreadySuggested: [] as string[], queuedOrgIds: [] as string[] };

it('suggests an app that is for me and not pinned', () => {
  expect(pickSuggestion(base)?.slug).toBe('citizens');
});

it('never suggests a locked app, a pinned app or one suggested before', () => {
  expect(pickSuggestion({ ...base, pinned: ['citizens'] })).toBeNull();
  expect(pickSuggestion({ ...base, alreadySuggested: ['citizens'] })).toBeNull();
  expect(pickSuggestion({ ...base, apps: [lockedForAttesters] })).toBeNull();
  expect(pickSuggestion({ ...base, apps: [open] })).toBeNull();
});

it('prefers the app of an org whose credential was just accepted', () => {
  const p = { ...base, myOrgIds: [ORG_A, ORG_B] };
  expect(pickSuggestion(p)?.slug).toBe('citizens');
  expect(pickSuggestion({ ...p, queuedOrgIds: [ORG_B] })?.slug).toBe('org-b');
});

it('returns null for a person with nothing', () =>
  expect(pickSuggestion({ apps, held: [], myOrgIds: [], pinned: [], alreadySuggested: [], queuedOrgIds: [] })).toBeNull());
