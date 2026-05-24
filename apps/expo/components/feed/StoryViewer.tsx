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
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
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
const SWIPE_HORIZONTAL_RATIO = 0.25; // fraction of width to trigger a group change
const SWIPE_HORIZONTAL_VELOCITY = 500;

export default function StoryViewer({
  visible,
  groups,
  initialGroupIndex,
  onClose,
  durationMs = 6000,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Reset when the viewer (re-)opens at a new starting group
  useEffect(() => {
    if (!visible) return;
    setGroupIndex(initialGroupIndex);
    setSlideIndex(0);
  }, [initialGroupIndex, visible]);

  const groupIndexRef = useRef(groupIndex);
  groupIndexRef.current = groupIndex;
  const slideIndexRef = useRef(slideIndex);
  slideIndexRef.current = slideIndex;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const currentGroup = groups[groupIndex];
  const prevGroup = groupIndex > 0 ? groups[groupIndex - 1] : null;
  const nextGroup = groupIndex < groups.length - 1 ? groups[groupIndex + 1] : null;

  // ── Progress bar ────────────────────────────────────────────
  const progress = useRef(new RNAnimated.Value(0)).current;
  const slideCount = currentGroup?.slides.length ?? 0;

  useEffect(() => {
    if (!visible || paused || slideCount === 0) return;
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
  }, [groupIndex, slideIndex, paused, visible, durationMs, slideCount]);

  // ── Cube transition ─────────────────────────────────────────
  // progressX: continuous horizontal swipe progress.
  //   0 = at rest on current group
  //   +1 = fully advanced to next group
  //   -1 = fully retreated to previous group
  const progressX = useSharedValue(0);
  const dragY = useSharedValue(0);

  const stepForwardJS = useCallback(() => {
    const gi = groupIndexRef.current;
    const si = slideIndexRef.current;
    const grp = groupsRef.current[gi];
    if (!grp) return;
    // Within group → instant slide change
    if (si < grp.slides.length - 1) {
      setSlideIndex(si + 1);
      return;
    }
    // Last slide of current group → cube to next, or close
    if (gi < groupsRef.current.length - 1) {
      progressX.value = withTiming(1, { duration: 320 }, (finished) => {
        if (!finished) return;
        runOnJS(commitGroupChange)(gi + 1, 0);
      });
    } else {
      onClose();
    }
  }, [onClose, progressX]);

  const stepBackJS = useCallback(() => {
    const gi = groupIndexRef.current;
    const si = slideIndexRef.current;
    // Within group → instant
    if (si > 0) {
      setSlideIndex(si - 1);
      return;
    }
    // First slide of current group → cube to prev (start at its last slide)
    if (gi > 0) {
      const prevSlides = groupsRef.current[gi - 1]?.slides.length ?? 1;
      progressX.value = withTiming(-1, { duration: 320 }, (finished) => {
        if (!finished) return;
        runOnJS(commitGroupChange)(gi - 1, Math.max(0, prevSlides - 1));
      });
    } else {
      // Already at very first slide — snap back if any partial drag
      progressX.value = withSpring(0, { damping: 22, stiffness: 200 });
    }
  }, [progressX]);

  const commitGroupChange = useCallback(
    (newGroupIndex: number, newSlideIndex: number) => {
      setGroupIndex(newGroupIndex);
      setSlideIndex(newSlideIndex);
      // After React commits the new index, reset progressX to 0 without animation
      // so the new "current" layer sits at rest.
      progressX.value = 0;
    },
    [progressX],
  );

  const triggerSwipeUp = useCallback(() => {
    currentGroup?.onSwipeUp?.();
  }, [currentGroup]);

  // ── Gestures ────────────────────────────────────────────────
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
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onStart(() => {
      runOnJS(setPaused)(true);
    })
    .onUpdate((e) => {
      // Vertical drag (close / swipe-up) tracked separately from the cube.
      dragY.value = e.translationY;
      // Horizontal drag drives the cube progress.
      //   finger right (translationX > 0) → intent: previous story → progressX negative
      //   finger left  (translationX < 0) → intent: next story     → progressX positive
      const raw = e.translationX / width;
      const gi = groupIndexRef.current;
      const len = groupsRef.current.length;
      let clamped = raw;
      // Soft-block at edges: rubber-band by 75% so user feels the boundary.
      if (raw < 0 && gi >= len - 1) clamped = raw * 0.25; // swipe-left at last group
      if (raw > 0 && gi <= 0) clamped = raw * 0.25; // swipe-right at first group
      progressX.value = -clamped;
    })
    .onEnd((e) => {
      const dy = dragY.value;
      const vy = e.velocityY;

      // Swipe down → close (priority)
      if (dy > SWIPE_DOWN_THRESHOLD || vy > SWIPE_DOWN_VELOCITY) {
        progressX.value = withSpring(0, { damping: 22, stiffness: 200 });
        dragY.value = withTiming(height, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
        return;
      }

      // Swipe up → onSwipeUp of current group
      if (dy < -SWIPE_UP_THRESHOLD || vy < -SWIPE_UP_VELOCITY) {
        progressX.value = withSpring(0, { damping: 22, stiffness: 200 });
        dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
        runOnJS(triggerSwipeUp)();
        runOnJS(setPaused)(false);
        return;
      }

      // Horizontal swipe → group change
      const px = progressX.value;
      const horizontalThreshold = SWIPE_HORIZONTAL_RATIO;
      const horizontalVelocity = Math.abs(e.velocityX) > SWIPE_HORIZONTAL_VELOCITY;
      if ((px > horizontalThreshold || (horizontalVelocity && px > 0)) && groupIndexRef.current < groupsRef.current.length - 1) {
        // Animate to next
        const gi = groupIndexRef.current;
        progressX.value = withTiming(1, { duration: 240 }, (finished) => {
          if (finished) runOnJS(commitGroupChange)(gi + 1, 0);
        });
        dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
        runOnJS(setPaused)(false);
        return;
      }
      if ((px < -horizontalThreshold || (horizontalVelocity && px < 0)) && groupIndexRef.current > 0) {
        const gi = groupIndexRef.current;
        const prevSlides = groupsRef.current[gi - 1]?.slides.length ?? 1;
        progressX.value = withTiming(-1, { duration: 240 }, (finished) => {
          if (finished) runOnJS(commitGroupChange)(gi - 1, Math.max(0, prevSlides - 1));
        });
        dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
        runOnJS(setPaused)(false);
        return;
      }

      // Snap back
      progressX.value = withSpring(0, { damping: 22, stiffness: 200 });
      dragY.value = withSpring(0, { damping: 22, stiffness: 200 });
      runOnJS(setPaused)(false);
    });

  const composed = Gesture.Race(tap, Gesture.Simultaneous(longPress, pan));

  // ── Cube layer transforms ───────────────────────────────────
  // Each of the three layers (prev / current / next) gets a transform that
  // places it on a cube face. progressX drives the cube rotation; the layer's
  // resting position relative to current is -1 / 0 / +1.
  const prevLayerStyle = useAnimatedStyle(() => {
    const eff = -1 - progressX.value;
    if (Math.abs(eff) > 1.0001) {
      return { opacity: 0, transform: [{ translateX: width * eff }] };
    }
    const pivot = eff < 0 ? width / 2 : -width / 2;
    return {
      opacity: 1,
      transform: [
        { perspective: 1200 },
        { translateX: eff * width + pivot },
        { rotateY: `${eff * 90}deg` },
        { translateX: -pivot },
      ],
    };
  });

  const currentLayerStyle = useAnimatedStyle(() => {
    const eff = -progressX.value;
    if (Math.abs(eff) > 1.0001) {
      return { opacity: 0, transform: [{ translateX: width * eff }] };
    }
    const pivot = eff < 0 ? width / 2 : -width / 2;
    const ty = Math.max(dragY.value, 0);
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

  const nextLayerStyle = useAnimatedStyle(() => {
    const eff = 1 - progressX.value;
    if (Math.abs(eff) > 1.0001) {
      return { opacity: 0, transform: [{ translateX: width * eff }] };
    }
    const pivot = eff < 0 ? width / 2 : -width / 2;
    return {
      opacity: 1,
      transform: [
        { perspective: 1200 },
        { translateX: eff * width + pivot },
        { rotateY: `${eff * 90}deg` },
        { translateX: -pivot },
      ],
    };
  });

  // Backdrop fade as user drags down
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

  // Chrome (header + progress + bottom content) fade
  const chromeStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    const horizontalActivity = Math.min(Math.abs(progressX.value), 1);
    return {
      opacity: interpolate(
        Math.max(down / (height * 0.18), horizontalActivity),
        [0, 1],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      opacity: interpolate(down, [0, height * 0.35], [1, 0], Extrapolation.CLAMP),
    };
  });

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
          {/* Gesture surface — owns the cube faces */}
          <GestureDetector gesture={composed}>
            <View style={StyleSheet.absoluteFill}>
              {prevGroup ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.face, { width, height }, prevLayerStyle]}
                >
                  <SlideFace
                    slide={prevGroup.slides[prevGroup.slides.length - 1]}
                    width={width}
                    height={height}
                  />
                </Animated.View>
              ) : null}

              <Animated.View
                pointerEvents="none"
                style={[styles.face, { width, height }, currentLayerStyle]}
              >
                <SlideFace
                  slide={currentGroup.slides[slideIndex]}
                  width={width}
                  height={height}
                />
              </Animated.View>

              {nextGroup ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.face, { width, height }, nextLayerStyle]}
                >
                  <SlideFace
                    slide={nextGroup.slides[0]}
                    width={width}
                    height={height}
                  />
                </Animated.View>
              ) : null}
            </View>
          </GestureDetector>

          {/* Chrome — rendered OUTSIDE the gesture detector so Pressables
              (close, CTA) win over the Tap-to-advance gesture. */}
          <Animated.View
            style={[styles.progressRow, chromeStyle]}
            pointerEvents="none"
          >
            {currentGroup.slides.map((_, i) => {
              if (i < slideIndex) {
                return (
                  <View
                    key={i}
                    style={[styles.progressBar, styles.progressBarDone]}
                  />
                );
              }
              if (i === slideIndex) {
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
            const s = currentGroup.slides[slideIndex];
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

// ── SlideFace ────────────────────────────────────────────────
// Stateless renderer for a single slide's background + overlay text.
// Bottom CTAs and header live OUTSIDE the cube so they don't rotate
// — they're drawn in the parent on top.
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
