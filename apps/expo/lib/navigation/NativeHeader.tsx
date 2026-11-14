import React, { type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import type { Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

/**
 * iOS draws the navigation bar of pushed screens itself (UINavigationBar):
 * system back chevron with the edge swipe, centred title, and on iOS 26+ the
 * Liquid Glass back button and scroll-edge effect. Android and web keep the
 * hand-drawn header row each screen already has.
 */
export const NATIVE_HEADER = Platform.OS === 'ios';

/**
 * Safe-area edges for a screen that uses <NativeHeader>. With the system bar
 * the top inset belongs to the bar, so the screen must not pad it again.
 */
export function screenEdges(edges: readonly Edge[]): Edge[] {
  return NATIVE_HEADER ? edges.filter((e) => e !== 'top') : [...edges];
}

type Props = {
  title: string;
  /** Extra control on the right of the bar (iOS). */
  headerRight?: () => ReactNode;
  /** The screen's own header row, rendered on Android and web. */
  children: ReactNode;
};

export function NativeHeader({ title, headerRight, children }: Props) {
  const { colors } = useTheme();
  if (!NATIVE_HEADER) return <>{children}</>;
  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        // Chevron only: the screen below is the tab bar and has no title, so
        // iOS would otherwise print the English default "Back".
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.textPrimary,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fontFamily.semiBold, fontSize: 17, color: colors.textPrimary },
        headerShadowVisible: false,
        headerRight,
      }}
    />
  );
}
