import React from 'react';
import { Stack } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/context/ThemeContext';
import { NATIVE_TABS } from '@/lib/navigation/tabBar';

/**
 * The three main sections: Austausch (`/`), Erkunden (`/explore`), Profil
 * (`/profile`). The group name is invisible in URLs, so every existing link
 * and deep link keeps working.
 *
 * iOS: the system tab bar. On iOS 26+ that is the floating Liquid Glass pill
 * that shrinks while scrolling down; below iOS 26 the classic blurred bar.
 * Each tab keeps its state and scroll position, and tapping the active tab
 * scrolls to the top — all of it system behaviour, none of it drawn by us.
 * Uses only what is already compiled into the app (react-native-screens), so
 * it can ship as an update without a new store build.
 *
 * Android and web: a stack with instant cuts, and every section draws the
 * bar itself (components/BottomNavigation.tsx) — the behaviour from before
 * this group existed, unchanged.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  if (!NATIVE_TABS) {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          gestureEnabled: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    );
  }

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      tintColor={colors.primary}
    >
      {/* disableAutomaticContentInsets: the sections lay out their own safe
          areas (custom headers, floating buttons), so the system must not add
          scroll insets on top of that. */}
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Austausch</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: 'safari', selected: 'safari.fill' }} />
        <NativeTabs.Trigger.Label>Erkunden</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
