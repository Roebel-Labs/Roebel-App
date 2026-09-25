import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import GlassSurface, { glassEdgeColor } from '@/components/GlassSurface';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Overrides for the inner content row (e.g. no padding for an icon-only circle). */
  contentStyle?: StyleProp<ViewStyle>;
};

export const GLASS_PILL_HEIGHT = 36;

/**
 * Frosted pill with the same material as the bottom navigation. The outer
 * pressable carries the shadow; the inner view clips the glass to the pill
 * (GlassSurface must be its first child and the container transparent).
 * Not an Android blur sampler — the nav keeps that role on each screen.
 */
export default function GlassPill({ onPress, accessibilityLabel, children, style, contentStyle }: Props) {
  const { isDark } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      haptic="selection"
      style={[styles.shadow, softShadow(1, isDark), style]}
    >
      <View style={[styles.clip, { borderColor: glassEdgeColor(isDark) }]}>
        <GlassSurface />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: GLASS_PILL_HEIGHT / 2,
  },
  clip: {
    height: GLASS_PILL_HEIGHT,
    borderRadius: GLASS_PILL_HEIGHT / 2,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
});
