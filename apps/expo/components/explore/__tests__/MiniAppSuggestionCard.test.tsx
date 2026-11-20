/**
 * The Erkunden suggestion card: "Übernehmen" accepts, "Nicht jetzt" dismisses.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MiniApp } from '@/lib/miniapps';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: { surface: '#fff', borderSecondary: '#ddd', textPrimary: '#000', primary: '#00498B', onPrimary: '#fff' },
  }),
}));

import MiniAppSuggestionCard from '../MiniAppSuggestionCard';

const app = { slug: 'verein', name: 'Vereinsapp' } as MiniApp;

const pressLabel = (r: ReactTestRenderer, label: string) => {
  const text = r.root.findAll((n) => n.type === Text && n.props.children === label)[0];
  let node: any = text;
  while (node && typeof node.props?.onPress !== 'function') node = node.parent;
  act(() => node.props.onPress());
};

it('Übernehmen calls onAccept, Nicht jetzt calls onDismiss', () => {
  const onAccept = jest.fn();
  const onDismiss = jest.fn();
  let r!: ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<MiniAppSuggestionCard app={app} onAccept={onAccept} onDismiss={onDismiss} />);
  });
  expect(r.root.findAll((n) => n.type === Text && n.props.children === 'Passt zu dir: Vereinsapp. Auf deine Startseite legen?')).toHaveLength(1);
  pressLabel(r, 'Übernehmen');
  expect(onAccept).toHaveBeenCalledTimes(1);
  expect(onDismiss).not.toHaveBeenCalled();
  pressLabel(r, 'Nicht jetzt');
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
