/**
 * Root stack navigator. Since SDK 56 this is expo-router's own Stack:
 * the router was decoupled from React Navigation (it now runs on the
 * `standard-navigation` fork), so the previous navigator built from
 * `react-native-screen-transitions/native-stack` (a react-navigation
 * native-stack wrapper) can no longer register — on device it threw
 * "Couldn't register the navigator" at boot and the app landed on
 * +not-found (first SDK 56 build, d95566d2).
 *
 * Nothing in the app used the package's custom transitions
 * (enableTransitions / screenStyleInterpolator had zero consumers), so
 * this swap is behavior-neutral: all options in use (headerShown, title,
 * animation, presentation, gestureEnabled) are plain native-stack options
 * that expo-router's Stack accepts unchanged. If shared-element /
 * drag-to-dismiss transitions come back, wait for
 * react-native-screen-transitions to support the standard-navigation
 * router before reintroducing a custom navigator here.
 */
import { Stack } from 'expo-router';

export const TransitionStack = Stack;
