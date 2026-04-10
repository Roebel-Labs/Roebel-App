/**
 * Per-screen option helpers for the package's native-stack.
 *
 * The root navigator uses the platform-native push animation by default (iOS slide,
 * Android slide-and-fade). Screens that want richer cross-platform behavior — shared
 * elements, drag-to-dismiss, snap-point sheets — opt in by spreading one of these
 * helpers into their `<Stack.Screen options>` (or the parent layout's `Stack.Screen`).
 *
 * All helpers set `enableTransitions: true` which, per the native-stack typing, forces
 * `headerShown: false` and `presentation: 'containedTransparentModal'` so the custom
 * transition can run over the previous screen.
 */
import Transition from 'react-native-screen-transitions';
import type { NativeStackNavigationOptions } from 'react-native-screen-transitions/native-stack';

/**
 * Drag-down to dismiss, no hero image morph. Use for detail screens that don't have
 * an obvious thumbnail → hero pairing in the origin card. Combines the package's
 * `SlideFromBottom` entrance with a bidirectional dismiss gesture.
 */
export const dismissibleDetail = (): NativeStackNavigationOptions =>
  ({
    enableTransitions: true,
    ...Transition.Presets.SlideFromBottom(),
    gestureDirection: 'vertical',
    gestureActivationArea: 'screen',
    gestureVelocityImpact: 0.5,
  }) as NativeStackNavigationOptions;

/**
 * Shared-element hero image transition (Instagram-style). The origin card and the
 * destination hero image must both carry the same `sharedBoundTag`. Includes
 * drag-to-dismiss in any direction.
 *
 * @param sharedBoundTag - must uniquely identify the pair (e.g. `event-image-${id}`).
 */
export const sharedImageDetail = (
  sharedBoundTag: string,
): NativeStackNavigationOptions =>
  ({
    enableTransitions: true,
    ...Transition.Presets.SharedIGImage({ sharedBoundTag }),
  }) as NativeStackNavigationOptions;

/**
 * Disable both the default push animation and the back gesture. Use for full-screen
 * immersive screens (e.g. games) where a transition or accidental back swipe would
 * interrupt the user.
 */
export const noTransition = (): NativeStackNavigationOptions => ({
  animation: 'none',
  gestureEnabled: false,
});
