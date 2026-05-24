import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Easing,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Animated as RNAnimated,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export type StoryHeader = {
  avatarUrl?: string | null;
  title: string;
  subtitle?: string;
};

export type StoryCta = {
  label: string;
  onPress: () => void;
};

export type StorySlideInput = {
  backgroundUrl: string;
  overlayText?: string;
  textColor?: string;
  title?: string;
  subtitleLine?: string;
  pillText?: string;
  imageFit?: 'cover' | 'contain';
  cta?: StoryCta;
};

export type StoryGroup = {
  id: string;
  header?: StoryHeader;
  slides: StorySlideInput[];
  onSwipeUp?: () => void;
};

type Props = {
  visible: boolean;
  groups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
  durationMs?: number;
};

const SWIPE_DOWN_THRESHOLD = 120;
const SWIPE_DOWN_VELOCITY = 800;
const SWIPE_UP_THRESHOLD = 90;
const SWIPE_UP_VELOCITY = 700;
const SWIPE_HORIZONTAL_FLICK_VELOCITY = 500; // px/sec
const AXIS_DECISION_PX = 12;
const WINDOW = 2; // render groups within ±WINDOW of currentGroupIndex

export default function StoryViewer({
  visible,
  groups,
  initialGroupIndex,
  onClose,
  durationMs = 6000,
}: Props) {
  const { width, height } = useWindowDimensions();

  // ── React state (chrome + slide pointers) ──────────────────
  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const [slideIndices, setSlideIndices] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);

  // ── Shared values (UI thread) ──────────────────────────────
  // cubePosition: absolute position across all groups.
  //   integer N = group N is centered. fractional = mid-transition.
  const cubePosition = useSharedValue(initialGroupIndex);
  const dragY = useSharedValue(0);
  // axis: 0 = undecided, 1 = horizontal, 2 = vertical
  const axis = useSharedValue(0);
  // cubePosition at gesture start — for relative drag math
  const dragStartCube = useSharedValue(0);

  // Reset everything when the viewer (re-)opens at a new starting group
  useEffect(() => {
    if (!visible) return;
    setCurrentGroupIndex(initialGroupIndex);
    setSlideIndices({});
    setPaused(false);
    cubePosition.value = initialGroupIndex;
    dragY.value = 0;
    axis.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupIndex, visible]);

  // ── Refs for use inside gesture callbacks / timer ──────────
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const currentGroupIndexRef = useRef(currentGroupIndex);
  currentGroupIndexRef.current = currentGroupIndex;
  const slideIndicesRef = useRef(slideIndices);
  slideIndicesRef.current = slideIndices;

  const currentGroup = groups[currentGroupIndex];
  const currentSlideIndex = currentGroup
    ? slideIndices[currentGroup.id] ?? 0
    : 0;

  // ── Chrome / state follower ────────────────────────────────
  // When cubePosition rounds to a new integer, update currentGroupIndex so the
  // chrome (progress bars, header, CTA) reflects the now-centered group. This
  // fires once per integer crossing, while cubePosition is mid-transition and
  // chrome opacity is near zero — so the chrome content swap is invisible.
  useAnimatedReaction(
    () => Math.round(cubePosition.value),
    (rounded, prev) => {
      if (
        rounded !== prev &&
        rounded >= 0 &&
        rounded < groupsRef.current.length
      ) {
        runOnJS(setCurrentGroupIndex)(rounded);
      }
    },
  );

  // ── Auto-advance timer ─────────────────────────────────────
  const progress = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (!visible || paused || !currentGroup) return;
    progress.setValue(0);
    const anim = RNAnimated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      stepForwardJS();
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroupIndex, currentSlideIndex, paused, visible, durationMs]);

  // ── Navigation helpers ─────────────────────────────────────
  const stepForwardJS = useCallback(() => {
    const gi = currentGroupIndexRef.current;
    const grp = groupsRef.current[gi];
    if (!grp) return;
    const si = slideIndicesRef.current[grp.id] ?? 0;
    // Within group → instant slide change (no cube)
    if (si < grp.slides.length - 1) {
      setSlideIndices((p) => ({ ...p, [grp.id]: si + 1 }));
      return;
    }
    // End of last group → close
    if (gi >= groupsRef.current.length - 1) {
      onClose();
      return;
    }
    // Cube to next group; pre-set its slideIndex to 0 so chrome lands clean
    const nextGrp = groupsRef.current[gi + 1];
    if (nextGrp) {
      setSlideIndices((p) =>
        p[nextGrp.id] === 0 ? p : { ...p, [nextGrp.id]: 0 },
      );
    }
    cubePosition.value = withTiming(gi + 1, { duration: 280 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const stepBackJS = useCallback(() => {
    const gi = currentGroupIndexRef.current;
    const grp = groupsRef.current[gi];
    if (!grp) return;
    const si = slideIndicesRef.current[grp.id] ?? 0;
    if (si > 0) {
      setSlideIndices((p) => ({ ...p, [grp.id]: si - 1 }));
      return;
    }
    if (gi <= 0) {
      // Already at first slide of first group — snap any partial drag back.
      cubePosition.value = withSpring(0, { damping: 22, stiffness: 200 });
      return;
    }
    const prevGrp = groupsRef.current[gi - 1];
    if (prevGrp) {
      const prevLast = Math.max(0, prevGrp.slides.length - 1);
      setSlideIndices((p) => ({ ...p, [prevGrp.id]: prevLast }));
    }
    cubePosition.value = withTiming(gi - 1, { duration: 280 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerSwipeUp = useCallback(() => {
    const grp = groupsRef.current[currentGroupIndexRef.current];
    grp?.onSwipeUp?.();
  }, []);

  const seedSlideIndex = useCallback((groupId: string, idx: number) => {
    setSlideIndices((p) => (p[groupId] === idx ? p : { ...p, [groupId]: idx }));
  }, []);

  // ── Gestures ───────────────────────────────────────────────
  const tap = Gesture.Tap()
    .maxDuration(280)
    .maxDistance(12)
    .onEnd((e, success) => {
      if (!success) return;
      if (e.x < width / 2) runOnJS(stepBackJS)();
      else runOnJS(stepForwardJS)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(220)
    .maxDistance(12)
    .onStart(() => runOnJS(setPaused)(true))
    .onFinalize(() => runOnJS(setPaused)(false));

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .activeOffsetY([-8, 8])
    .onStart(() => {
      axis.value = 0;
      dragStartCube.value = cubePosition.value;
      runOnJS(setPaused)(true);
    })
    .onUpdate((e) => {
      // Decide axis after first 12px of clear movement, then LOCK IT.
      if (axis.value === 0) {
        const ax = Math.abs(e.translationX);
        const ay = Math.abs(e.translationY);
        if (ax < AXIS_DECISION_PX && ay < AXIS_DECISION_PX) return;
        axis.value = ax > ay ? 1 : 2;
      }

      if (axis.value === 1) {
        // Horizontal — drive cubePosition. Suppress vertical entirely.
        // Finger LEFT (translationX < 0) → forward → cubePosition increases.
        // Finger RIGHT (translationX > 0) → back → cubePosition decreases.
        const delta = -e.translationX / width;
        let target = dragStartCube.value + delta;
        const maxIdx = groupsRef.current.length - 1;
        // Rubber-band at edges (75% resistance past the bound).
        if (target < 0) target = target * 0.25;
        if (target > maxIdx) target = maxIdx + (target - maxIdx) * 0.25;
        cubePosition.value = target;
      } else {
        // Vertical — drive dragY. Suppress horizontal entirely.
        dragY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      const a = axis.value;
      axis.value = 0;

      if (a === 1) {
        // Horizontal release. NEVER close the viewer here.
        const start = dragStartCube.value;
        const cur = cubePosition.value;
        const delta = cur - start;
        const vxNorm = -e.velocityX / width;
        const maxIdx = groupsRef.current.length - 1;

        // Decide target integer: if user moved more than 25% of a page OR
        // flicked with enough velocity, snap to the next/prev integer in
        // the direction of motion. Otherwise snap back to start.
        let target = Math.round(start);
        const flicked =
          Math.abs(e.velocityX) > SWIPE_HORIZONTAL_FLICK_VELOCITY;
        if (delta > 0.25 || (flicked && vxNorm > 0)) {
          target = Math.floor(start + 1.0);
        } else if (delta < -0.25 || (flicked && vxNorm < 0)) {
          target = Math.ceil(start - 1.0);
        }
        target = Math.max(0, Math.min(maxIdx, target));

        // When jumping to the previous group, pre-seed its slideIndex to its
        // last slide so the chrome lands correctly. Going forward, seed to 0.
        if (target > Math.round(start)) {
          const grp = groupsRef.current[target];
          if (grp) runOnJS(seedSlideIndex)(grp.id, 0);
        } else if (target < Math.round(start)) {
          const grp = groupsRef.current[target];
          if (grp) {
            const last = Math.max(0, grp.slides.length - 1);
            runOnJS(seedSlideIndex)(grp.id, last);
          }
        }

        cubePosition.value = withTiming(target, { duration: 240 });
        dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
        runOnJS(setPaused)(false);
        return;
      }

      if (a === 2) {
        // Vertical release.
        const dy = dragY.value;
        const vy = e.velocityY;
        if (dy > SWIPE_DOWN_THRESHOLD || vy > SWIPE_DOWN_VELOCITY) {
          dragY.value = withTiming(height, { duration: 220 }, (finished) => {
            if (finished) runOnJS(onClose)();
          });
          return;
        }
        if (dy < -SWIPE_UP_THRESHOLD || vy < -SWIPE_UP_VELOCITY) {
          dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
          runOnJS(triggerSwipeUp)();
          runOnJS(setPaused)(false);
          return;
        }
        dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
        runOnJS(setPaused)(false);
        return;
      }

      // No decided axis — snap everything back.
      cubePosition.value = withSpring(Math.round(cubePosition.value), {
        damping: 22,
        stiffness: 200,
      });
      dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
      runOnJS(setPaused)(false);
    });

  const composed = Gesture.Race(tap, Gesture.Simultaneous(longPress, pan));

  // ── Backdrop / chrome animated styles ──────────────────────
  const backdropStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      backgroundColor: interpolateColor(
        down,
        [0, height * 0.5],
        ['rgba(0,0,0,1)', 'rgba(0,0,0,0)'],
      ),
    };
  });

  // Chrome fades both during vertical drag AND during horizontal cube transition.
  const chromeStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    const dist = Math.abs(cubePosition.value - Math.round(cubePosition.value));
    const cubeOpacity = 1 - Math.min(dist * 3, 1);
    const downOpacity = interpolate(
      down,
      [0, height * 0.18],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity: Math.min(cubeOpacity, downOpacity) };
  });

  const overlayStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      opacity: interpolate(
        down,
        [0, height * 0.35],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  // ── Windowed render of group layers ────────────────────────
  const windowStart = Math.max(0, currentGroupIndex - WINDOW);
  const windowEnd = Math.min(groups.length - 1, currentGroupIndex + WINDOW);
  const visibleGroupIndices = useMemo(() => {
    const arr: number[] = [];
    for (let i = windowStart; i <= windowEnd; i++) arr.push(i);
    return arr;
  }, [windowStart, windowEnd]);

  if (!visible || !currentGroup) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.container, { width, height }, backdropStyle]}>
          {/* Cube faces — one per group in the window */}
          <GestureDetector gesture={composed}>
            <View style={StyleSheet.absoluteFill}>
              {visibleGroupIndices.map((idx) => {
                const group = groups[idx];
                const si = Math.min(
                  slideIndices[group.id] ?? 0,
                  group.slides.length - 1,
                );
                return (
                  <CubeLayer
                    key={group.id}
                    idx={idx}
                    cubePosition={cubePosition}
                    dragY={dragY}
                    width={width}
                    height={height}
                    slide={group.slides[si]}
                  />
                );
              })}
            </View>
          </GestureDetector>

          {/* Chrome (rendered outside the gesture detector so Pressables win) */}
          <Animated.View
            style={[styles.progressRow, chromeStyle]}
            pointerEvents="none"
          >
            {currentGroup.slides.map((_, i) => {
              if (i < currentSlideIndex) {
                return (
                  <View
                    key={i}
                    style={[styles.progressBar, styles.progressBarDone]}
                  />
                );
              }
              if (i === currentSlideIndex) {
                return (
                  <View
                    key={i}
                    style={[styles.progressBar, styles.progressBarBg]}
                  >
                    <RNAnimated.View
                      style={[
                        styles.progressBarFill,
                        {
                          width: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  </View>
                );
              }
              return (
                <View
                  key={i}
                  style={[styles.progressBar, styles.progressBarFuture]}
                />
              );
            })}
          </Animated.View>

          <Animated.View style={[styles.header, chromeStyle]} pointerEvents="box-none">
            {currentGroup.header ? (
              <>
                <View style={styles.headerAvatar} pointerEvents="none">
                  {currentGroup.header.avatarUrl ? (
                    <Image
                      source={{ uri: currentGroup.header.avatarUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.headerAvatarLetter}>
                      {currentGroup.header.title.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.headerInfo} pointerEvents="none">
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {currentGroup.header.title}
                  </Text>
                  {currentGroup.header.subtitle ? (
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                      {currentGroup.header.subtitle}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : (
              <View style={styles.headerSpacer} pointerEvents="none" />
            )}
            <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
              <Ionicons name="close" size={26} color="#ffffff" />
            </Pressable>
          </Animated.View>

          {(() => {
            const s = currentGroup.slides[currentSlideIndex];
            if (!s) return null;
            const hasBottom = s.title || s.cta || s.subtitleLine || s.pillText;
            if (!hasBottom) return null;
            return (
              <>
                <Animated.View
                  style={[styles.bottomGradient, overlayStyle]}
                  pointerEvents="none"
                >
                  <LinearGradient
                    colors={[
                      'transparent',
                      'rgba(0,0,0,0.55)',
                      'rgba(0,0,0,0.93)',
                    ]}
                    locations={[0, 0.45, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <Animated.View
                  style={[styles.bottomContent, chromeStyle]}
                  pointerEvents="box-none"
                >
                  {s.pillText ? (
                    <View style={styles.pill} pointerEvents="none">
                      <Text style={styles.pillText}>{s.pillText}</Text>
                    </View>
                  ) : null}
                  {s.title ? (
                    <Text
                      style={styles.bottomTitle}
                      numberOfLines={2}
                      pointerEvents="none"
                    >
                      {s.title}
                    </Text>
                  ) : null}
                  {s.subtitleLine ? (
                    <Text
                      style={styles.bottomMeta}
                      numberOfLines={1}
                      pointerEvents="none"
                    >
                      {s.subtitleLine}
                    </Text>
                  ) : null}
                  {s.cta ? (
                    <Pressable style={styles.ctaBtn} onPress={s.cta.onPress}>
                      <Ionicons name="chevron-up" size={18} color="#ffffff" />
                      <Text style={styles.ctaText}>{s.cta.label}</Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              </>
            );
          })()}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ── CubeLayer ────────────────────────────────────────────────
// One absolutely-positioned layer per group. Its transform reads cubePosition
// and computes its own offset/rotation. Because each layer is keyed by group
// id, the layer mounted for group N stays mounted as currentGroupIndex
// changes — the slide content doesn't shift, so there's no flash at the end
// of a cube transition.
function CubeLayer({
  idx,
  cubePosition,
  dragY,
  width,
  height,
  slide,
}: {
  idx: number;
  cubePosition: SharedValue<number>;
  dragY: SharedValue<number>;
  width: number;
  height: number;
  slide: StorySlideInput | undefined;
}) {
  const style = useAnimatedStyle(() => {
    const eff = idx - cubePosition.value;
    if (Math.abs(eff) > 1.0001) {
      return {
        opacity: 0,
        transform: [{ translateX: width * 2 * Math.sign(eff || 1) }],
      };
    }
    const pivot = eff < 0 ? width / 2 : -width / 2;
    const ty = Math.abs(eff) < 0.5 ? Math.max(dragY.value, 0) : 0;
    return {
      opacity: 1,
      transform: [
        { perspective: 1200 },
        { translateX: eff * width + pivot },
        { rotateY: `${eff * 90}deg` },
        { translateX: -pivot },
        { translateY: ty },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.face, { width, height }, style]}
    >
      <SlideFace slide={slide} width={width} height={height} />
    </Animated.View>
  );
}

// ── SlideFace ────────────────────────────────────────────────
// Stateless renderer for a single slide's background + overlay text.
function SlideFace({
  slide,
  width: _width,
  height: _height,
}: {
  slide: StorySlideInput | undefined;
  width: number;
  height: number;
}) {
  if (!slide) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }
  const overlayTextColor = slide.textColor || '#FFFFFF';
  return (
    <View style={StyleSheet.absoluteFill}>
      {slide.backgroundUrl ? (
        <Image
          source={{ uri: slide.backgroundUrl }}
          style={StyleSheet.absoluteFill}
          contentFit={slide.imageFit ?? 'cover'}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.imageFallback]} />
      )}
      {slide.overlayText ? (
        <View style={styles.overlayTextWrap} pointerEvents="none">
          <Text style={[styles.overlayText, { color: overlayTextColor }]}>
            {slide.overlayText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    backfaceVisibility: 'hidden',
  },
  imageFallback: {
    backgroundColor: '#1a2a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTextWrap: {
    position: 'absolute',
    top: 140,
    left: 24,
    right: 24,
  },
  overlayText: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.4,
  },
  progressRow: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarDone: {
    backgroundColor: '#ffffff',
  },
  progressBarBg: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 1,
  },
  progressBarFuture: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  header: {
    position: 'absolute',
    top: 64,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerSpacer: {
    flex: 1,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#194383',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerAvatarLetter: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  pillText: {
    color: '#000000',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  bottomTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    lineHeight: 28,
    marginBottom: 6,
  },
  bottomMeta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
  },
  ctaBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
