import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

// ThemeContext imports AsyncStorage, which has no native module under jest.
jest.mock('@/context/ThemeContext', () => {
  const { colors } = require('@/constants/theme');
  return { useTheme: () => ({ colors: colors.light, isDark: false }) };
});

jest.mock('@/components/PressableScale', () => {
  const { Pressable } = require('react-native');
  return { __esModule: true, default: Pressable };
});

import CredentialCardStack, { stackHeight } from '../profile/CredentialCardStack';

function labelsOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'image')
    .map((n) => n.props.accessibilityLabel);
}

describe('CredentialCardStack', () => {
  it('renders one card for a citizen', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CredentialCardStack kinds={['citizen']} onPress={() => {}} />);
    });
    expect(labelsOf(tree)).toEqual(['Bürgerausweis']);
  });

  it('renders citizen behind attester and reports the front card on press', () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CredentialCardStack kinds={['citizen', 'attester']} onPress={onPress} />);
    });
    expect(labelsOf(tree)).toEqual(['Bürgerausweis', 'Bescheiniger-Ausweis']);
    // The mocked Pressable's composite node carries onPress; its host View does not.
    const zone = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
    act(() => {
      zone.props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith('attester');
  });

  it('grows by one peek step per extra card', () => {
    expect(stackHeight(1)).toBe(64);
    expect(stackHeight(2)).toBe(108);
  });
});
