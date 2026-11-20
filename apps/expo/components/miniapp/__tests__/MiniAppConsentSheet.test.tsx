/**
 * The consent sheet a version-2 mini app gets on open: one switch per item, "Erlauben" reports
 * exactly the switched-on items, "Nicht jetzt" reports nothing.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Switch } from 'react-native';
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
jest.mock('@/components/miniapp/hostIcons', () => ({ CloseIcon: () => null }));

import MiniAppConsentSheet from '../MiniAppConsentSheet';

const items: ConsentItem[] = [
  { key: 'profile', title: 'Name und Bild', detail: 'Dein Anzeigename und dein Profilbild.', privateNote: false, defaultOn: true },
  { key: 'cred:citizen', title: 'Bürger', detail: 'Nur für Bürger.', privateNote: false, defaultOn: true },
  { key: 'cred:org:x', title: 'Mitglied · Verein', detail: 'Vereinsmitglieder.', privateNote: true, defaultOn: true },
];

const texts = (r: ReactTestRenderer): string[] =>
  r.root
    .findAll((n) => typeof n.type === 'string' && n.props && typeof n.props.children !== 'undefined')
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string');

const button = (r: ReactTestRenderer, label: string) =>
  r.root.find((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');

async function render(onAllow = jest.fn(), onLater = jest.fn()) {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <MiniAppConsentSheet visible appName="Demo" iconUrl={null} items={items} onAllow={onAllow} onLater={onLater} />,
    );
  });
  return { r, onAllow, onLater };
}

it('shows each item with its reason and the private note', async () => {
  const { r } = await render();
  const t = texts(r).join('|');
  expect(t).toContain('Demo möchte wissen');
  for (const i of items) {
    expect(t).toContain(i.title);
    expect(t).toContain(i.detail);
  }
  expect(t).toContain('Diese Mitgliedschaft ist privat. Die App erfährt nur, dass du Mitglied bist.');
  expect(t).toContain('Du kannst das jederzeit auf der Seite der Mini-App ändern.');
  expect(r.root.findAllByType(Switch)).toHaveLength(3);
});

it('Erlauben reports exactly the switched-on items', async () => {
  const { r, onAllow, onLater } = await render();
  const switches = r.root.findAllByType(Switch);
  await act(async () => {
    switches[1].props.onValueChange(false);
  });
  await act(async () => {
    button(r, 'Erlauben').props.onPress();
  });
  expect(onLater).not.toHaveBeenCalled();
  const on = onAllow.mock.calls[0][0] as Set<ConsentKey>;
  expect([...on].sort()).toEqual(['cred:org:x', 'profile']);
});

it('Nicht jetzt reports nothing granted', async () => {
  const { r, onAllow, onLater } = await render();
  await act(async () => {
    button(r, 'Nicht jetzt').props.onPress();
  });
  expect(onLater).toHaveBeenCalledTimes(1);
  expect(onAllow).not.toHaveBeenCalled();
});
