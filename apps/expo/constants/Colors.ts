/**
 * @deprecated Use `constants/theme.ts` and `useTheme()` from `@/context/ThemeContext` instead.
 * This file is kept for backward compatibility only.
 */

import { lightColors, darkColors } from './theme';

export const Colors = {
  light: {
    text: lightColors.textPrimary,
    subtext: lightColors.textSecondary,
    textInverted: lightColors.textInverted,
    background: lightColors.background,
    tint: lightColors.primary,
    icon: lightColors.textTertiary,
    tabIconDefault: lightColors.tabIconDefault,
    tabIconSelected: lightColors.primary,
    border: lightColors.border,
    categoryBackground: lightColors.categoryBackground,
  },
  dark: {
    text: darkColors.textPrimary,
    subtext: darkColors.textSecondary,
    textInverted: darkColors.textInverted,
    background: darkColors.background,
    tint: darkColors.primary,
    icon: darkColors.textTertiary,
    tabIconDefault: darkColors.tabIconDefault,
    tabIconSelected: darkColors.primary,
    border: darkColors.border,
    categoryBackground: darkColors.categoryBackground,
  },
};
