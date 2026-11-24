import { useEffect } from 'react';
import { useIsFocused, usePathname } from 'expo-router';
import { goToTab, type MainTab } from './goToTab';
import { useShellTabs } from './useShellTabs';

/**
 * A section the active account's bar doesn't show (a personal account on /dashboard, a member
 * whose role was downgraded) sends the user to Austausch instead of rendering.
 * Returns whether the section belongs to the shell.
 */
export function useShellGuard(tab: MainTab): boolean {
  const tabs = useShellTabs();
  const focused = useIsFocused();
  const pathname = usePathname();
  const allowed = tabs.includes(tab);
  useEffect(() => {
    if (focused && !allowed) goToTab('home', pathname);
  }, [focused, allowed, pathname]);
  return allowed;
}
