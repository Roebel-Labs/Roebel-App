/**
 * Small frosted-glass tag that sits on top of a card cover (Erkunden rails:
 * open/closed, Verifiziert, Gäste-Favorit, deal value, FSK …).
 *
 * Always LIGHT, in every theme (Max 2026-11-21): a light chrome-material
 * backdrop blur — the bottom navigation's material — plus a white wash for
 * opacity, black text. Non-interactive; for the pressable glass pill see
 * GlassPill.
 *
 * iOS: real BlurView. Android: no blur (a screen may have ONE blur sampler
 * and the bottom nav already is it — see GlassBackdrop in GlassSurface), so a
 * denser white wash stands in.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { requireOptionalNativeModule } from 'expo';
import { fontFamily } from '@/constants/theme';

export const GLASS_TAG_HEIGHT = 26;

// An OTA can land in a binary without expo-blur (same guard as GlassSurface).
const BLUR_AVAILABLE = (() => {
  try {
    return requireOptionalNativeModule('ExpoBlur') != null;
  } catch {
    return false;
  }
})();
const USE_BLUR = Platform.OS === 'ios' && BLUR_AVAILABLE;

type Props = {
  children: React.ReactNode;
  /** Placement, e.g. `{ position: 'absolute', top: 10, left: 10 }`. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function GlassTag({ children, style, accessibilityLabel }: Props) {
  return (
    <View style={[styles.tag, style]} accessibilityLabel={accessibilityLabel} pointerEvents="none">
      {USE_BLUR ? (
        <BlurView style={StyleSheet.absoluteFill} intensity={100} tint="systemChromeMaterialLight" />
      ) : null}
      <View style={[StyleSheet.absoluteFill, USE_BLUR ? styles.washOverBlur : styles.washSolid]} />
      {children}
    </View>
  );
}

/** Label text in the tag — always dark on the light glass. */
export function GlassTagText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.text, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

/** Status dot (e.g. open = green). */
export function GlassTagDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    height: GLASS_TAG_HEIGHT,
    paddingHorizontal: 10,
    borderRadius: GLASS_TAG_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
  },
  washOverBlur: { backgroundColor: 'rgba(255,255,255,0.55)' },
  washSolid: { backgroundColor: 'rgba(255,255,255,0.9)' },
  text: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    color: '#000000',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
