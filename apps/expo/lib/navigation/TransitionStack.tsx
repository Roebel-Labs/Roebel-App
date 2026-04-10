/**
 * Expo-router-compatible blank stack navigator from `react-native-screen-transitions`.
 *
 * The blank stack is a pure JS/Reanimated/Gesture Handler stack that gives us full
 * control over transition animations on both iOS and Android. We hoist it through
 * `withLayoutContext` so that `app/_layout.tsx` can use it exactly like expo-router's
 * built-in `Stack` (file-based routing still works).
 *
 * Note: the blank stack has no built-in header. Screens that previously relied on
 * `headerShown: true` from the default expo-router Stack must render their own header
 * (see `app/submit.tsx`).
 */
import { withLayoutContext } from 'expo-router';
import type {
  ParamListBase,
  StackNavigationState,
} from '@react-navigation/native';
import {
  createBlankStackNavigator,
  type BlankStackNavigationEventMap,
  type BlankStackNavigationOptions,
} from 'react-native-screen-transitions/blank-stack';

const { Navigator } = createBlankStackNavigator();

export const TransitionStack = withLayoutContext<
  BlankStackNavigationOptions,
  typeof Navigator,
  StackNavigationState<ParamListBase>,
  BlankStackNavigationEventMap
>(Navigator);
