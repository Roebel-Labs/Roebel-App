/**
 * The lock note on a locked mini app: the reason, and the way in when there is one.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { MiniApp } from '@/lib/miniapps';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: { surfaceSecondary: '#eee', textPrimary: '#000', textSecondary: '#666', primary: '#00498B', border: '#ddd' },
  }),
}));
jest.mock('@/components/miniapp/hostIcons', () => ({ LockIcon: () => null }));

import MiniAppLockNote from '../MiniAppLockNote';

const app = (over: Partial<MiniApp>): MiniApp =>
  ({
    id: 'a', slug: 'a', name: 'A', iconUrl: null, homeUrl: 'https://a.example', description: null,
    category: 'utility', tags: [], screenshots: [], permissions: [], primaryColor: '#00498B', featured: false,
    featureImageUrl: null, createdAt: '', authorName: null, manifestVersion: 2, identity: null, contracts: [],
    audience: null, orgAccountId: null, orgName: null, ...over,
  }) as MiniApp;

const texts = (r: ReactTestRenderer): string[] =>
  r.root
    .findAll((n) => typeof n.type === 'string' && n.props && typeof n.props.children !== 'undefined')
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string');

async function render(a: MiniApp) {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<MiniAppLockNote app={a} />);
  });
  return r;
}

beforeEach(() => mockPush.mockClear());

it('shows the reason and the way in', async () => {
  const r = await render(app({ audience: { mode: 'required', anyOf: ['citizen'] } }));
  const t = texts(r);
  expect(t).toContain('Für Bürger:innen.');
  expect(t).toContain('Bürger:in werden');
  const link = r.root.find((n) => n.props?.accessibilityLabel === 'Bürger:in werden' && typeof n.props.onPress === 'function');
  act(() => link.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/citizen-verification');
});

it('shows no link when there is no way in', async () => {
  const r = await render(app({ audience: { mode: 'required', anyOf: ['org:3f2504e0-4f89-41d3-9a0c-0305e82c3301'] } }));
  expect(texts(r)).toContain('Für Mitglieder.');
  expect(r.root.findAll((n) => typeof n.props?.onPress === 'function')).toHaveLength(0);
});
