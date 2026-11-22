// An animated agent picture (looping animated WebP from the website, see apps/web/scripts/gen-agent-animations.mjs).
//
//   mode="loop"  plays continuously (the agent is writing).
//   mode="idle"  rests on the first frame and plays a short burst when it scrolls into view, then again now and
//                then while it stays visible: a small living detail, never a constant wiggle.
//
// Visibility is checked by one shared ticker (measureInWindow) for all idle mascots on screen, so a long list
// costs one interval, not one per row. Reduce Motion keeps every mascot still.
import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Dimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageSource } from 'expo-image';

/** One loop of the generated animations: 16 frames × 110 ms. */
export const MASCOT_LOOP_MS = 16 * 110;

export type AnimatedMascotProps = {
  /** Animated WebP. */
  uri: string;
  size: number;
  mode: 'idle' | 'loop';
  /** Shown while the animation loads and when it fails (static tile). */
  placeholder?: ImageSource | string | null;
  /** Called when the animation cannot be loaded, so the caller can fall back to the static picture. */
  onError?: () => void;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

// ---- Reduce Motion (read once, kept current) ----
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotion = v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => {
  reduceMotion = v;
});

// ---- Shared visibility ticker ----
type Watcher = () => void;
const watchers = new Set<Watcher>();
let ticker: ReturnType<typeof setInterval> | null = null;
function watch(fn: Watcher): () => void {
  watchers.add(fn);
  if (!ticker) {
    ticker = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      watchers.forEach((w) => w());
    }, 900);
  }
  return () => {
    watchers.delete(fn);
    if (!watchers.size && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** Random pause between idle bursts while visible: 9–24 s. */
function nextIdleDelay(): number {
  return 9000 + Math.random() * 15000;
}

function AnimatedMascotImpl({ uri, size, mode, placeholder, onError, borderRadius, style }: AnimatedMascotProps) {
  const imageRef = useRef<Image>(null);
  const viewRef = useRef<View>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mode !== 'idle' || !loaded) return;
    let visible = false;
    let playing = false;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let nextAt = 0;
    let alive = true;

    const play = (loops: number) => {
      if (reduceMotion || playing) return;
      playing = true;
      imageRef.current?.startAnimating().catch(() => {});
      stopTimer = setTimeout(() => {
        playing = false;
        imageRef.current?.stopAnimating().catch(() => {});
      }, loops * MASCOT_LOOP_MS);
      nextAt = Date.now() + loops * MASCOT_LOOP_MS + nextIdleDelay();
    };

    const check = () => {
      viewRef.current?.measureInWindow((x, y, w, h) => {
        if (!alive) return;
        const { width, height } = Dimensions.get('window');
        const now = w > 0 && h > 0 && y + h * 0.5 > 0 && y + h * 0.5 < height && x + w * 0.5 > 0 && x + w * 0.5 < width;
        if (now && !visible) play(2); // just scrolled into view
        else if (now && Date.now() >= nextAt) play(1);
        visible = now;
      });
    };

    const unwatch = watch(check);
    check();
    return () => {
      alive = false;
      unwatch();
      if (stopTimer) clearTimeout(stopTimer);
    };
  }, [mode, loaded, uri]);

  const radius = borderRadius ?? size / 2;
  return (
    <View ref={viewRef} collapsable={false} style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }, style]}>
      <Image
        ref={imageRef}
        source={{ uri }}
        placeholder={placeholder ?? undefined}
        placeholderContentFit="cover"
        style={{ width: size, height: size }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        autoplay={mode === 'loop' && !reduceMotion}
        transition={0}
        accessible={false}
        onLoad={() => setLoaded(true)}
        onError={onError}
      />
    </View>
  );
}

export const AnimatedMascot = memo(AnimatedMascotImpl);
export default AnimatedMascot;
