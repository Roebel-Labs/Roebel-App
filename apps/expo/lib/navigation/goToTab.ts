/**
 * Switch between the three main sections (Austausch, Erkunden, Profil).
 *
 * There is no tab navigator — the sections are routes on the root stack.
 * Pushing a section on every tap grew the stack without bound (Austausch →
 * Erkunden → Profil → Erkunden … all mounted, all re-rendering), and
 * `replace('/')` rebuilt the heavy feed each time. The rules here keep the
 * stack at "Austausch + at most one other section (+ whatever was open)":
 *
 *   - Austausch is the root and stays mounted: going home pops back to it.
 *   - From Austausch, Erkunden/Profil are pushed on top.
 *   - Elsewhere, a section already in the stack is popped back to; if it is
 *     not there, it replaces the current screen.
 */
import { router } from 'expo-router';

export type MainTab = 'home' | 'explore' | 'profile';

const TAB_PATH: Record<MainTab, '/' | '/explore' | '/profile'> = {
  home: '/',
  explore: '/explore',
  profile: '/profile',
};

/** Pure: which router call a tab switch needs, given the current pathname. */
export function tabSwitchAction(tab: MainTab, pathname: string): 'none' | 'push' | 'dismissTo' {
  const target = TAB_PATH[tab];
  if (pathname === target) return 'none';
  if (tab === 'home') return 'dismissTo';
  return pathname === '/' ? 'push' : 'dismissTo';
}

type ArrivalListener = (tab: MainTab) => void;
const arrivalListeners = new Set<ArrivalListener>();

/**
 * Screens listen for "a tab switch is about to land on me" so they can raise
 * their skeleton BEFORE they become visible (ScreenTransition). A section that
 * stays mounted (Austausch) would otherwise show stale content first.
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
  // One frame for the target's skeleton to render before it is revealed.
  requestAnimationFrame(() => {
    if (action === 'push') router.push(TAB_PATH[tab]);
    // Pops to the section when it is in the stack, else replaces the current screen.
    else router.dismissTo(TAB_PATH[tab]);
  });
}
