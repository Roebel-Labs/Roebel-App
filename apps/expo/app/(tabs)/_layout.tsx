import React from 'react';
import { Tabs } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

/**
 * The main sections: Austausch (`/`), Erkunden (`/explore`), Dashboard (`/dashboard`), Chat
 * (`/chat-tab`), Profil (`/profile`). Which ones the bar shows depends on the active account
 * (lib/navigation/shell-tabs.ts). The group name is invisible in URLs, so every link keeps working.
 *
 * A tab navigator keeps each section MOUNTED once it has been opened (Max 2026-11-21: switching
 * felt slow). Before, the sections were plain stack routes: every switch to Erkunden / Profil
 * popped and re-created the screen (fetches, Skia cards, layout) and showed a skeleton each time.
 * Now the FIRST open of a section mounts it behind its matched skeleton (ScreenTransition), and
 * every later switch only reveals the screen that is already there. Hidden sections are frozen
 * (`freezeOnBlur`), so they cost nothing while out of sight.
 *
 * Deliberately no preloading: the first open of a section must always show its skeleton (Max).
 *
 * The system tab bar is hidden: every section draws components/BottomNavigation itself, which
 * switches via lib/navigation/goToTab.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={() => null}
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        animation: 'none',
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="chat-tab" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
