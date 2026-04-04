"use client";

/**
 * AppModeContext — backward-compatible bridge
 *
 * Derives the old AppMode/UserRole values from the new AccountContext + user tier.
 * All 9 consumers of useAppMode() continue working without changes.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useAccount } from "./AccountContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isOrgAccount } from "@/types/account";

// --- Types (kept for backward compat) ---

/** @deprecated Use UserTier from types/account instead */
export type UserRole = "tourist" | "resident" | "business" | "official";
export type AppMode = "tourist" | "citizen" | "org";

interface AppModeContextValue {
  /** The currently active view mode */
  activeMode: AppMode;
  /** Which modes this user can switch to */
  availableModes: AppMode[];
  /** Switch to a different mode (must be in availableModes) */
  setMode: (mode: AppMode) => void;
  /** Whether the user has more than one mode available */
  canSwitchModes: boolean;
  /** The underlying identity role */
  userRole: UserRole;
  /** Backwards compat: true when not in tourist mode */
  isExtendedMode: boolean;
  /** Whether mode data is still loading */
  isLoading: boolean;
}

// --- Context ---

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const { activeAccount, ownedAccounts, switchAccount, isLoading: accountLoading } = useAccount();
  const { user, isLoading: userLoading } = useUserProfile();

  const isLoading = accountLoading || userLoading;

  // Derive tier from user (DB column renamed from role → tier in migration 005)
  const tier = user?.tier || user?.role || "tourist";
  const isCitizen = tier === "citizen" || user?.is_verified_citizen;

  // Map tier → old UserRole for backward compat
  const userRole: UserRole = isCitizen ? "resident" : "tourist";

  // Derive activeMode from active account
  const activeMode: AppMode = (() => {
    if (!activeAccount) return isCitizen ? "citizen" : "tourist";
    if (isOrgAccount(activeAccount)) return "org";
    return isCitizen ? "citizen" : "tourist";
  })();

  // Derive available modes
  const availableModes: AppMode[] = useMemo(() => {
    const modes: AppMode[] = ["tourist"];
    if (isCitizen) modes.push("citizen");
    if (ownedAccounts.some(isOrgAccount)) modes.push("org");
    return modes;
  }, [isCitizen, ownedAccounts]);

  // Map setMode to switchAccount
  const setMode = (mode: AppMode) => {
    if (!availableModes.includes(mode)) return;

    if (mode === "org") {
      // Switch to first org account
      const orgAccount = ownedAccounts.find(isOrgAccount);
      if (orgAccount) switchAccount(orgAccount.id);
    } else {
      // Switch to personal account
      const personalAccount = ownedAccounts.find(
        (a) => a.account_type === "personal"
      );
      if (personalAccount) switchAccount(personalAccount.id);
    }
  };

  const value = useMemo<AppModeContextValue>(
    () => ({
      activeMode,
      availableModes,
      setMode,
      canSwitchModes: availableModes.length > 1,
      userRole,
      isExtendedMode: activeMode !== "tourist",
      isLoading,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMode, availableModes, userRole, isLoading]
  );

  return (
    <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
  );
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error("useAppMode must be used within <AppModeProvider>");
  }
  return ctx;
}
