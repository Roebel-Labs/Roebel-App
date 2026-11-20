import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { characterById } from '@/lib/chat/characters';
import { MECKY_AVATAR_SPEC } from '@/lib/chat/avatar-picture';
import { BotAvatar } from './BotAvatar';

export type FloatingMascot = {
  spec: BotAvatarSpec;
  /** Center position as a fraction of the container (may be <0 or >1 to clip at edges). */
  x: number;
  y: number;
  size: number;
  /** Resting rotation in degrees. */
  rotate?: number;
};

/** A character's picture as a floating spec (its round 512 px tile on its colour). */
function characterSpec(id: string): BotAvatarSpec {
  return { shape: 'circle', eyes: 'dots', color: characterById(id)?.color ?? '#00498B', character: id };
}

/** Layout of ref 1 (fractions of a 393×~850pt welcome screen): Mecky and character pictures. */
export const DEFAULT_MASCOTS: FloatingMascot[] = [
  { spec: characterSpec('wolke'), x: 0.24, y: 0.19, size: 82 },
  { spec: characterSpec('lumi'), x: 0.61, y: 0.18, size: 62, rotate: 4 },
  { spec: characterSpec('eiko'), x: 0.92, y: 0.32, size: 60 },
  { spec: characterSpec('ida'), x: 0.04, y: 0.37, size: 58, rotate: -10 },
  { spec: characterSpec('olli'), x: 1.02, y: 0.5, size: 80, rotate: -12 },
  { spec: MECKY_AVATAR_SPEC, x: -0.02, y: 0.55, size: 86 },
  { spec: characterSpec('lilo'), x: 0.93, y: 0.68, size: 58 },
  { spec: characterSpec('otto'), x: 0.14, y: 0.73, size: 66 },
  { spec: characterSpec('pilzi'), x: 0.53, y: 0.73, size: 80 },
];

function Mascot({ m, index, width, height }: { m: FloatingMascot; index: number; width: number; height: number }) {
  const drift = useSharedValue(0);
  const sway = useSharedValue(0);
  const period = 3200 + (index % 4) * 700;

  useEffect(() => {
    drift.value = withDelay(
      index * 180,
      withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    sway.value = withDelay(
      index * 240,
      withRepeat(withTiming(1, { duration: period * 1.3, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => {
      cancelAnimation(drift);
      cancelAnimation(sway);
    };
  }, [drift, sway, index, period]);

  const dir = index % 2 === 0 ? 1 : -1;
  const base = m.rotate ?? 0;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: (drift.value - 0.5) * 12 * dir },
      { translateX: (sway.value - 0.5) * 8 },
      { rotate: `${base + (sway.value - 0.5) * 8 * dir}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: m.x * width - m.size / 2, top: m.y * height - m.size / 2 },
        style,
      ]}
    >
      <BotAvatar spec={m.spec} size={m.size} />
    </Animated.View>
  );
}

export type FloatingMascotsProps = {
  mascots?: FloatingMascot[];
  /** Container height; defaults to the window height. Width = window width. */
  height?: number;
  style?: StyleProp<ViewStyle>;
};

/** Scattered, gently drifting agent pictures behind the welcome copy (ref 1). Absolute-fill, non-interactive. */
export function FloatingMascots({ mascots = DEFAULT_MASCOTS, height, style }: FloatingMascotsProps) {
  const win = useWindowDimensions();
  const h = height ?? win.height;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, style]}>
      {mascots.map((m, i) => (
        <Mascot key={i} m={m} index={i} width={win.width} height={h} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

export default FloatingMascots;
