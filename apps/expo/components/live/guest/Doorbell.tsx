// Calm "waiting for the studio" animation: a bell that sways gently inside two slow pulse rings.
// No LiveKit imports here (safe on every runtime).
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { liveStyles, useLivePalette, type LivePalette } from '../tokens';

const SIZE = 132;

function useRing(delay: number): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1));
  }, [v, delay]);
  return v;
}

function Ring({ progress }: { progress: SharedValue<number> }) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - progress.value),
    transform: [{ scale: 0.55 + progress.value * 0.65 }],
  }));
  return <Animated.View style={[styles.ring, style]} />;
}

export default function Doorbell() {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const swing = useSharedValue(0);
  const ringA = useRing(0);
  const ringB = useRing(1300);

  useEffect(() => {
    // Two soft swings, then a pause: a doorbell, not an alarm.
    swing.value = withRepeat(withSequence(
      withTiming(1, { duration: 220, easing: Easing.inOut(Easing.quad) }),
      withTiming(-1, { duration: 360, easing: Easing.inOut(Easing.quad) }),
      withTiming(0.6, { duration: 300, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 1800 }),
    ), -1);
  }, [swing]);

  const bellStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${swing.value * 14}deg` }] }));

  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ring progress={ringA} />
      <Ring progress={ringB} />
      <View style={styles.core}>
        <Animated.View style={bellStyle}>
          <Ionicons name="notifications" size={40} color={L.goldText} />
        </Animated.View>
      </View>
    </View>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2, borderColor: L.gold },
  core: {
    width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: L.goldSoft,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(242,193,78,0.4)',
  },
});
