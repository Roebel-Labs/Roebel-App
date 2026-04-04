"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useActiveAccount } from "thirdweb/react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { getBusinessesByOwner } from "@/app/actions/businesses";

// --- Types ---

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

// --- Helpers ---

const STORAGE_KEY = "roebel-app-mode";

function getStoredMode(): AppMode | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "tourist" || stored === "citizen" || stored === "org") {
    return stored;
  }
  return null;
}

function storeMode(mode: AppMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

function deriveUserRole(
  isCitizen: boolean,
  isAttester: boolean,
  isBusinessOwner: boolean
): UserRole {
  if (isBusinessOwner) return "business";
  if (isAttester) return "official";
  if (isCitizen) return "resident";
  return "tourist";
}

function getAvailableModes(role: UserRole): AppMode[] {
  switch (role) {
    case "tourist":
      return ["tourist"];
    case "resident":
      return ["tourist", "citizen"];
    case "business":
      return ["tourist", "citizen", "org"];
    case "official":
      return ["tourist", "citizen", "org"];
  }
}

function getDefaultMode(role: UserRole): AppMode {
  switch (role) {
    case "tourist":
      return "tourist";
    case "resident":
      return "citizen";
    case "business":
      return "org";
    case "official":
      return "citizen";
  }
}

// --- Context ---

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const account = useActiveAccount();
  const { isCitizen, isAttester, isLoading: isNftLoading } = useVerificationStatus();
  const [isBusinessOwner, setIsBusinessOwner] = useState(false);
  const [isBusinessLoading, setIsBusinessLoading] = useState(false);
  const [activeMode, setActiveMode] = useState<AppMode>("tourist");
  const [initialized, setInitialized] = useState(false);

  // Fetch business ownership
  useEffect(() => {
    async function checkBusiness() {
      if (!account?.address) {
        setIsBusinessOwner(false);
        return;
      }
      setIsBusinessLoading(true);
      try {
        const result = await getBusinessesByOwner(account.address);
        setIsBusinessOwner(
          result.success && !!result.data && result.data.length > 0
        );
      } catch {
        setIsBusinessOwner(false);
      } finally {
        setIsBusinessLoading(false);
      }
    }
    checkBusiness();
  }, [account?.address]);

  const isLoading = isNftLoading || isBusinessLoading;
  const userRole = deriveUserRole(isCitizen, isAttester, isBusinessOwner);
  const availableModes = useMemo(() => getAvailableModes(userRole), [userRole]);

  // Initialize mode from localStorage or derive default
  useEffect(() => {
    if (isLoading) return;

    const stored = getStoredMode();
    if (stored && availableModes.includes(stored)) {
      setActiveMode(stored);
    } else {
      const defaultMode = getDefaultMode(userRole);
      setActiveMode(defaultMode);
      storeMode(defaultMode);
    }
    setInitialized(true);
  }, [isLoading, userRole, availableModes]);

  const setMode = (mode: AppMode) => {
    if (!availableModes.includes(mode)) return;
    setActiveMode(mode);
    storeMode(mode);
  };

  const value = useMemo<AppModeContextValue>(
    () => ({
      activeMode,
      availableModes,
      setMode,
      canSwitchModes: availableModes.length > 1,
      userRole,
      isExtendedMode: activeMode !== "tourist",
      isLoading: isLoading || !initialized,
    }),
    [activeMode, availableModes, userRole, isLoading, initialized]
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
