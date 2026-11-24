/**
 * The dark, fully rounded "contrast pill" that floats above the glass bottom bar
 * ("Account wechseln", Erkunden's Karte/Liste switch). Figma node 3137:2815.
 *
 * Near-black vertical gradient, a hairline light rim so it separates from dark content, and a
 * soft wide shadow (the one sanctioned shadow in the Ortis UI). Press: spring to 0.97 + haptic.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CONTRAST_PILL_GRADIENT, CONTRAST_PILL_HEIGHT } from '@/lib/contrast-pill';

type Props = {
  label: string;
  onPress: () => void;
  /** Left slot, e.g. a 28 pt avatar or a 24 pt icon. */
  leading?: React.ReactNode;
  /** Right slot, e.g. the ⇆ icon. */
  trailing?: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

export default function ContrastPill({ label, onPress, leading, trailing, disabled, accessibilityLabel, style }: Props) {
  const { isDark } = useTheme();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const colors = isDark ? CONTRAST_PILL_GRADIENT.dark : CONTRAST_PILL_GRADIENT.light;

  return (
    <Animated.View style={[styles.shadow, pressStyle, style]}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        onPressIn={() => (scale.value = withSpring(0.97, SPRING))}
        onPressOut={() => (scale.value = withSpring(1, SPRING))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={[styles.pill, disabled && styles.disabled]}
      >
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* Top sheen: a faint highlight on the upper half gives the pill its slight curvature. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.6 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    alignSelf: 'center',
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  pill: {
    height: CONTRAST_PILL_HEIGHT,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  disabled: { opacity: 0.6 },
  leading: { marginRight: 10 },
  trailing: { marginLeft: 8 },
  label: { color: '#FFFFFF', fontFamily: fontFamily.semiBold, fontSize: 17, letterSpacing: -0.2 },
});
