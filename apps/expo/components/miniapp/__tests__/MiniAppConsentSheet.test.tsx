/**
 * The standard connect dialog of every mini app: what the app will see as tappable checks,
 * "Verbinden" reports exactly the checked items, ✕ reports nothing, "Verbunden" replaces the button.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { ConsentKey } from '@netizen-labs/miniapp-sdk/host';
import type { ConsentItem } from '@/lib/miniapp-identity';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      card: '#fff', surfaceSecondary: '#eee', textPrimary: '#000', textSecondary: '#666',
      borderSecondary: '#ddd', primary: '#00498B',
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));
jest.mock('@/components/miniapp/hostIcons', () => ({ CloseIcon: () => null }));

import MiniAppConsentSheet from '../MiniAppConsentSheet';

const items: ConsentItem[] = [
  { key: 'profile', title: 'Name und Bild', detail: 'Dein Anzeigename und dein Profilbild.', privateNote: false, defaultOn: true },
  { key: 'cred:citizen', title: 'Bürger', detail: 'Nur für Bürger.', privateNote: false, defaultOn: true },
  { key: 'cred:org:x', title: 'Mitglied · Verein', detail: 'Vereinsmitglieder.', privateNote: true, defaultOn: true },
];

const texts = (r: ReactTestRenderer): string =>
  r.root
    .findAll((n) => typeof n.type === 'string' && n.props && typeof n.props.children !== 'undefined')
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string')
    .join('|');

const press = (r: ReactTestRenderer, label: string) =>
  r.root.find((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');

async function render(extra: Partial<React.ComponentProps<typeof MiniAppConsentSheet>> = {}) {
  const onAllow = jest.fn();
  const onLater = jest.fn();
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <MiniAppConsentSheet visible appName="Demo" iconUrl={null} items={items} onAllow={onAllow} onLater={onLater} {...extra} />,
    );
  });
  return { r, onAllow, onLater };
}

it('shows "Verbinden mit <App>", what the app sees and the private note', async () => {
  const { r } = await render();
  const t = texts(r);
  expect(t).toContain('Verbinden');
  expect(t).toContain('mit Demo');
  expect(t).toContain('Diese App sieht');
  for (const i of items) expect(t).toContain(i.title);
  expect(t).toContain('Diese Mitgliedschaft ist privat. Die App erfährt nur, dass du Mitglied bist.');
  expect(t).not.toMatch(/Wallet|NFT|Token/);
});

it('Verbinden reports exactly the checked items (a tap unchecks one)', async () => {
  const { r, onAllow, onLater } = await render();
  await act(async () => {
    press(r, 'Bürger').props.onPress();
  });
  await act(async () => {
    press(r, 'Verbinden').props.onPress();
  });
  expect(onLater).not.toHaveBeenCalled();
  expect([...(onAllow.mock.calls[0][0] as Set<ConsentKey>)].sort()).toEqual(['cred:org:x', 'profile']);
});

it('✕ closes without granting anything', async () => {
  const { r, onAllow, onLater } = await render();
  await act(async () => {
    press(r, 'Schließen').props.onPress();
  });
  expect(onLater).toHaveBeenCalledTimes(1);
  expect(onAllow).not.toHaveBeenCalled();
});

it('connected: "Verbunden" replaces the button and nothing can be changed', async () => {
  const { r } = await render({ connected: true });
  expect(texts(r)).toContain('Verbunden');
  expect(r.root.findAll((n) => n.props?.accessibilityLabel === 'Verbinden' && typeof n.props.onPress === 'function')).toHaveLength(0);
  expect(press(r, 'Bürger').props.disabled).toBe(true);
});
