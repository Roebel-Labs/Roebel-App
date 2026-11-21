import React, { useEffect, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Canvas, Group, Picture, Rect, Shader, Skia, type SkPicture, type SkRuntimeEffect } from '@shopify/react-native-skia';
import Animated, {
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { CARD_RADIUS, SHINE_SKSL, designSize, drawHeight, type CardDesign, type FieldValues, type RenderMode } from '@roebel/card-design';
import { useTheme } from '@/context/ThemeContext';
import { useCardSkiaState } from '@/lib/card-design/skia';
import { useDesignImages } from '@/lib/card-design/assets';
import { BASELINE_TAU, REST_PHASE, TILT_TAU, approach, recordDesign, tiltFromGravity } from '@/lib/card-design/record';

type Props = {
  design: CardDesign;
  width: number;
  mode: RenderMode;
  values?: FieldValues;
  /** 'tilt': the foil and the card follow the phone (only while the screen is focused); 'static': drawn once. */
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

/** How far the card leans against the phone's tilt, degrees at full tilt (Apple TV-style). */
const LEAN_DEG = 7;
/** The card lifts a touch towards the viewer while it is tilted. */
const LIFT = 0.012;
/** Back to rest when the card stops following the phone. */
const REST_SPRING = { damping: 18, stiffness: 170, mass: 0.7 } as const;
/** CoreMotion's gravity points the other way round than Android's TYPE_GRAVITY. */
const GRAVITY_SIGN = Platform.OS === 'ios' ? -1 : 1;

/** One compiled foil effect for every card (a Skia host object: only ever passed as a plain prop). */
let shineEffect: SkRuntimeEffect | null | undefined;
function getShineEffect(): SkRuntimeEffect | null {
  if (shineEffect === undefined) {
    try {
      shineEffect = Skia.RuntimeEffect.Make(SHINE_SKSL);
    } catch {
      shineEffect = null;
    }
  }
  return shineEffect;
}

/**
 * Reads the fused gravity sensor on the UI thread and writes a smoothed tilt into `x`/`y` every
 * frame. Mounted only while the card follows the phone, so the sensor runs only then.
 */
function TiltDriver({ x, y }: { x: SharedValue<number>; y: SharedValue<number> }) {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' });
  // Resting pose (unit gravity x/y); NaN until the first sample.
  const baseX = useSharedValue(NaN);
  const baseY = useSharedValue(NaN);

  useFrameCallback((frame) => {
    'worklet';
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    const g = gravity.sensor.value;
    const len = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    if (!(len > 1)) return; // no sample yet
    const nx = g.x / len;
    const ny = g.y / len;
    if (Number.isNaN(baseX.value)) {
      baseX.value = nx;
      baseY.value = ny;
    }
    // The resting pose follows a new way of holding the phone slowly; the tilt itself is fast.
    const kb = approach(dt, BASELINE_TAU);
    baseX.value += (nx - baseX.value) * kb;
    baseY.value += (ny - baseY.value) * kb;
    const t = tiltFromGravity(nx, ny, baseX.value, baseY.value, GRAVITY_SIGN);
    const k = approach(dt, TILT_TAU);
    x.value += (t.x - x.value) * k;
    y.value += (t.y - y.value) * k;
  });

  useEffect(
    () => () => {
      x.value = withSpring(0, REST_SPRING);
      y.value = withSpring(0, REST_SPRING);
    },
    [x, y],
  );
  return null;
}

/**
 * A card drawn from its design with Skia. Missing images are left out and fetched again on the
 * next focus; while the fonts load, a quiet placeholder of the card's shape is shown.
 *
 * Tilting cards: the design is recorded ONCE without its card-wide foil; the foil is the same
 * SHINE_SKSL drawn live on top, its uniforms fed from the gravity sensor on the UI thread. So the
 * light follows the hand at the display's frame rate with no JS work per frame (before: a picture
 * re-recorded on the JS thread per tilt step).
 */
export default function DesignedCard({ design, width, mode, values, animate = 'static', lean = true, style, accessibilityLabel, fallback }: Props) {
  const { colors } = useTheme();
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const { skia } = useCardSkiaState();
  const images = useDesignImages(design, focused);
  const height = drawHeight(design, width);
  const radius = design.format === 'stamp' ? width / 2 : (CARD_RADIUS * width) / designSize(design.format).w;
  const tiltCard = animate === 'tilt';
  const effect = tiltCard && design.shine.enabled && design.shine.intensity > 0 ? getShineEffect() : null;
  // Live foil only when the shader compiled; otherwise the foil stays in the recorded picture.
  const liveFoil = !!effect;
  const tilting = tiltCard && focused && !reduced;

  // Skia host objects reach Skia only as plain React props (never via shared values or worklet
  // closures: a JS-created SkPicture arrives EMPTY on the UI thread → "Invalid prop value for
  // SkTextBlob" outside every error boundary, Pixel 2026-11-20).
  const still = useMemo<SkPicture | null>(() => {
    if (!skia) return null;
    return recordDesign<SkPicture>(Skia, skia.api, design, {
      width, mode, values, images, fonts: skia.fonts, shinePhase: REST_PHASE, reducedMotion: !!reduced, cardShine: !liveFoil,
    });
  }, [skia, design, width, mode, values, images, reduced, liveFoil]);
  const clip = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, 0, width, height), radius, radius), [width, height, radius]);

  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const intensity = reduced ? 0 : design.shine.intensity;
  const uniforms = useDerivedValue(() => {
    const x = tiltX.value;
    const y = tiltY.value;
    return {
      phase: Math.max(0, Math.min(1, REST_PHASE + x * 0.3 + y * 0.2)),
      tilt: [x, y],
      intensity,
      size: [width, height],
    };
  });

  const leanStyle = useAnimatedStyle(() => {
    const x = tiltX.value;
    const y = tiltY.value;
    const amount = Math.min(1, Math.sqrt(x * x + y * y));
    return {
      transform: [
        { perspective: 900 },
        { rotateY: `${-x * LEAN_DEG}deg` },
        { rotateX: `${y * LEAN_DEG}deg` },
        { scale: 1 + amount * LIFT },
      ],
    };
  });

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius }, style, tiltCard && lean ? leanStyle : null]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="designed-card"
    >
      {tilting ? <TiltDriver x={tiltX} y={tiltY} /> : null}
      {still ? (
        <Canvas style={{ width, height }}>
          <Picture picture={still} />
          {effect ? (
            <Group clip={clip}>
              <Rect x={0} y={0} width={width} height={height}>
                <Shader source={effect} uniforms={uniforms} />
              </Rect>
            </Group>
          ) : null}
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
