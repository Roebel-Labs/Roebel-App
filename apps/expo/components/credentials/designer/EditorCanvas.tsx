/**
 * The editable card: the design drawn with Skia, plus touch handling — tap selects (hitTest), one
 * finger drags the selected layer (snapping to card edges, centre lines and other layers), two
 * fingers pinch to scale and twist to rotate. Gesture callbacks run on the JS thread (the design
 * lives in React state); a whole gesture is one undo step.
 */
import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { designSize, hitTest, snap, updateLayer, type CardDesign, type FieldValues } from '@roebel/card-design';
import DesignedCard from '@/components/credentials/DesignedCard';
import { snapTargets, type EditorAction } from '@/lib/card-design/editor-state';
import Handles from './Handles';

type Props = {
  design: CardDesign;
  selected: string | null;
  width: number;
  values?: FieldValues;
  dispatch: (a: EditorAction) => void;
  /** A finger is on the card (the screen stops scrolling meanwhile). */
  onTouching?: (touching: boolean) => void;
};

/** Snap tolerance in screen points (converted to card units). */
const SNAP_PT = 6;

export default function EditorCanvas({ design, selected, width, values, dispatch, onTouching }: Props) {
  const { w: W, h: H } = designSize(design.format);
  const k = width / W;
  const height = H * k;

  // Gestures read the latest props through refs (they are built once per size).
  const latest = useRef({ design, selected });
  latest.current = { design, selected };
  const twoFinger = useRef({ active: 0, scale: 1, rotation: 0, id: null as string | null });
  const pan = useRef<{ id: string; x: number; y: number } | null>(null);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        dispatch({ type: 'select', id: hitTest(latest.current.design, e.x / k, e.y / k) });
      });

    const drag = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onStart((e) => {
        const { design: d, selected: sel } = latest.current;
        // Drag the touched layer; touching empty card drags the selected one.
        const hit = hitTest(d, (e.x - e.translationX) / k, (e.y - e.translationY) / k);
        const id = hit ?? sel;
        const layer = id ? d.layers.find((l) => l.id === id) : undefined;
        if (!layer) return;
        if (id !== sel) dispatch({ type: 'select', id });
        pan.current = { id: layer.id, x: layer.x, y: layer.y };
        dispatch({ type: 'gestureStart' });
      })
      .onUpdate((e) => {
        const p = pan.current;
        if (!p) return;
        dispatch({
          type: 'gestureMove',
          fn: (base) => {
            const layer = base.layers.find((l) => l.id === p.id);
            if (!layer) return base;
            const { xs, ys } = snapTargets(base, p.id);
            const tol = SNAP_PT / k;
            const nx = snapEdges(p.x + e.translationX / k, layer.w, xs, tol);
            const ny = snapEdges(p.y + e.translationY / k, layer.h, ys, tol);
            return updateLayer(base, p.id, { x: nx, y: ny });
          },
        });
      })
      .onFinalize(() => {
        if (!pan.current) return;
        pan.current = null;
        dispatch({ type: 'gestureEnd' });
      });

    const startTwo = () => {
      const t = twoFinger.current;
      if (t.active === 0) {
        t.id = latest.current.selected;
        t.scale = 1;
        t.rotation = 0;
        if (t.id) dispatch({ type: 'gestureStart' });
      }
      t.active += 1;
    };
    const endTwo = () => {
      const t = twoFinger.current;
      t.active = Math.max(0, t.active - 1);
      if (t.active === 0 && t.id) {
        t.id = null;
        dispatch({ type: 'gestureEnd' });
      }
    };
    const updateTwo = () => {
      const t = twoFinger.current;
      if (t.id) dispatch({ type: 'pinch', id: t.id, scale: t.scale, rotation: t.rotation });
    };

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(startTwo)
      .onUpdate((e) => { twoFinger.current.scale = e.scale; updateTwo(); })
      .onFinalize(endTwo);
    const rotate = Gesture.Rotation()
      .runOnJS(true)
      .onStart(startTwo)
      .onUpdate((e) => { twoFinger.current.rotation = (e.rotation * 180) / Math.PI; updateTwo(); })
      .onFinalize(endTwo);

    return Gesture.Simultaneous(Gesture.Exclusive(drag, tap), pinch, rotate);
  }, [k, dispatch]);

  const layer = selected ? design.layers.find((l) => l.id === selected) ?? null : null;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.wrap, { width, height }]}
        collapsable={false}
        onTouchStart={() => onTouching?.(true)}
        onTouchEnd={() => onTouching?.(false)}
        onTouchCancel={() => onTouching?.(false)}
      >
        <DesignedCard design={design} width={width} mode="preview" values={values} animate="static" />
        {layer ? <Handles layer={layer} scale={k} dispatch={dispatch} /> : null}
      </View>
    </GestureDetector>
  );
}

/** Snaps a box's left edge, centre or right edge (whichever is nearest a target) — returns the new start. */
function snapEdges(start: number, size: number, targets: number[], tol: number): number {
  const candidates = [
    { at: start, off: 0 },
    { at: start + size / 2, off: size / 2 },
    { at: start + size, off: size },
  ];
  let best = start, bestDist = Infinity;
  for (const c of candidates) {
    const s = snap(c.at, targets, tol);
    const d = Math.abs(s - c.at);
    if (s !== c.at && d < bestDist) { best = s - c.off; bestDist = d; }
  }
  return best;
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
});
