/**
 * Stamp motion (spec 5.6b): the badge art drops onto the card, overshoots a little, and the ink
 * appears. Reanimated 4 + expo-haptics, both already in the binary.
 *
 * WORKLET RULE: every helper called inside useAnimatedStyle carries 'worklet' as its first
 * statement (see components/DeckCardSwiper.tsx). Without it the release build crashes with
 * "Object is not a function" on the UI runtime, and neither lint nor bundling notices.
 *
 * Reduced motion: no movement; the impact callback (haptic) still fires once after 150 ms.
 */
import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

export const STAMP_TIMING = { dropMs: 420, settleMs: 180, inkMs: 260 } as const;

/** Where the drop ends inside the 0..1 progress (drop, then settle). */
const IMPACT = STAMP_TIMING.dropMs / (STAMP_TIMING.dropMs + STAMP_TIMING.settleMs);
const DROP_FROM = -120;
const OVERSHOOT = 8;
const START_SCALE = 1.25;
export const REDUCED_IMPACT_MS = 150;

/** Vertical offset: −120 → 0 (accelerating), then a small overshoot below and back to 0. */
export function stampDropY(progress: number): number {
  'worklet';
  const p = Math.min(1, Math.max(0, progress));
  if (p <= IMPACT) {
    const t = p / IMPACT;
    return DROP_FROM * (1 - t * t);
  }
  const s = (p - IMPACT) / (1 - IMPACT);
  if (s >= 1) return 0;
  return OVERSHOOT * Math.sin(Math.PI * s) * (1 - s);
}

/** Scale: 1.25 → 1 at impact, then stays 1. */
export function stampScale(progress: number): number {
  'worklet';
  const p = Math.min(1, Math.max(0, progress));
  if (p >= IMPACT) return 1;
  return START_SCALE - (START_SCALE - 1) * (p / IMPACT);
}

const STATIC_CARD = {};
const STATIC_INK = { opacity: 1 };

/**
 * Plays once when `play` turns true. `onImpact` fires once per mount, at the moment the stamp lands
 * (after 150 ms with reduced motion).
 */
export function useStampAnimation(opts: { play: boolean; onImpact(): void }): {
  cardStyle: object;
  inkStyle: object;
  reduced: boolean;
} {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const ink = useSharedValue(0);
  const fired = useRef(false);
  const onImpact = useRef(opts.onImpact);

  useEffect(() => {
    onImpact.current = opts.onImpact;
  }, [opts.onImpact]);

  useEffect(() => {
    if (!opts.play || fired.current) return;
    if (!reduced) {
      progress.value = withTiming(1, { duration: STAMP_TIMING.dropMs + STAMP_TIMING.settleMs, easing: Easing.linear });
      ink.value = withDelay(STAMP_TIMING.dropMs, withTiming(1, { duration: STAMP_TIMING.inkMs }));
    }
    const timer = setTimeout(
      () => {
        if (fired.current) return;
        fired.current = true;
        onImpact.current();
      },
      reduced ? REDUCED_IMPACT_MS : STAMP_TIMING.dropMs,
    );
    return () => clearTimeout(timer);
  }, [opts.play, reduced, progress, ink]);

  const animatedCard = useAnimatedStyle(() => ({
    transform: [{ translateY: stampDropY(progress.value) }, { scale: stampScale(progress.value) }],
  }));
  const animatedInk = useAnimatedStyle(() => ({ opacity: ink.value }));

  return reduced ? { cardStyle: STATIC_CARD, inkStyle: STATIC_INK, reduced: true } : { cardStyle: animatedCard, inkStyle: animatedInk, reduced: false };
}

/** The success haptic of a stamp; never throws (no haptic engine, web, simulator). */
export async function stampHaptic(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // no haptics on this device
  }
}
