import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
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
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Shown instead while the fonts load and when Skia cannot draw this card (fonts failed, nothing recorded). */
  fallback?: ReactNode;
};

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
export default function DesignedCard({ design, width, mode, values, animate = 'static', style, accessibilityLabel, fallback }: Props) {
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
  // A resting picture that is replaced (new design, size, images) is freed.
  useEffect(() => () => disposeLater(still), [still]);
  // The tilting picture. The Canvas reads it ONLY while `live` (it then always holds a real
  // picture); otherwise it draws `still` directly. Never derive it in a worklet that captures
  // `still`: a Skia object copied into a worklet closure arrives as an invalid value and
  // drawPicture crashes the app outside every error boundary (Pixel 2026-11-20, profile).
  const picture = useSharedValue<SkPicture | null>(null);
  const [live, setLive] = useState(false);
  // The picture currently held by `picture`. Freed only when it is replaced by a newer tilt
  // picture or the card unmounts — never on tilt stop, when the Canvas may still draw it for a
  // frame or two before the re-render to `still` lands.
  const heldRef = useRef<SkPicture | null>(null);
  useEffect(
    () => () => {
      disposeLater(heldRef.current);
      heldRef.current = null;
    },
    [],
  );

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!tilting) return;
    let tilt: Tilt = { x: 0, y: 0 };
    let drawn: Tilt = tilt;
    let baseline: number | null = null;
    let frame: number | null = null;
    let started = false;
    const flush = () => {
      frame = null;
      const d = drawRef.current;
      // Quantised: sensor noise while the phone is held still no longer redraws every frame.
      const q = quantiseTilt(tilt);
      if (!d || sameTilt(q, drawn)) return;
      drawn = q;
      const pic = d(q, phaseForTilt(q));
      if (!pic) return;
      const old = heldRef.current;
      heldRef.current = pic;
      picture.value = pic;
      if (!started) {
        started = true;
        setLive(true);
      }
      disposeLater(old);
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
      sub.remove();
      if (frame !== null) cancelAnimationFrame(frame);
      // Back to the resting sheen when the card stops following the phone. The last tilt picture
      // stays held (see heldRef) so the Canvas can never draw a freed picture.
      setLive(false);
    };
  }, [tilting, picture]);

  return (
    <View
      style={[{ width, height, borderRadius: radius }, style]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="designed-card"
    >
      {still ? (
        <Canvas style={{ width, height }}>
          {/* Only the tilting card reads the shared value; the others keep their one picture. */}
          <Picture picture={animate === 'tilt' && live ? (picture as unknown as SkPicture) : still} />
        </Canvas>
      ) : fallback ? (
        fallback
      ) : (
        <View style={[styles.placeholder, { width, height, borderRadius: radius, backgroundColor: colors.surface }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    overflow: 'hidden',
  },
});
