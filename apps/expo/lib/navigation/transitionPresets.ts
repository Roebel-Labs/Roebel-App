/**
 * Shared transition presets for the root blank stack.
 *
 * The `react-native-screen-transitions` package ships vertical / zoom / shared-element
 * presets but no horizontal push, so we build a SlideFromRight interpolator here and
 * reuse it across the app. All timing and gesture values live in this file so
 * cross-platform parity can be tuned in one place.
 */
import { interpolate, type WithSpringConfig } from 'react-native-reanimated';
import type { BlankStackNavigationOptions } from 'react-native-screen-transitions/blank-stack';

/**
 * Spring config for the default push/pop. Tuned to feel like an iOS native-stack
 * slide on both iOS and Android (~320 ms push, snappier close).
 */
export const pushSpring: WithSpringConfig = {
  mass: 1,
  damping: 30,
  stiffness: 240,
};

export const popSpring: WithSpringConfig = {
  mass: 1,
  damping: 32,
  stiffness: 280,
};

/**
 * Default horizontal slide-from-right, with iOS-style parallax on the screen
 * being covered. Progress values:
 *  - 0: incoming screen sits off-screen right
 *  - 1: centered / visible
 *  - 2: covered by a newer screen pushed on top (nudged 30% to the left)
 */
export const slideFromRight = (): BlankStackNavigationOptions => ({
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  // Edge-only back swipe on the left side — matches iOS native stack behavior
  // on both platforms and avoids conflicts with in-screen horizontal carousels.
  gestureActivationArea: { left: 'edge' },
  gestureVelocityImpact: 0.4,
  screenStyleInterpolator: ({ progress, layouts: { screen } }) => {
    'worklet';
    const translateX = interpolate(
      progress,
      [0, 1, 2],
      [screen.width, 0, -screen.width * 0.3],
    );
    return {
      contentStyle: {
        transform: [{ translateX }],
      },
    };
  },
  transitionSpec: {
    open: pushSpring,
    close: popSpring,
  },
});

/**
 * No animation, no gestures. Used for screens that take over the whole display
 * (e.g. full-screen games) where we don't want a transition or accidental
 * back-gesture interfering with gameplay.
 */
export const noTransition = (): BlankStackNavigationOptions => ({
  gestureEnabled: false,
  screenStyleInterpolator: () => {
    'worklet';
    return { contentStyle: {} };
  },
});
