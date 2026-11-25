/**
 * The stamp moment (spec 5.6b): plays once on mount, the haptic fires once at impact and only for
 * success; with reduced motion nothing moves but the haptic still fires.
 */
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

let mockReduced = false;
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text },
    Easing: new Proxy({}, { get: () => (x: any) => x ?? ((t: number) => t) }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useReducedMotion: () => mockReduced,
    useSharedValue: (v: number) => ({ value: v }),
    withTiming: (v: number) => v,
    withDelay: (_d: number, v: number) => v,
    FadeInDown: { delay: () => ({ duration: () => ({}) }) },
  };
});
jest.mock('../CardReveal', () => {
  const { View } = require('react-native');
  return { __esModule: true, REVEAL_DONE_MS: 2100, default: () => <View testID="card-reveal" /> };
});
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (p: any) => <View {...p} /> };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: (p: any) => <View {...p} />, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/context/ThemeContext', () => {
  const { colors } = require('@/constants/theme');
  return { useTheme: () => ({ colors: colors.light, isDark: false }) };
});

import * as Haptics from 'expo-haptics';
import StampMoment from '../StampMoment';
import { STAMP_TIMING, stampDropY, stampScale } from '@/lib/credreg/motion';

const stamp = { imageUrl: null, title: 'Dabei: Sommerfest', subtitle: '5. Dezember 2026', state: 'collected' as const, size: 'hero' as const };

function render(tone: 'success' | 'info' | 'warning') {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StampMoment stamp={stamp} headline="Abzeichen erhalten" lines={['Sommerfest']} muenzen={null} actions={[]} tone={tone} />);
  });
  return tree;
}

const hasTransform = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.type === 'string' && !!StyleSheet.flatten(n.props.style)?.transform).length > 0;

describe('StampMoment', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (Haptics.notificationAsync as jest.Mock).mockClear();
    mockReduced = false;
  });
  afterEach(() => jest.useRealTimers());

  it('plays once and fires the haptic once on impact', () => {
    const tree = render('success');
    expect(hasTransform(tree)).toBe(true);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(STAMP_TIMING.dropMs);
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    act(() => {
      tree.update(<StampMoment stamp={stamp} headline="Abzeichen erhalten" lines={['Sommerfest', 'neu']} muenzen={5} actions={[]} tone="success" />);
      jest.advanceTimersByTime(5000);
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    const headline = tree.root.find((n) => n.props.accessibilityLiveRegion === 'polite');
    expect(headline.props.children).toBe('Abzeichen erhalten');
  });

  it('with reduced motion: no transform in the style and the haptic still fires', () => {
    mockReduced = true;
    const tree = render('success');
    expect(hasTransform(tree)).toBe(false);
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    const texts = tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n) => n.props.children);
    expect(texts).toContain('Abzeichen erhalten');
    expect(texts).toContain('Sommerfest');
  });

  it('warning tone fires no haptic', () => {
    render('warning');
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('stampDropY and stampScale start and end where specified', () => {
    expect(stampDropY(0)).toBe(-120);
    expect(stampScale(0)).toBe(1.25);
    expect(stampDropY(1)).toBe(0);
    expect(stampScale(1)).toBe(1);
    // A slight overshoot after impact: somewhere between impact and rest the card is below 0.
    const samples = Array.from({ length: 21 }, (_, k) => stampDropY(0.5 + k * 0.025));
    expect(Math.max(...samples)).toBeGreaterThan(0);
  });
});

describe('received badge with art', () => {
  it('opens like a card pack instead of the stamp drop, and the stamp haptic stays silent', () => {
    (Haptics.notificationAsync as jest.Mock).mockClear();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <StampMoment stamp={{ ...stamp, imageUrl: 'https://example.org/badge.png' }} headline="Abzeichen erhalten" lines={['Infoabend']} muenzen={null} actions={[]} tone="success" />,
      );
    });
    expect(tree.root.findAllByProps({ testID: 'card-reveal' }).length).toBeGreaterThan(0);
    act(() => {
      jest.advanceTimersByTime?.(5000);
    });
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
