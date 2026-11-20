/**
 * Entry shimmer timing: every time a screen gains focus (bottom-tab switch,
 * stack push, back to it) its skeleton shows for a short beat, then the real
 * content fades in. Navigation is never blocked — the content renders
 * underneath the whole time; this only drives an overlay (ScreenShimmer).
 *
 * Starts `true` on mount so the first frame is already the skeleton. It is
 * re-armed on BLUR (after the covering transition), not on focus: the
 * skeleton is already in place while the screen is hidden, so a return (back
 * button, back swipe, tab switch) reveals skeleton → content and never
 * content → skeleton. The beat starts on focus. Ordinary re-renders never
 * retrigger it.
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

/**
 * Delay between blur and arming. A stack push slides the new screen over this
 * one for ~350 ms; arming instantly would flip the still-visible outgoing
 * screen to its skeleton. After this delay the screen is fully covered.
 */
export const ENTRY_SHIMMER_ARM_DELAY_MS = 450;

/** `visible` is true while the skeleton should cover the screen. */
export function useEntryShimmer(durationMs: number = ENTRY_SHIMMER_MS): EntryShimmer {
  const reduceMotion = useReduceMotion();
  const [visible, setVisibleState] = useState(durationMs > 0);
  const visibleRef = useRef(visible);
  const setVisible = useCallback((v: boolean) => {
    visibleRef.current = v;
    setVisibleState(v);
  }, []);
  const durationRef = useRef(entryShimmerDuration(reduceMotion, durationMs));
  durationRef.current = entryShimmerDuration(reduceMotion, durationMs);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (armTimer.current) {
        clearTimeout(armTimer.current);
        armTimer.current = null;
      }
      const ms = durationRef.current;
      if (ms <= 0) {
        setVisible(false);
        return undefined;
      }
      // Never switch a visible screen from content to skeleton: only a
      // skeleton that is already up (first mount, or armed while covered)
      // runs its beat. A return faster than the arm delay just shows content.
      const t = visibleRef.current ? setTimeout(() => setVisible(false), ms) : null;
      return () => {
        if (t) clearTimeout(t);
        // Blur: arm once the next screen fully covers this one.
        armTimer.current = setTimeout(() => {
          armTimer.current = null;
          setVisible(true);
        }, ENTRY_SHIMMER_ARM_DELAY_MS);
      };
    }, [setVisible]),
  );

  return { visible, reduceMotion };
}
