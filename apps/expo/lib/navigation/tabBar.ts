import { Platform } from 'react-native';
import { router, type Href } from 'expo-router';

/**
 * iOS runs the three main sections (Austausch, Erkunden, Profil) in the
 * system tab bar (UITabBarController via expo-router NativeTabs): the floating
 * Liquid Glass pill on iOS 26+, the classic blurred bar below that. Android
 * and web keep the hand-drawn bar from components/BottomNavigation.tsx and
 * switch between the sections as instant cuts in a stack, exactly as before.
 *
 * Everything that differs between the two worlds keys off this one flag.
 */
export const NATIVE_TABS = Platform.OS === 'ios';

/**
 * Height of the hand-drawn bottom bar (content only, without the safe-area
 * padding it adds itself). Zero with native tabs: there each tab sits in its
 * own safe-area provider, so `useSafeAreaInsets().bottom` inside a tab screen
 * already contains the system tab bar and no extra clearance is needed.
 */
export const BOTTOM_NAV_HEIGHT = NATIVE_TABS ? 0 : 72;

/**
 * Clearance for overlays that render ABOVE the navigator (root level), where
 * the safe-area inset does not know about the system tab bar.
 */
export const ROOT_TAB_BAR_CLEARANCE = NATIVE_TABS ? 56 : BOTTOM_NAV_HEIGHT;

export type MainTab = 'home' | 'explore' | 'profile';

const TAB_HREF: Record<MainTab, Href> = {
  home: '/',
  explore: '/explore',
  profile: '/profile',
};

/**
 * Leave the current screen for one of the three main sections.
 *
 * `legacy` is the call the site made before native tabs existed and is still
 * what runs on Android and web, unchanged. With native tabs a plain
 * `router.replace('/profile')` from a pushed screen would put a SECOND tab
 * controller on the stack (the route is `(tabs)`, and replace creates a new
 * instance of it). So there we pop back to the one that exists and let it
 * switch tabs; from inside the tabs, replace is a plain tab switch.
 */
export function goToTab(tab: MainTab, legacy: 'replace' | 'push' = 'replace') {
  const href = TAB_HREF[tab];
  if (!NATIVE_TABS) {
    if (legacy === 'push') router.push(href);
    else router.replace(href);
    return;
  }
  if (router.canDismiss()) router.dismissTo(href);
  else router.replace(href);
}
