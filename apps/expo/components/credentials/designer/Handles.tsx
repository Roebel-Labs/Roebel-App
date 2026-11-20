/**
 * Selection frame of the selected layer, drawn over the card: the rotated box, plus a corner knob
 * that scales and rotates with one finger (for when two fingers do not fit on a small layer).
 * The knob has a 12 pt hit slop so it stays reachable on tiny layers.
 */
import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Layer } from '@roebel/card-design';
import { useTheme } from '@/context/ThemeContext';
import type { EditorAction } from '@/lib/card-design/editor-state';

const KNOB = 22;
export const HANDLE_HIT_SLOP = 12;

export default function Handles({ layer, scale, dispatch }: { layer: Layer; scale: number; dispatch: (a: EditorAction) => void }) {
  const { colors } = useTheme();
  const left = layer.x * scale, top = layer.y * scale, w = layer.w * scale, h = layer.h * scale;
  const start = useRef<{ dist: number; angle: number; vx: number; vy: number } | null>(null);
  const id = layer.id;
  // Vector from the layer's centre to the knob (bottom-right corner), rotated with the layer, in
  // screen points: the knob's drag adds the finger's translation to it.
  const rad = (layer.rotation * Math.PI) / 180;
  const geom = useRef({ cx: 0, cy: 0 });
  geom.current = { cx: (w / 2) * Math.cos(rad) - (h / 2) * Math.sin(rad), cy: (w / 2) * Math.sin(rad) + (h / 2) * Math.cos(rad) };

  const knob = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .hitSlop(HANDLE_HIT_SLOP)
        .onStart(() => {
          const { cx: dx, cy: dy } = geom.current;
          start.current = { dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx), vx: dx, vy: dy };
          dispatch({ type: 'gestureStart' });
        })
        .onUpdate((e) => {
          const s = start.current;
          if (!s || s.dist === 0) return;
          // From the vector at gesture start (the live layer changes under the finger).
          const dx = s.vx + e.translationX, dy = s.vy + e.translationY;
          const scaleBy = Math.hypot(dx, dy) / s.dist;
          const rotation = ((Math.atan2(dy, dx) - s.angle) * 180) / Math.PI;
          dispatch({ type: 'pinch', id, scale: scaleBy, rotation });
        })
        .onFinalize(() => {
          if (!start.current) return;
          start.current = null;
          dispatch({ type: 'gestureEnd' });
        }),
    [dispatch, id],
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.frame, { left, top, width: w, height: h, borderColor: colors.primary, transform: [{ rotate: `${layer.rotation}deg` }] }]}
    >
      <GestureDetector gesture={knob}>
        <View
          style={[styles.knob, { backgroundColor: colors.background, borderColor: colors.primary }]}
          accessibilityRole="adjustable"
          accessibilityLabel="Größe und Drehung ändern"
        />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed' },
  knob: {
    position: 'absolute',
    right: -KNOB / 2,
    bottom: -KNOB / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 2,
  },
});
