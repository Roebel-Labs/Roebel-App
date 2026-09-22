/**
 * @deprecated Use `constants/theme.ts` and `useTheme()` from `@/context/ThemeContext` instead.
 * This file is kept for backward compatibility only.
 */

import { lightColors, dimColors } from './theme';

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
    text: dimColors.textPrimary,
    subtext: dimColors.textSecondary,
    textInverted: dimColors.textInverted,
    background: dimColors.background,
    tint: dimColors.primary,
    icon: dimColors.textTertiary,
    tabIconDefault: dimColors.tabIconDefault,
    tabIconSelected: dimColors.primary,
    border: dimColors.border,
    categoryBackground: dimColors.categoryBackground,
  },
};
