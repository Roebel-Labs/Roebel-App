/**
 * Central Theme Tokens — Single Source of Truth
 *
 * All design tokens (colors, typography, spacing, radii) are defined here.
 * Consumed by:
 *   - ThemeContext (programmatic access via useTheme())
 *   - useThemeColor hook (backward compat)
 */

// ─── Typography ──────────────────────────────────────────────

export const fontFamily = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 22,
  '4xl': 32,
} as const;

// ─── Spacing ─────────────────────────────────────────────────

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ─── Border Radii ────────────────────────────────────────────

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// ─── Colors ──────────────────────────────────────────────────

export const lightColors = {
  // Backgrounds
  background: '#ffffff',
  surface: '#F7F7F7',
  surfaceSecondary: '#f5f5f5',
  feedBackground: '#F0F0F0',

  // Text
  textPrimary: '#000000',
  textSecondary: '#6b7280',
  textTertiary: '#9ca3af',
  textInverted: '#ffffff',

  // Brand
  primary: '#194383',
  primaryLight: '#E4F2FF',
  onPrimary: '#ffffff',

  // Borders
  border: '#f0f0f0',
  borderSecondary: '#E5E7EB',
  borderTertiary: '#ECEDEE',

  // Semantic
  error: '#DC2626',
  errorBackground: '#FEE2E2',
  warning: '#92400E',
  warningBackground: '#FEF3C7',
  success: '#16a34a',
  successBackground: '#E8F5E9',
  link: '#0a7ea4',

  // Component-specific
  tabIconDefault: '#9ca3af',
  tabIconActive: '#374453',
  cardPlaceholder: '#e5e7eb',
  skeleton: '#e5e7eb',
  pressedOverlay: '#f9fafb',
  switchTrackOff: '#d1d5db',
  categoryBackground: '#E4F2FF',
  disabled: '#d1d5db',
  disabledText: '#9ca3af',
} as const;

export const darkColors = {
  // Backgrounds
  background: '#202124',
  surface: '#3c4043',
  surfaceSecondary: '#2d2e31',
  feedBackground: '#18191B',

  // Text
  textPrimary: '#e8eaed',
  textSecondary: '#9aa0a6',
  textTertiary: '#6e7277',
  textInverted: '#202124',

  // Brand
  primary: '#8AB4F8',
  primaryLight: '#1a3a5c',
  onPrimary: '#3c4043',

  // Borders
  border: '#3c4043',
  borderSecondary: '#5f6368',
  borderTertiary: '#5f6368',

  // Semantic
  error: '#f87171',
  errorBackground: '#450a0a',
  warning: '#fbbf24',
  warningBackground: '#422006',
  success: '#4ade80',
  successBackground: '#1a3a2a',
  link: '#5cb8d6',

  // Component-specific
  tabIconDefault: '#9aa0a6',
  tabIconActive: '#e8eaed',
  cardPlaceholder: '#3c4043',
  skeleton: '#3c4043',
  pressedOverlay: '#3c4043',
  switchTrackOff: '#5f6368',
  categoryBackground: '#1a3a5c',
  disabled: '#5f6368',
  disabledText: '#6e7277',
} as const;

export type ColorTokens = typeof lightColors;
export type ColorKey = keyof ColorTokens;

export const colors = {
  light: lightColors,
  dark: darkColors,
} as const;
