/**
 * Expo-router-compatible native stack navigator from `react-native-screen-transitions`.
 *
 * This uses the package's NATIVE-STACK variant (not blank-stack), which:
 *   - Sits on top of `react-native-screens`, so push/pop is off-thread and matches
 *     native platform performance / reliability (no JS-stack blank-frame bugs).
 *   - Supports `headerShown`, `title`, etc. exactly like `@react-navigation/native-stack`.
 *   - Defaults to the platform-native push animation (iOS slide, Android slide-and-fade).
 *   - Lets individual screens opt into custom cross-platform transitions (shared elements,
 *     drag-to-dismiss, snap-point sheets) by setting `enableTransitions: true` and a
 *     `screenStyleInterpolator` / preset.
 *
 * Screens with `enableTransitions: true` implicitly get `headerShown: false` and
 * `presentation: 'containedTransparentModal'` so the custom animation can run over
 * the previous screen.
 */
import { withLayoutContext } from 'expo-router';
import type {
  ParamListBase,
  StackNavigationState,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationEventMap,
  type NativeStackNavigationOptions,
} from 'react-native-screen-transitions/native-stack';

const { Navigator } = createNativeStackNavigator();

export const TransitionStack = withLayoutContext<
  NativeStackNavigationOptions,
  typeof Navigator,
  StackNavigationState<ParamListBase>,
  NativeStackNavigationEventMap
>(Navigator);
