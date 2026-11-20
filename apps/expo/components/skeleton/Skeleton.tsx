/**
 * Skeleton primitives with ONE shimmer band that sweeps from the top of the
 * screen to the bottom through every bone, as if a single light passes over
 * the whole page (Max 2026-11-20). The band look is the restaurant-image
 * sweep: transparent → soft highlight → transparent.
 *
 *   <SkeletonScope>            one shared 0→1 loop (UI thread) + the scope's window rect
 *     <Bone style={…} />       a block; its band is offset by its own window y,
 *     <Bone width="60%" height={14} />   so all bones are lit by the same band
 *   </SkeletonScope>
 *
 * A Bone outside a scope sweeps on its own. Everything animates on the UI
 * thread (reanimated); each bone measures itself once on layout.
 */
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

/** One pass of the band over the whole scope, ms. */
const SWEEP_MS = 1500;
/** Height of the highlight band, px. */
const BAND = 260;

type Sweep = { progress: SharedValue<number>; height: number };
const SweepContext = createContext<Sweep | null>(null);

function useSweepProgress(): SharedValue<number> {
  const progress = useSharedValue(0);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!alive || reduce) return;
        progress.value = 0;
        progress.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancelAnimation(progress);
    };
  }, [progress]);
  return progress;
}

/** Shares one top-to-bottom sweep with every Bone inside. */
export function SkeletonScope({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useSweepProgress();
  const { height } = useWindowDimensions();
  return (
    <SweepContext.Provider value={{ progress, height }}>
      <View style={style}>{children}</View>
    </SweepContext.Provider>
  );
}

type BoneProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** A skeleton block lit by the scope's band (or its own, outside a scope). */
export function Bone({ width, height, radius = 8, style }: BoneProps) {
  const { colors, isDark } = useTheme();
  const scope = useContext(SweepContext);
  const own = useSweepProgress();
  const progress = scope?.progress ?? own;
  const { height: windowHeight } = useWindowDimensions();
  const travel = scope?.height ?? windowHeight;
  // Window y of this bone (measured once), so the band position is screen-global.
  const y = useSharedValue(0);
  const h = useSharedValue(0);
  const ref = useRef<View>(null);

  const bandStyle = useAnimatedStyle(() => {
    // Band centre runs from above the screen to below it; local offset = global - bone y.
    const global = -BAND + progress.value * (travel + BAND * 2);
    const local = scope ? global - y.value : -BAND + progress.value * (h.value + BAND * 2);
    return { transform: [{ translateY: local }] };
  });

  const highlight = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.65)';

  return (
    <View
      ref={ref}
      onLayout={(e) => {
        h.value = e.nativeEvent.layout.height;
        ref.current?.measureInWindow((_x, wy) => {
          y.value = wy;
        });
      }}
      style={[styles.bone, { borderRadius: radius, backgroundColor: colors.skeleton }, width !== undefined && { width }, height !== undefined && { height }, style]}
    >
      <AnimatedGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', highlight, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.band, bandStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bone: { overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, top: 0, height: BAND },
});
