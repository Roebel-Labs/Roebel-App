import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { DeviceMotion } from 'expo-sensors';
import { CARD_RADIUS, designSize, drawHeight, type CardDesign, type FieldValues, type RenderMode } from '@roebel/card-design';
import { useTheme } from '@/context/ThemeContext';
import { useCardSkiaState } from '@/lib/card-design/skia';
import { useDesignImages } from '@/lib/card-design/assets';
import { REST_PHASE, nextTilt, phaseForTilt, quantiseTilt, recordDesign, sameTilt, type Tilt } from '@/lib/card-design/record';

type Props = {
  design: CardDesign;
  width: number;
  mode: RenderMode;
  values?: FieldValues;
  /** 'tilt': the sheen follows the phone (only while the screen is focused); 'static': drawn once. */
  animate?: 'tilt' | 'static';
  /**
   * With 'tilt': the card also leans a few degrees against the phone (default). Off where touch
   * targets sit on the card (the designer's editing surface) so they stay aligned.
   */
  lean?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Shown instead while the fonts load and when Skia cannot draw this card (fonts failed, nothing recorded). */
  fallback?: ReactNode;
};

/** How far the card leans against the phone's tilt, degrees at full tilt. */
const LEAN_DEG = 5;
const LEAN_TIMING = { duration: 120, easing: Easing.out(Easing.quad) } as const;

/** Sensor interval (ms): 60 Hz. */
const MOTION_INTERVAL = 16;

type Disposable = { dispose?: () => void };
/** Frees a picture two frames later: the UI thread may still be drawing it right now. */
function disposeLater(p: unknown) {
  const d = p as Disposable | null;
  if (!d || typeof d.dispose !== 'function') return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      d.dispose!();
    } catch {
      // Already gone.
    }
  }));
}

/**
 * A card drawn from its design with Skia. Missing images are left out and fetched again on the
 * next focus; while the fonts load, a quiet placeholder of the card's shape is shown.
 */
export default function DesignedCard({ design, width, mode, values, animate = 'static', lean = true, style, accessibilityLabel, fallback }: Props) {
  const { colors } = useTheme();
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const { skia, failed } = useCardSkiaState();
  const images = useDesignImages(design, focused);
  const height = drawHeight(design, width);
  const radius = design.format === 'stamp' ? width / 2 : (CARD_RADIUS * width) / designSize(design.format).w;
  const tilting = animate === 'tilt' && focused && !reduced;

  const draw = useMemo(() => {
    if (!skia) return null;
    return (tilt: Tilt | undefined, phase: number) =>
      recordDesign<SkPicture>(Skia, skia.api, design, {
        width, mode, values, images, fonts: skia.fonts, shinePhase: phase, tilt, reducedMotion: !!reduced,
      });
  }, [skia, design, width, mode, values, images, reduced]);

  // The resting picture: what static cards show, and where a tilting card starts and returns to.
  const still = useMemo(() => (draw ? draw(undefined, REST_PHASE) : null), [draw]);
  // The tilting picture lives in React STATE and reaches Skia as a plain prop. Never through a
  // Reanimated shared value: Skia replays drawings on the UI thread, and an SkPicture created on
  // the JS thread arrives there EMPTY → drawPicture throws "Invalid prop value for SkTextBlob"
  // (Skia's message for a non-object picture) outside every error boundary — the app died on
  // every credential sheet / quick navigation (Pixel 2026-11-20). Also never capture a Skia
  // object in a worklet closure, and never free a picture in an effect CLEANUP (a screen hidden
  // by a tab switch runs cleanups but keeps state, then draws the freed picture on return).
  const [tiltPicture, setTiltPicture] = useState<SkPicture | null>(null);
  // Free a replaced tilt picture only AFTER the commit that stopped drawing it (Skia redraws in
  // the commit itself, so by this effect the new picture is on screen).
  const shownTiltRef = useRef<SkPicture | null>(null);
  useEffect(() => {
    const old = shownTiltRef.current;
    shownTiltRef.current = tiltPicture;
    if (old && old !== tiltPicture) disposeLater(old);
  }, [tiltPicture]);

  // The card itself leans a few degrees against the phone's tilt (plain numbers on the UI thread).
  const leanX = useSharedValue(0);
  const leanY = useSharedValue(0);
  const leanStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateY: `${-leanX.value * LEAN_DEG}deg` },
      { rotateX: `${leanY.value * LEAN_DEG}deg` },
    ],
  }));

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!tilting) return;
    let tilt: Tilt = { x: 0, y: 0 };
    let drawn: Tilt = tilt;
    let baseline: number | null = null;
    let frame: number | null = null;
    let alive = true;
    const flush = () => {
      frame = null;
      if (!alive) return;
      leanX.value = withTiming(tilt.x, LEAN_TIMING);
      leanY.value = withTiming(tilt.y, LEAN_TIMING);
      const d = drawRef.current;
      // Quantised: sensor noise while the phone is held still no longer redraws every frame.
      const q = quantiseTilt(tilt);
      if (!d || sameTilt(q, drawn)) return;
      drawn = q;
      const pic = d(q, phaseForTilt(q));
      if (pic) setTiltPicture(pic);
    };
    DeviceMotion.setUpdateInterval(MOTION_INTERVAL);
    const sub = DeviceMotion.addListener((m) => {
      const r = m.rotation;
      if (!r) return;
      if (baseline === null) baseline = r.beta;
      tilt = nextTilt(tilt, r, baseline);
      if (frame === null) frame = requestAnimationFrame(flush);
    });
    return () => {
      alive = false;
      sub.remove();
      if (frame !== null) cancelAnimationFrame(frame);
      // Back to the resting picture and a flat card when the card stops following the phone.
      setTiltPicture(null);
      leanX.value = withTiming(0, LEAN_TIMING);
      leanY.value = withTiming(0, LEAN_TIMING);
    };
  }, [tilting, leanX, leanY]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius }, style, animate === 'tilt' && lean ? leanStyle : null]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="designed-card"
    >
      {still ? (
        <Canvas style={{ width, height }}>
          {/* A plain SkPicture prop only: the tilt frame while tilting, else the resting one. */}
          <Picture picture={(animate === 'tilt' && tiltPicture) || still} />
        </Canvas>
      ) : fallback ? (
        fallback
      ) : (
        <View style={[styles.placeholder, { width, height, borderRadius: radius, backgroundColor: colors.surface }]} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    overflow: 'hidden',
  },
});
