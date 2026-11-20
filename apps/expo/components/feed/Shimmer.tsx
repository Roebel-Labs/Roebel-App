import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

/** One full breath (dim → bright → dim), ms. */
const BREATH_MS = 1600;
/** Lowest opacity of the breath. Subtle on purpose: the page "develops", it does not blink. */
const DIM = 0.45;

/**
 * Skeleton container: the whole group breathes as ONE native-driven opacity
 * loop. A single animated node per skeleton (instead of a sweeping gradient
 * per block, each measuring itself) keeps the JS thread free during
 * navigation and reads calmer. Static when reduce motion is on.
 */
export function ShimmerGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduceMotion(on))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const half = BREATH_MS / 2;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: DIM, duration: half, easing: ease, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: half, easing: ease, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** A skeleton block. Animated by its surrounding <ShimmerGroup>. */
export function ShimmerBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.block, { backgroundColor: colors.skeleton }, style]} />;
}

const styles = StyleSheet.create({
  block: { borderRadius: 8 },
});
