/**
 * Entry shimmer timing: every time a screen gains focus (bottom-tab switch,
 * stack push, back to it) its skeleton shows for a short beat, then the real
 * content fades in. Navigation is never blocked — the content renders
 * underneath the whole time; this only drives an overlay (ScreenShimmer).
 *
 * Starts `true` on mount so the first frame is already the skeleton, and
 * only re-arms on focus — ordinary re-renders never retrigger it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useFocusEffect } from 'expo-router';

export const ENTRY_SHIMMER_MS = 300;
export const ENTRY_SHIMMER_REDUCED_MS = 150;

/** Pure: how long the skeleton stays up. Reduced motion gets a shorter, static beat. */
export function entryShimmerDuration(reduceMotion: boolean, base: number = ENTRY_SHIMMER_MS): number {
  if (base <= 0) return 0;
  return reduceMotion ? Math.min(base, ENTRY_SHIMMER_REDUCED_MS) : base;
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduce(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export type EntryShimmer = { visible: boolean; reduceMotion: boolean };

/** `visible` is true while the skeleton should cover the screen. */
export function useEntryShimmer(durationMs: number = ENTRY_SHIMMER_MS): EntryShimmer {
  const reduceMotion = useReduceMotion();
  const [visible, setVisible] = useState(durationMs > 0);
  const durationRef = useRef(entryShimmerDuration(reduceMotion, durationMs));
  durationRef.current = entryShimmerDuration(reduceMotion, durationMs);

  useFocusEffect(
    useCallback(() => {
      const ms = durationRef.current;
      if (ms <= 0) {
        setVisible(false);
        return undefined;
      }
      setVisible(true);
      const t = setTimeout(() => setVisible(false), ms);
      return () => clearTimeout(t);
    }, []),
  );

  return { visible, reduceMotion };
}
