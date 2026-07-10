import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  PanResponder,
  StyleSheet,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

type Props = {
  /** Played fraction 0..1 (ignored while the user is dragging). */
  progress: number;
  /** Buffered fraction 0..1. */
  buffered: number;
  /** Total duration in seconds. */
  duration: number;
  /** Accent colour for the played portion + thumb. */
  accent: string;
  onScrubStart?: () => void;
  onScrub?: (time: number) => void;
  onScrubEnd?: (time: number) => void;
};

const TRACK_HEIGHT = 3;
const THUMB = 14;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * A draggable YouTube-style seek bar. Zero external deps — built on the core-RN
 * PanResponder so it can live anywhere without a gesture-handler provider.
 */
export default function VideoScrubber({
  progress,
  buffered,
  duration,
  accent,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: Readonly<Props>) {
  const widthRef = useRef(1);
  const [dragging, setDragging] = useState(false);
  const [dragFrac, setDragFrac] = useState(0);
  const dragFracRef = useRef(0);
  dragFracRef.current = dragFrac;

  // Keep the latest callbacks / duration in a ref so the PanResponder can be
  // created once yet always call through to fresh values.
  const cfg = useRef({ duration, onScrubStart, onScrub, onScrubEnd });
  cfg.current = { duration, onScrubStart, onScrub, onScrubEnd };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          const f = clamp01(e.nativeEvent.locationX / widthRef.current);
          setDragging(true);
          setDragFrac(f);
          cfg.current.onScrubStart?.();
          cfg.current.onScrub?.(f * cfg.current.duration);
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          const f = clamp01(e.nativeEvent.locationX / widthRef.current);
          setDragFrac(f);
          cfg.current.onScrub?.(f * cfg.current.duration);
        },
        onPanResponderRelease: (e: GestureResponderEvent) => {
          const f = clamp01(e.nativeEvent.locationX / widthRef.current);
          setDragging(false);
          cfg.current.onScrubEnd?.(f * cfg.current.duration);
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          cfg.current.onScrubEnd?.(dragFracRef.current * cfg.current.duration);
        },
      }),
    []
  );

  const shown = dragging ? dragFrac : clamp01(progress);
  const buf = clamp01(buffered);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width || 1;
  };

  return (
    <View style={styles.wrap} onLayout={onLayout} {...responder.panHandlers}>
      <View style={styles.track}>
        <View style={[styles.buffered, { width: `${buf * 100}%` }]} />
        <View style={[styles.played, { width: `${shown * 100}%`, backgroundColor: accent }]} />
      </View>
      <View
        style={[
          styles.thumb,
          {
            left: `${shown * 100}%`,
            backgroundColor: accent,
            transform: [{ translateX: -THUMB / 2 }, { scale: dragging ? 1.35 : 1 }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    height: 26,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  buffered: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  played: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    marginTop: -THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});
