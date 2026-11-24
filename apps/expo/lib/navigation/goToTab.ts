/**
 * Switch between the main sections (Austausch, Erkunden, Dashboard, Chat, Profil — which ones
 * the bar shows depends on the active account, see shell-tabs.ts).
 *
 * The sections live in one kept-alive tab group (app/(tabs)/_layout.tsx), so a switch never
 * re-creates a screen:
 *
 *   - From one section to another: a plain tab switch (`navigate`) — the target is already
 *     mounted (or mounts once) and is simply revealed.
 *   - From anywhere else (a detail page with its own bottom bar): pop back to the tab group and
 *     select the section there (`dismissTo`), so the stack never grows.
 */
import { router } from 'expo-router';

export type MainTab = 'home' | 'explore' | 'dashboard' | 'chat' | 'profile';

const TAB_PATH: Record<MainTab, '/' | '/explore' | '/dashboard' | '/chat-tab' | '/profile'> = {
  home: '/',
  explore: '/explore',
  dashboard: '/dashboard',
  chat: '/chat-tab',
  profile: '/profile',
};

const SECTION_PATHS = new Set<string>(Object.values(TAB_PATH));

/** Pure: which router call a tab switch needs, given the current pathname. */
export function tabSwitchAction(tab: MainTab, pathname: string): 'none' | 'switch' | 'dismissTo' {
  if (pathname === TAB_PATH[tab]) return 'none';
  return SECTION_PATHS.has(pathname) ? 'switch' : 'dismissTo';
}

type ArrivalListener = (tab: MainTab) => void;
const arrivalListeners = new Set<ArrivalListener>();

/**
 * Screens listen for "a tab switch is about to land on me" (ScreenTransition): a section revealed
 * by the bottom nav shows instantly, without the blur → sharp beat a return from a detail page gets.
 */
export function onTabArrival(listener: ArrivalListener): () => void {
  arrivalListeners.add(listener);
  return () => {
    arrivalListeners.delete(listener);
  };
}

export function goToTab(tab: MainTab, pathname: string): void {
  const action = tabSwitchAction(tab, pathname);
  if (action === 'none') return;
  arrivalListeners.forEach((l) => l(tab));
  if (action === 'switch') router.navigate(TAB_PATH[tab]);
  // Pops to the tab group when it is in the stack (and selects the section), else replaces.
  else router.dismissTo(TAB_PATH[tab]);
}
