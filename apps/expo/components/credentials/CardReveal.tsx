/**
 * Pack-opening reveal for a received badge: a sealed card appears and shakes harder and harder,
 * bursts open (flash, light rays, sparks, heavy haptic), flips to show the badge art, then floats
 * with a holographic sheen. Reduced motion: the badge is shown at once, the haptic still fires.
 *
 * Every animated style is computed inline in its worklet (no module helpers called from worklets:
 * they crash release builds, see the worklet-directive memory).
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const CARD_BACK = require('@/assets/images/icon.png');

export const REVEAL_CARD_W = 220;
export const REVEAL_CARD_H = 308;
/** When the badge face is fully shown (ms); the screen fades its text in after this. */
export const REVEAL_DONE_MS = 2100;

const SHAKE_MS = 1100;
const RAYS = 12;
const SPARKS = 14;

function fireBurstHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  setTimeout(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, 380);
}

function fireTickHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

type SparkProps = { index: number; burst: SharedValue<number> };

function Spark({ index, burst }: SparkProps) {
  const angle = (index / SPARKS) * Math.PI * 2 + (index % 2 ? 0.2 : -0.1);
  const dist = 150 + (index % 3) * 40;
  const dx = Math.cos(angle) * dist;
  const dy = Math.sin(angle) * dist;
  const size = 8 + (index % 3) * 4;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.1, 0.7, 1], [0, 1, 0.9, 0]),
    transform: [
      { translateX: burst.value * dx },
      { translateY: burst.value * dy },
      { rotate: `${burst.value * 180}deg` },
      { scale: interpolate(burst.value, [0, 0.2, 1], [0.2, 1, 0.4]) },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.spark, { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }, style]}>
      <View style={[styles.sparkBar, { width: size, height: size / 4, top: (size * 3) / 8 }]} />
      <View style={[styles.sparkBar, { width: size / 4, height: size, left: (size * 3) / 8 }]} />
    </Animated.View>
  );
}

export default function CardReveal({ imageUrl, accent = '#FFD54A' }: { imageUrl: string; accent?: string }) {
  const reduced = useReducedMotion();
  const enter = useSharedValue(reduced ? 1 : 0); // pack appears
  const shake = useSharedValue(0); // 0..1 shaking phase progress
  const wobble = useSharedValue(0); // oscillating -1..1
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  const flip = useSharedValue(reduced ? 1 : 0); // 0 = back, 1 = face
  const pop = useSharedValue(reduced ? 1 : 0.9);
  const rays = useSharedValue(reduced ? 1 : 0);
  const spin = useSharedValue(0);
  const float = useSharedValue(0);
  const sheen = useSharedValue(0);

  useEffect(() => {
    // Prefetch the art so the flip never shows an empty face.
    Image.prefetch(imageUrl).catch(() => {});
    if (reduced) {
      fireBurstHaptic();
      return;
    }
    enter.value = withSpring(1, { damping: 12, stiffness: 140 });
    // Shake: faster and wider towards the burst.
    shake.value = withDelay(350, withTiming(1, { duration: SHAKE_MS, easing: Easing.in(Easing.quad) }));
    wobble.value = withDelay(
      350,
      withRepeat(withSequence(withTiming(1, { duration: 55 }), withTiming(-1, { duration: 110 }), withTiming(0, { duration: 55 })), Math.round(SHAKE_MS / 220), false),
    );
    const ticks = [500, 850, 1150, 1350];
    const timers = ticks.map((t) => setTimeout(fireTickHaptic, t));
    const burstAt = 350 + SHAKE_MS;
    timers.push(setTimeout(fireBurstHaptic, burstAt));
    flash.value = withDelay(burstAt, withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 520 })));
    burst.value = withDelay(burstAt, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    rays.value = withDelay(burstAt, withTiming(1, { duration: 500 }));
    spin.value = withDelay(burstAt, withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false));
    flip.value = withDelay(burstAt + 60, withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.4)) }));
    pop.value = withDelay(burstAt + 60, withSequence(withTiming(1.12, { duration: 300 }), withSpring(1, { damping: 9, stiffness: 160 })));
    float.value = withDelay(REVEAL_DONE_MS, withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
    sheen.value = withDelay(REVEAL_DONE_MS - 300, withRepeat(withSequence(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), withDelay(1800, withTiming(0, { duration: 0 }))), -1, false));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once on mount
  }, []);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [80, 0]) + interpolate(float.value, [0, 1], [0, -8]) },
      { scale: interpolate(enter.value, [0, 1], [0.6, 1]) * pop.value },
      { rotateZ: `${wobble.value * interpolate(shake.value, [0, 1], [1.5, 7]) * (flip.value > 0.01 ? 0 : 1)}deg` },
    ],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));

  const faceStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [-180, 0])}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shake.value, [0, 1], [0.25, 0.85]) * (1 - burst.value * 0.4),
    transform: [{ scale: interpolate(shake.value, [0, 1], [0.8, 1.25]) + burst.value * 0.3 }],
  }));

  const raysStyle = useAnimatedStyle(() => ({
    opacity: rays.value * 0.55,
    transform: [{ rotate: `${spin.value * 360}deg` }, { scale: interpolate(rays.value, [0, 1], [0.4, 1]) }],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheen.value, [0, 0.15, 0.85, 1], [0, 0.55, 0.55, 0]),
    transform: [{ translateX: interpolate(sheen.value, [0, 1], [-REVEAL_CARD_W * 1.4, REVEAL_CARD_W * 1.4]) }, { rotate: '20deg' }],
  }));

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.rays, raysStyle]}>
        {Array.from({ length: RAYS }, (_, i) => (
          <View key={i} style={[styles.ray, { transform: [{ rotate: `${(i * 360) / RAYS}deg` }] }]}>
            <LinearGradient colors={[`${accent}00`, `${accent}CC`, `${accent}00`]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </View>
        ))}
      </Animated.View>
      <Animated.View style={[styles.glow, { backgroundColor: accent }, glowStyle]} />
      {Array.from({ length: SPARKS }, (_, i) => (
        <Spark key={i} index={i} burst={burst} />
      ))}
      <Animated.View style={[styles.stage, stageStyle]}>
        <Animated.View style={[styles.card, styles.back, backStyle]}>
          <LinearGradient colors={['#0A5BA8', '#00498B', '#00305C']} style={StyleSheet.absoluteFill} />
          <View style={[styles.backRing, { borderColor: accent }]} />
          <Image source={CARD_BACK} style={styles.backLogo} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[styles.card, faceStyle]}>
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
          <View style={styles.sheenClip}>
            <Animated.View style={[styles.sheen, sheenStyle]}>
              <LinearGradient
                colors={['#FFFFFF00', '#FFFFFFAA', '#B3E5FF88', '#FFD6F588', '#FFFFFF00']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.flash, flashStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', height: REVEAL_CARD_H + 80, alignItems: 'center', justifyContent: 'center' },
  stage: { width: REVEAL_CARD_W, height: REVEAL_CARD_H },
  card: { position: 'absolute', width: REVEAL_CARD_W, height: REVEAL_CARD_H, borderRadius: 22, overflow: 'hidden', backfaceVisibility: 'hidden' },
  back: { alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#FFD54A' },
  backRing: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, opacity: 0.6 },
  backLogo: { width: 110, height: 110, borderRadius: 55 },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130 },
  rays: { position: 'absolute', width: 640, height: 640, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 640, height: 26, overflow: 'hidden', borderRadius: 13 },
  spark: { position: 'absolute', left: '50%', top: '50%' },
  sparkBar: { position: 'absolute', backgroundColor: '#FFF4C2', borderRadius: 2 },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF', left: -400, right: -400, top: -400, bottom: -400 },
  sheenClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 22 },
  sheen: { position: 'absolute', top: -60, bottom: -60, width: 90, left: (REVEAL_CARD_W - 90) / 2 },
});
