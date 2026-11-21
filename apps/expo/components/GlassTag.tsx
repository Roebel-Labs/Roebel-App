/**
 * Small frosted-glass tag that sits on top of a card cover (Erkunden rails:
 * open/closed, Verifiziert, Gäste-Favorit, deal value, FSK …).
 *
 * iOS: the exact material of the bottom navigation (GlassSurface → chrome
 * BlurView). Android: a translucent wash instead of a real blur — a screen may
 * have at most ONE blur sampler and the bottom nav already is it (see the
 * GlassBackdrop notes in GlassSurface). Non-interactive — for the pressable
 * glass pill see GlassPill.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import GlassSurface from '@/components/GlassSurface';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

export const GLASS_TAG_HEIGHT = 24;

type Props = {
  children: React.ReactNode;
  /** Placement, e.g. `{ position: 'absolute', top: 10, left: 10 }`. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function GlassTag({ children, style, accessibilityLabel }: Props) {
  const { isDark, variant } = useTheme();
  const rim = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.7)';
  const androidWash = variant === 'dark'
    ? 'rgba(0,0,0,0.6)'
    : isDark
      ? 'rgba(24,25,27,0.62)'
      : 'rgba(255,255,255,0.82)';

  return (
    <View
      style={[styles.pill, { borderColor: rim }, style]}
      accessibilityLabel={accessibilityLabel}
      pointerEvents="none"
    >
      {Platform.OS === 'ios' ? (
        <GlassSurface />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: androidWash }]} />
      )}
      {children}
    </View>
  );
}

/** Label text in the pill — theme-aware so it reads on the light or dark glass. */
export function GlassTagText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { isDark } = useTheme();
  return (
    <Text style={[styles.text, { color: isDark ? '#FFFFFF' : '#000000' }, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

/** Status dot (e.g. open = green). */
export function GlassTagDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    height: GLASS_TAG_HEIGHT,
    paddingHorizontal: 9,
    borderRadius: GLASS_TAG_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  text: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
