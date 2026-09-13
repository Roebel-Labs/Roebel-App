import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const COIN = require('../../assets/illustration/gamification/single.png');

export const BURST_STAGGER_MS = 90;
export const BURST_DURATION_MS = 640;
const MAX_COINS = 5;
const COIN_SIZE = 24;

type Props = {
  count: number;
  onDone: () => void;
};

/**
 * Coins that pop up from the button, flip once and a half, and fade.
 * Absolutely positioned over the button's top edge; pointer-events off.
 */
export default function CoinFlipBurst({ count, onDone }: Props) {
  const n = Math.min(Math.max(count, 1), MAX_COINS);

  useEffect(() => {
    const id = setTimeout(onDone, BURST_STAGGER_MS * (n - 1) + BURST_DURATION_MS + 60);
    return () => clearTimeout(id);
  }, [n, onDone]);

  return (
    <View pointerEvents="none" style={styles.layer}>
      {Array.from({ length: n }, (_, i) => (
        <CoinSprite key={i} index={i} total={n} />
      ))}
    </View>
  );
}

function CoinSprite({ index, total }: { index: number; total: number }) {
  const progress = useSharedValue(0);
  const spreadX = (index - (total - 1) / 2) * 16;

  useEffect(() => {
    progress.set(
      withDelay(index * BURST_STAGGER_MS, withTiming(1, { duration: BURST_DURATION_MS, easing: Easing.out(Easing.cubic) })),
    );
  }, [index, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const rise = interpolate(p, [0, 0.6, 1], [0, -56, -44], Extrapolation.CLAMP);
    const scale = interpolate(p, [0, 0.4, 1], [0.5, 1, 0.8], Extrapolation.CLAMP);
    const opacity = interpolate(p, [0, 0.05, 0.65, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [
        { perspective: 500 },
        { translateX: spreadX },
        { translateY: rise },
        { rotateY: `${p * 540}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.sprite, style]}>
      <Image source={COIN} style={styles.coin} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 0,
    alignItems: 'center',
    overflow: 'visible',
  },
  sprite: {
    position: 'absolute',
    top: -COIN_SIZE / 2,
    width: COIN_SIZE,
    height: COIN_SIZE,
  },
  coin: {
    width: COIN_SIZE,
    height: COIN_SIZE,
  },
});
