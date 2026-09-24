import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, ColorTokens, ThemeVariant } from '@/constants/theme';

export type { ThemeVariant } from '@/constants/theme';
export type ThemePreference = 'system' | ThemeVariant;
type EffectiveTheme = 'light' | 'dark';

type ThemeContextType = {
  preference: ThemePreference;
  /** The palette in use: light, dim (grey dark) or dark (pure black). */
  variant: ThemeVariant;
  /** The color scheme — `dark` for both dim and dark. */
  effectiveTheme: EffectiveTheme;
  colors: ColorTokens;
  isDark: boolean;
  setPreference: (pref: ThemePreference) => Promise<void>;
};

// v2 added "dim". Under the legacy key, "dark" meant today's dim palette.
const THEME_PREFERENCE_KEY = '@theme_preference_v2';
const LEGACY_THEME_PREFERENCE_KEY = '@theme_preference';

/** Palette the "System" preference uses when the device is in dark mode. */
const SYSTEM_DARK_VARIANT: ThemeVariant = 'dark';

function isThemePreference(val: string | null): val is ThemePreference {
  return val === 'system' || val === 'light' || val === 'dim' || val === 'dark';
}

async function loadPreference(): Promise<ThemePreference | null> {
  const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  if (isThemePreference(stored)) return stored;
  const legacy = await AsyncStorage.getItem(LEGACY_THEME_PREFERENCE_KEY);
  if (legacy === 'dark') return 'dim';
  if (legacy === 'light' || legacy === 'system') return legacy;
  return null;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPreference()
      .then((val) => {
        if (val) setPreferenceState(val);
      })
      .finally(() => setLoaded(true));
  }, []);

  const variant: ThemeVariant =
    preference === 'system'
      ? systemScheme === 'dark'
        ? SYSTEM_DARK_VARIANT
        : 'light'
      : preference;
  const effectiveTheme: EffectiveTheme = variant === 'light' ? 'light' : 'dark';

  const setPreference = useCallback(async (pref: ThemePreference) => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, pref);
    setPreferenceState(pref);
  }, []);

  const value: ThemeContextType = useMemo(
    () => ({
      preference,
      variant,
      effectiveTheme,
      colors: colors[variant],
      isDark: effectiveTheme === 'dark',
      setPreference,
    }),
    [preference, variant, effectiveTheme, setPreference]
  );

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

const defaultTheme: ThemeContextType = {
  preference: 'system',
  variant: 'light',
  effectiveTheme: 'light',
  colors: colors.light,
  isDark: false,
  setPreference: async () => {},
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  // Return safe default during initial mount before provider is ready
  return ctx ?? defaultTheme;
}
