import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppMode, UserRole } from '@/lib/types';

const APP_MODE_KEY = '@app_mode';

interface AppModeContextValue {
  activeMode: AppMode;
  availableModes: AppMode[];
  defaultMode: AppMode;
  canSwitchModes: boolean;
  setMode: (mode: AppMode) => void;
  // Backward compatibility
  isExtendedMode: boolean;
  toggleExtendedMode: () => Promise<void>;
}

const AppModeContext = createContext<AppModeContextValue | undefined>(undefined);

function computeAvailableModes(role: UserRole, isCitizen: boolean, isBusinessOwner: boolean): AppMode[] {
  if (isBusinessOwner || role === 'business' || role === 'official') {
    return ['tourist', 'citizen', 'org'];
  }
  if (isCitizen || role === 'resident') {
    return ['tourist', 'citizen'];
  }
  return ['tourist'];
}

function computeDefaultMode(role: UserRole, isCitizen: boolean, isBusinessOwner: boolean): AppMode {
  if (isBusinessOwner || role === 'business') return 'org';
  if (role === 'official') return 'citizen';
  if (isCitizen || role === 'resident') return 'citizen';
  return 'tourist';
}

interface AppModeProviderProps {
  children: ReactNode;
  role: UserRole;
  isCitizen: boolean;
  isBusinessOwner: boolean;
}

export function AppModeProvider({ children, role, isCitizen, isBusinessOwner }: AppModeProviderProps) {
  const availableModes = useMemo(
    () => computeAvailableModes(role, isCitizen, isBusinessOwner),
    [role, isCitizen, isBusinessOwner]
  );

  const defaultMode = useMemo(
    () => computeDefaultMode(role, isCitizen, isBusinessOwner),
    [role, isCitizen, isBusinessOwner]
  );

  const [activeMode, setActiveMode] = useState<AppMode>(defaultMode);
  const [loaded, setLoaded] = useState(false);

  // Load persisted mode
  useEffect(() => {
    AsyncStorage.getItem(APP_MODE_KEY).then(value => {
      if (value && availableModes.includes(value as AppMode)) {
        setActiveMode(value as AppMode);
      } else {
        setActiveMode(defaultMode);
      }
      setLoaded(true);
    });
  }, []);

  // If available modes change (e.g. user verifies), ensure current mode is still valid
  useEffect(() => {
    if (loaded && !availableModes.includes(activeMode)) {
      setActiveMode(defaultMode);
      AsyncStorage.setItem(APP_MODE_KEY, defaultMode);
    }
  }, [availableModes, loaded]);

  const setMode = useCallback((mode: AppMode) => {
    if (availableModes.includes(mode)) {
      setActiveMode(mode);
      AsyncStorage.setItem(APP_MODE_KEY, mode);
    }
  }, [availableModes]);

  const canSwitchModes = availableModes.length > 1;

  // Backward compatibility with ExtendedModeContext
  const isExtendedMode = activeMode !== 'tourist';
  const toggleExtendedMode = useCallback(async () => {
    if (activeMode === 'tourist') {
      const nextMode = availableModes.length > 1 ? availableModes[1] : 'tourist';
      setMode(nextMode);
    } else {
      setMode('tourist');
    }
  }, [activeMode, availableModes, setMode]);

  const value = useMemo<AppModeContextValue>(() => ({
    activeMode,
    availableModes,
    defaultMode,
    canSwitchModes,
    setMode,
    isExtendedMode,
    toggleExtendedMode,
  }), [activeMode, availableModes, defaultMode, canSwitchModes, setMode, isExtendedMode, toggleExtendedMode]);

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

const defaultValue: AppModeContextValue = {
  activeMode: 'tourist',
  availableModes: ['tourist'],
  defaultMode: 'tourist',
  canSwitchModes: false,
  setMode: () => {},
  isExtendedMode: false,
  toggleExtendedMode: async () => {},
};

export function useAppMode(): AppModeContextValue {
  const context = useContext(AppModeContext);
  return context ?? defaultValue;
}

// Backward compatibility export
export function useExtendedMode() {
  const { isExtendedMode, toggleExtendedMode } = useAppMode();
  return { isExtendedMode, toggleExtendedMode };
}
