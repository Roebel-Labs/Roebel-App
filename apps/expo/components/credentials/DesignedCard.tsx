import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { DeviceMotion } from 'expo-sensors';
import { CARD_RADIUS, designSize, drawHeight, type CardDesign, type FieldValues, type RenderMode } from '@roebel/card-design';
import { useTheme } from '@/context/ThemeContext';
import { useCardSkia } from '@/lib/card-design/skia';
import { useDesignImages } from '@/lib/card-design/assets';
import { REST_PHASE, nextTilt, phaseForTilt, recordDesign, tiltMoved, type Tilt } from '@/lib/card-design/record';

type Props = {
  design: CardDesign;
  width: number;
  mode: RenderMode;
  values?: FieldValues;
  /** 'tilt': the sheen follows the phone (only while the screen is focused); 'static': drawn once. */
  animate?: 'tilt' | 'static';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Sensor interval (ms): 60 Hz. */
const MOTION_INTERVAL = 16;

/**
 * A card drawn from its design with Skia. Missing images are left out and fetched again on the
 * next focus; while the fonts load, a quiet placeholder of the card's shape is shown.
 */
export default function DesignedCard({ design, width, mode, values, animate = 'static', style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const skia = useCardSkia();
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
  const picture = useSharedValue<SkPicture | null>(still);
  useEffect(() => {
    if (still) picture.value = still;
  }, [still, picture]);
  const stillRef = useRef(still);
  stillRef.current = still;

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!tilting) return;
    let tilt: Tilt = { x: 0, y: 0 };
    let drawn: Tilt = tilt;
    let baseline: number | null = null;
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const d = drawRef.current;
      if (!d || !tiltMoved(tilt, drawn)) return;
      drawn = tilt;
      const pic = d(tilt, phaseForTilt(tilt));
      if (pic) picture.value = pic;
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
      // Back to the resting sheen when the card stops following the phone.
      if (stillRef.current) picture.value = stillRef.current;
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
          <Picture picture={animate === 'tilt' ? (picture as unknown as SkPicture) : still} />
        </Canvas>
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
