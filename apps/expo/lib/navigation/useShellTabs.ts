import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/context/AccountContext';
import { fetchOrgShellEnabled } from '@/lib/supabase-app-settings';
import type { MainTab } from './goToTab';
import { shellTabsFor } from './shell-tabs';

// Module-level so every bar instance agrees immediately after the first fetch.
let cachedOrgShellEnabled = true;
let fetched: Promise<boolean> | null = null;

function loadOrgShellEnabled(): Promise<boolean> {
  if (!fetched) {
    fetched = fetchOrgShellEnabled()
      .then((on) => (cachedOrgShellEnabled = on))
      .catch(() => cachedOrgShellEnabled);
  }
  return fetched;
}

/** The sections the bottom bar shows for the active account (see shell-tabs.ts). */
export function useShellTabs(): MainTab[] {
  const { activeAccount, roleInActiveAccount } = useAccount();
  const [enabled, setEnabled] = useState(cachedOrgShellEnabled);
  useEffect(() => {
    let alive = true;
    loadOrgShellEnabled().then((on) => alive && setEnabled(on));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(
    () => shellTabsFor({ account: activeAccount, role: roleInActiveAccount, orgShellEnabled: enabled }),
    [activeAccount, roleInActiveAccount, enabled]
  );
}
