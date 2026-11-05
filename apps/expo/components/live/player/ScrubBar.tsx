// Replay scrubber (YouTube style): thin red track that grows while dragging; x / width = position.
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { YT_RED } from './chrome';

type Props = {
  width: number;
  progress: number;
  buffered: number;
  active: boolean;
  onScrub: (fraction: number) => void;
  onRelease: (fraction: number) => void;
};

export default function ScrubBar({ width, progress, buffered, active, onScrub, onRelease }: Props) {
  // JS-thread pan (runOnJS(true)): plain callbacks, no worklets.
  const gesture = useMemo(() => {
    const fraction = (x: number) => Math.min(1, Math.max(0, x / Math.max(1, width)));
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .hitSlop({ top: 14, bottom: 14 })
      .onBegin((e) => onScrub(fraction(e.x)))
      .onUpdate((e) => onScrub(fraction(e.x)))
      .onFinalize((e) => onRelease(fraction(e.x)));
  }, [width, onScrub, onRelease]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.hit, { width }]} collapsable={false} accessibilityRole="adjustable" accessibilityLabel="Wiedergabeposition">
        <View style={[styles.track, active && styles.trackActive]}>
          <View style={[styles.buffered, { width: `${buffered * 100}%` }]} />
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={[styles.thumb, active && styles.thumbActive, { left: `${progress * 100}%` }]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

export function ProgressLine({ progress }: { progress: number }) {
  return (
    <View style={styles.mini} pointerEvents="none">
      <View style={[styles.fill, { width: `${progress * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 20, justifyContent: 'flex-end' },
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  trackActive: { height: 5 },
  buffered: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.45)' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: YT_RED },
  thumb: { position: 'absolute', bottom: -4.5, width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: YT_RED },
  thumbActive: { bottom: -6.5, width: 18, height: 18, marginLeft: -9, borderRadius: 9 },
  mini: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
});
