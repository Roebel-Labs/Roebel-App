/**
 * Skeleton placeholders for the Mini App store while `fetchLiveMiniApps()` is
 * in flight. Mirrors the real layout — featured hero + two row sections — so
 * the shell doesn't jump when content arrives. One shared opacity pulse drives
 * every bone (native-driven, so it's cheap).
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Animated,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const HERO_RATIO = 0.7;
const HERO_RADIUS = 24;

/** Shared, looping opacity pulse for a skeleton screen. */
function usePulse() {
  const value = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value;
}

function Bone({
  opacity,
  color,
  style,
}: {
  opacity: Animated.Value;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <Animated.View style={[{ backgroundColor: color, opacity }, style]} />;
}

/** One placeholder row: squircle icon + two text lines + pill button. */
function SkeletonRow({ opacity, color }: { opacity: Animated.Value; color: string }) {
  return (
    <View style={styles.row}>
      <Bone opacity={opacity} color={color} style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Bone opacity={opacity} color={color} style={styles.lineName} />
        <Bone opacity={opacity} color={color} style={styles.lineDesc} />
      </View>
      <Bone opacity={opacity} color={color} style={styles.rowPill} />
    </View>
  );
}

export default function MiniAppStoreSkeleton() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const opacity = usePulse();
  const bone = colors.surfaceSecondary;
  const heroW = width - 32;

  return (
    <View style={styles.container}>
      {/* Featured hero */}
      <Bone
        opacity={opacity}
        color={bone}
        style={[styles.hero, { width: heroW, height: Math.round(heroW * HERO_RATIO) }]}
      />

      {/* Top-Apps */}
      <View style={styles.section}>
        <Bone opacity={opacity} color={bone} style={styles.sectionTitle} />
        {[0, 1, 2].map((i) => (
          <SkeletonRow key={`top-${i}`} opacity={opacity} color={bone} />
        ))}
      </View>

      {/* Neu & bemerkenswert */}
      <View style={styles.section}>
        <Bone opacity={opacity} color={bone} style={styles.sectionTitle} />
        {[0, 1, 2].map((i) => (
          <SkeletonRow key={`new-${i}`} opacity={opacity} color={bone} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 4 },
  hero: {
    marginHorizontal: 16,
    borderRadius: HERO_RADIUS,
  },
  section: { marginTop: 28 },
  sectionTitle: {
    marginHorizontal: 16,
    marginBottom: 12,
    width: 130,
    height: 20,
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  rowBody: { flex: 1 },
  lineName: {
    width: '55%',
    height: 14,
    borderRadius: 5,
  },
  lineDesc: {
    marginTop: 8,
    width: '38%',
    height: 11,
    borderRadius: 5,
  },
  rowPill: {
    width: 64,
    height: 34,
    borderRadius: 17,
  },
});
