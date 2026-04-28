import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

const SUFFIXES = [
  'Veranstaltungen',
  'Kino',
  'Gastronomie',
  'Neuigkeiten',
  'Sternfahrten',
  'Wildtiere',
  'Marktplatz',
  'Angeboten',
  'Bürgerumfragen',
] as const;

const PREFIX = 'Suchen nach ';

const FADE_OUT_MS = 220;
const FADE_IN_MS = 280;
const HOLD_MS = 1900;
const CYCLE_MS = HOLD_MS + FADE_OUT_MS + FADE_IN_MS;

type Props = Readonly<{
  fontSize?: number;
}>;

export default function AnimatedSearchPlaceholder({ fontSize = 16 }: Props) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);

  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    const tick = () => {
      // Phase 1: slide up + fade out current word
      opacity.value = withTiming(0, {
        duration: FADE_OUT_MS,
        easing: Easing.in(Easing.quad),
      });
      translateY.value = withTiming(-12, {
        duration: FADE_OUT_MS,
        easing: Easing.in(Easing.quad),
      });

      // Phase 2: swap word & slide in from below
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % SUFFIXES.length);
        translateY.value = 12;
        opacity.value = withTiming(1, {
          duration: FADE_IN_MS,
          easing: Easing.out(Easing.cubic),
        });
        translateY.value = withTiming(0, {
          duration: FADE_IN_MS,
          easing: Easing.out(Easing.cubic),
        });
      }, FADE_OUT_MS);
    };

    const interval = setInterval(tick, CYCLE_MS);
    return () => clearInterval(interval);
  }, [opacity, translateY]);

  return (
    <View style={styles.row} pointerEvents="none">
      <Animated.Text
        style={[styles.text, { color: colors.textTertiary, fontSize }]}
        numberOfLines={1}
      >
        {PREFIX}
      </Animated.Text>
      <View style={styles.suffixWrapper}>
        <Animated.Text
          style={[styles.text, { color: colors.textTertiary, fontSize }, animatedStyle]}
          numberOfLines={1}
        >
          {SUFFIXES[index]}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    overflow: 'hidden',
  },
  suffixWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  text: {
    fontFamily: 'Inter-Regular',
  },
});
