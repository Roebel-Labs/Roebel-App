import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { HeartFilledIcon } from '@/components/Icons';

/** Hearts float as the app's own filled heart icon (no emoji heart). */
const HEART_RED = '#FF3040';

export type FloatingReactionsHandle = { spawn: (emoji: string, own?: boolean) => void };

type Floater = { id: number; emoji: string; drift: number; size: number; duration: number; own: boolean };

const MAX_CONCURRENT = 20;
let nextId = 1;

/** Horizontal sway over the rise (0..1 progress). */
function sway(progress: number, drift: number): number {
  'worklet';
  return Math.sin(progress * Math.PI * 2.2) * 10 + drift * progress;
}

/** Fades in fast, holds, fades out near the top. */
function fadeFor(progress: number): number {
  'worklet';
  if (progress < 0.08) return progress / 0.08;
  if (progress > 0.72) return Math.max(0, (1 - progress) / 0.28);
  return 1;
}

function FloatingEmoji({ f, height }: { f: Floater; height: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: f.duration, easing: Easing.out(Easing.quad) });
  }, [p, f.duration]);
  const style = useAnimatedStyle(() => ({
    opacity: fadeFor(p.value),
    transform: [
      { translateY: -p.value * height },
      { translateX: sway(p.value, f.drift) },
      { scale: 0.6 + Math.min(1, p.value * 5) * 0.4 },
    ],
  }));
  return (
    <Animated.View style={[styles.floater, style]}>
      {f.emoji === '❤️' ? <HeartFilledIcon size={f.size + 4} color={HEART_RED} /> : <Text style={{ fontSize: f.size }}>{f.emoji}</Text>}
    </Animated.View>
  );
}

/** Emoji rising along the right edge of the video. Capped at 20 concurrent animations. */
const FloatingReactions = forwardRef<FloatingReactionsHandle, { height: number }>(function FloatingReactions({ height }, ref) {
  const [items, setItems] = useState<Floater[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const set = timers.current;
    return () => { set.forEach(clearTimeout); set.clear(); };
  }, []);

  const spawn = useCallback((emoji: string, own = false) => {
    const f: Floater = {
      id: nextId++,
      emoji,
      own,
      drift: (Math.random() - 0.5) * 36,
      size: own ? 30 : 22 + Math.random() * 6,
      duration: 2200 + Math.random() * 900,
    };
    setItems((cur) => {
      // Over the cap: drop received ones first, the user's own taps always show.
      if (cur.length >= MAX_CONCURRENT && !own) return cur;
      const next = cur.length >= MAX_CONCURRENT ? cur.slice(1) : cur;
      return [...next, f];
    });
    const t = setTimeout(() => {
      timers.current.delete(t);
      setItems((cur) => cur.filter((x) => x.id !== f.id));
    }, f.duration + 50);
    timers.current.add(t);
  }, []);

  useImperativeHandle(ref, () => ({ spawn }), [spawn]);

  return (
    <View pointerEvents="none" style={[styles.layer, { height }]}>
      {items.map((f) => <FloatingEmoji key={f.id} f={f} height={height * 0.85} />)}
    </View>
  );
});

export default FloatingReactions;

const styles = StyleSheet.create({
  layer: { position: 'absolute', right: 6, bottom: 0, width: 72, overflow: 'visible' },
  floater: { position: 'absolute', bottom: 8, right: 18 },
});
