/**
 * The store screen with audiences: a person without credentials or orgs sees it as before;
 * "Für dich" and "Meine Vereine" appear only when they have something; a locked app stays
 * listed as "Gesperrt" and opens its detail page, never the host.
 *
 * Lives under components/ (not app/__tests__) so expo-router never turns it into a route.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { MiniApp } from '@/lib/miniapps';
import type { MatchCredential } from '@/lib/miniapp-credentials';

const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const mockPush = jest.fn();
let mockApps: MiniApp[] = [];
let mockHeld: MatchCredential[] = [];
let mockOwned: { id: string; account_type: string }[] = [];
let mockInstalled: string[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/miniapps', () => ({ fetchLiveMiniApps: () => Promise.resolve(mockApps) }));
jest.mock('@/lib/miniapp-installs', () => ({
  useInstalledMiniApps: () => ({ isInstalled: (s: string) => mockInstalled.includes(s) }),
}));
jest.mock('@/lib/miniapp-credentials', () => ({ useMatchCredentials: () => ({ held: mockHeld, ready: true }) }));
jest.mock('@/context/AccountContext', () => ({ useAccount: () => ({ ownedAccounts: mockOwned }) }));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#fff', surfaceSecondary: '#eee', textPrimary: '#000', textSecondary: '#666',
      primary: '#00498B', onPrimary: '#fff', border: '#ddd', borderSecondary: '#ddd',
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@/components/miniapp/hostIcons', () => ({
  ChevronLeft: () => null, InfoIcon: () => null, LockIcon: () => null,
}));
jest.mock('@/components/miniapp/MiniAppSkeleton', () => () => null);
const mockHost = jest.fn((_p: unknown) => null);
jest.mock('@/components/miniapp/MiniAppHost', () => (p: unknown) => mockHost(p));
jest.mock('@/hooks/useGoBack', () => ({ useGoBack: () => () => {} }));
jest.mock('@/lib/miniapp-categories', () => ({ CATEGORY_LABELS: { utility: 'Werkzeuge' } }));

import MiniAppsStoreScreen from '@/app/mini-apps';

const app = (slug: string, over: Partial<MiniApp> = {}): MiniApp =>
  ({
    id: slug, slug, name: `App ${slug}`, iconUrl: null, homeUrl: `https://${slug}.example`, description: `Über ${slug}`,
    category: 'utility', tags: [], screenshots: [], permissions: [], primaryColor: '#00498B', featured: false,
    featureImageUrl: null, createdAt: '', authorName: null, manifestVersion: 2, identity: null, contracts: [],
    audience: null, orgAccountId: null, orgName: null, ...over,
  }) as MiniApp;

const texts = (r: ReactTestRenderer): string[] =>
  r.root
    .findAll((n) => typeof n.type === 'string' && n.props && typeof n.props.children !== 'undefined')
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string');

async function render() {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<MiniAppsStoreScreen />);
  });
  return r;
}

beforeEach(() => {
  mockPush.mockClear();
  mockHost.mockClear();
  mockHeld = [];
  mockOwned = [];
  mockInstalled = [];
  mockApps = [
    app('plain'),
    app('buerger', { audience: { mode: 'required', anyOf: ['citizen'] } }),
    app('verein', { orgAccountId: ORG, orgName: 'PSV Röbel' }),
  ];
});

it('shows no Für dich rail and no filter for a person without credentials or orgs', async () => {
  mockApps = [app('plain'), app('other')];
  const r = await render();
  const t = texts(r);
  expect(t).not.toContain('Für dich');
  expect(t).not.toContain('Meine Vereine');
  expect(t).toContain('Top-Apps');
  expect(t).not.toContain('Gesperrt');
});

it('shows Für dich with the matching app for a citizen', async () => {
  mockHeld = [{ type: 'citizen' }];
  const r = await render();
  const t = texts(r);
  expect(t).toContain('Für dich');
  expect(t).not.toContain('Gesperrt');
  const rail = r.root.find((n) => n.props?.testID === 'miniapps-for-you');
  const names = rail.findAll((n) => typeof n.type === 'string' && n.props?.children === 'App buerger');
  expect(names.length).toBeGreaterThan(0);
});

it('marks a locked app as Gesperrt and opens its detail page, not the host', async () => {
  mockHeld = [{ type: 'guest' }];
  mockInstalled = ['buerger'];
  const r = await render();
  expect(texts(r)).toContain('Gesperrt');
  const [row] = r.root.findAll((n) => n.props?.accessibilityLabel === 'App buerger' && typeof n.props.onPress === 'function');
  await act(async () => row.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/mini-app/buerger');
  expect(mockHost).not.toHaveBeenCalled();
});

it('Meine Vereine filters the lists to the apps of my orgs', async () => {
  mockOwned = [{ id: ORG, account_type: 'organisation' }];
  const r = await render();
  const chip = r.root.find((n) => n.props?.accessibilityLabel === 'Meine Vereine' && typeof n.props.onPress === 'function');
  await act(async () => chip.props.onPress());
  const t = texts(r);
  expect(t).toContain('App verein');
  expect(t).not.toContain('App plain');
});
