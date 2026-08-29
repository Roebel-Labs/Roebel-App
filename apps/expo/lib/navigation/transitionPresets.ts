/**
 * Per-screen option helpers for the root stack.
 *
 * SDK 56: the root navigator is expo-router's own Stack (see
 * TransitionStack.tsx) — the react-native-screen-transitions helpers that
 * used to live here (dismissibleDetail, sharedImageDetail) had no
 * consumers and depended on a react-navigation-based navigator the SDK 56
 * router can no longer host, so they are gone. Reintroduce them only once
 * react-native-screen-transitions supports the standard-navigation router.
 */
import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';

type StackScreenOptions = ComponentProps<typeof Stack.Screen>['options'];

/**
 * Disable both the default push animation and the back gesture. Use for full-screen
 * immersive screens (e.g. games) where a transition or accidental back swipe would
 * interrupt the user, and for the pseudo-tab routes that must switch as instant cuts.
 */
export const noTransition = (): StackScreenOptions => ({
  animation: 'none',
  gestureEnabled: false,
});
