import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { formatCooldownClock } from '@/lib/muenzen-daily-mint';

// Same curves as the explore search placeholder, with a longer hold.
const FADE_OUT_MS = 220;
const FADE_IN_MS = 280;
const HOLD_MS = 3000;
const CYCLE_MS = HOLD_MS + FADE_OUT_MS + FADE_IN_MS;

type Props = {
  /** Timestamp when the next Münze can be collected. */
  cooldownEnd: number;
  style: StyleProp<TextStyle>;
};

/**
 * Idle-state label while the hourly mint cools down: alternates between
 * "Münzen" and a MM:SS clock, sliding up/down like the search placeholder.
 * Ticks only inside this component so the profile does not re-render.
 */
export default function MuenzenCooldownLabel({ cooldownEnd, style }: Props) {
  const [showClock, setShowClock] = useState(false);
  const [remaining, setRemaining] = useState(() => cooldownEnd - Date.now());

  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // The clock, once a second, only while there is time left.
  useEffect(() => {
    const id = setInterval(() => setRemaining(cooldownEnd - Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  // Alternate the two texts with the placeholder's slide/fade.
  useEffect(() => {
    let swap: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      opacity.set(withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.quad) }));
      translateY.set(withTiming(-10, { duration: FADE_OUT_MS, easing: Easing.in(Easing.quad) }));
      swap = setTimeout(() => {
        setShowClock((v) => !v);
        translateY.set(10);
        opacity.set(withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.cubic) }));
        translateY.set(withTiming(0, { duration: FADE_IN_MS, easing: Easing.out(Easing.cubic) }));
      }, FADE_OUT_MS);
    };
    const interval = setInterval(tick, CYCLE_MS);
    return () => {
      clearInterval(interval);
      if (swap) clearTimeout(swap);
    };
  }, [opacity, translateY]);

  const text = showClock && remaining > 0 ? formatCooldownClock(remaining) : 'Münzen';

  return (
    <View style={styles.wrap}>
      {/* Invisible widest text keeps the pill from reshaping on every swap. */}
      <Text style={[style, styles.ghost]} numberOfLines={1} accessible={false}>
        Münzen
      </Text>
      <Animated.Text style={[style, styles.live, animatedStyle]} numberOfLines={1}>
        {text}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  ghost: {
    opacity: 0,
  },
  live: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
