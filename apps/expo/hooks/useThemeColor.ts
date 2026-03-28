/**
 * @deprecated Use `useTheme()` from `@/context/ThemeContext` directly.
 * Kept for backward compatibility with ThemedText, ThemedView, etc.
 */

import { useTheme } from '@/context/ThemeContext';
import { ColorKey } from '@/constants/theme';

// Map old Colors.ts keys to new theme.ts semantic keys
const legacyKeyMap: Record<string, ColorKey> = {
  text: 'textPrimary',
  subtext: 'textSecondary',
  textInverted: 'textInverted',
  background: 'background',
  tint: 'primary',
  icon: 'textTertiary',
  tabIconDefault: 'tabIconDefault',
  tabIconSelected: 'primary',
  border: 'border',
  categoryBackground: 'categoryBackground',
};

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: string
) {
  const { effectiveTheme, colors } = useTheme();
  const colorFromProps = props[effectiveTheme];

  if (colorFromProps) {
    return colorFromProps;
  }

  const resolvedKey = (legacyKeyMap[colorName] ?? colorName) as ColorKey;
  return colors[resolvedKey] ?? '#000000';
}
