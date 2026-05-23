import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
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
  header?: StoryHeader;
  cta?: StoryCta;
};

type Props = {
  visible: boolean;
  slides: StorySlideInput[];
  initialIndex?: number;
  onClose: () => void;
  durationMs?: number;
};

const SWIPE_DOWN_THRESHOLD = 120;
const SWIPE_DOWN_VELOCITY = 800;
const SWIPE_HORIZONTAL_THRESHOLD = 60;
const SWIPE_HORIZONTAL_VELOCITY = 500;

export default function StoryViewer({
  visible,
  slides,
  initialIndex = 0,
  onClose,
  durationMs = 6000,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, visible]);

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  // Progress bar
  const progress = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (!visible || paused) return;
    progress.setValue(0);
    const anim = RNAnimated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      const idx = currentIndexRef.current;
      if (idx < slidesRef.current.length - 1) {
        setCurrentIndex(idx + 1);
      } else {
        onClose();
      }
    });
    return () => anim.stop();
  }, [currentIndex, paused, visible, durationMs, onClose, progress]);

  // Gestures
  const dragY = useSharedValue(0);
  const dragX = useSharedValue(0);
  // Triggers a cube rotation transition when the index changes (1 = forward, -1 = back)
  const cubeTransition = useSharedValue(0);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i < slidesRef.current.length - 1) {
        cubeTransition.value = 1;
        return i + 1;
      }
      onClose();
      return i;
    });
  }, [cubeTransition, onClose]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i > 0) {
        cubeTransition.value = -1;
        return i - 1;
      }
      return i;
    });
  }, [cubeTransition]);

  // When index changes (via auto-advance, tap, or swipe), animate the cube from
  // the trigger position back to 0.
  useEffect(() => {
    if (cubeTransition.value === 0) return;
    cubeTransition.value = withTiming(0, { duration: 320 });
  }, [currentIndex, cubeTransition]);

  const pauseTimer = useCallback(() => setPaused(true), []);
  const resumeTimer = useCallback(() => setPaused(false), []);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .activeOffsetX([-12, 12])
    .onStart(() => {
      runOnJS(pauseTimer)();
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
      dragX.value = e.translationX;
    })
    .onEnd((e) => {
      // Swipe down to close has priority
      if (
        dragY.value > SWIPE_DOWN_THRESHOLD ||
        e.velocityY > SWIPE_DOWN_VELOCITY
      ) {
        dragX.value = withTiming(0, { duration: 180 });
        dragY.value = withTiming(height, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
        return;
      }

      // Horizontal swipe — change slide with cube transition
      const horizontal =
        Math.abs(dragX.value) > SWIPE_HORIZONTAL_THRESHOLD ||
        Math.abs(e.velocityX) > SWIPE_HORIZONTAL_VELOCITY;

      if (horizontal) {
        if (dragX.value < 0) {
          dragX.value = withTiming(0, { duration: 200 });
          runOnJS(goNext)();
        } else {
          dragX.value = withTiming(0, { duration: 200 });
          runOnJS(goPrev)();
        }
        dragY.value = withSpring(0, { damping: 20, stiffness: 180 });
        runOnJS(resumeTimer)();
        return;
      }

      // Snap back
      dragX.value = withSpring(0, { damping: 20, stiffness: 180 });
      dragY.value = withSpring(0, { damping: 20, stiffness: 180 });
      runOnJS(resumeTimer)();
    });

  // --- Animated styles ---
  const containerStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      backgroundColor: interpolateColor(
        down,
        [0, height * 0.5],
        ['rgba(0,0,0,1)', 'rgba(0,0,0,0)'],
      ),
    };
  });

  // Cube transform on the currently-visible slide: combines a drag-driven
  // rotateY (while finger is down) with a discrete rotation on index change.
  const slideAnimatedStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);

    // Rotate around the trailing edge as you drag horizontally.
    const dragRotate = interpolate(
      dragX.value,
      [-width, 0, width],
      [-60, 0, 60],
      Extrapolation.CLAMP,
    );

    // Discrete cube flip on index change. cubeTransition is set to +/-1 at the
    // moment the index updates, then animated back to 0 over ~320ms — so the
    // new slide flies in from the side.
    const flipRotate = cubeTransition.value * 60;

    const translateXDrag = dragX.value * 0.4;

    return {
      transform: [
        { perspective: 1000 },
        { translateX: translateXDrag },
        { translateY: down },
        { rotateY: `${dragRotate + flipRotate}deg` },
      ],
      opacity: interpolate(down, [0, height * 0.6], [1, 0.35], Extrapolation.CLAMP),
    };
  });

  const chromeStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      opacity: interpolate(down, [0, height * 0.18], [1, 0], Extrapolation.CLAMP),
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      opacity: interpolate(down, [0, height * 0.35], [1, 0], Extrapolation.CLAMP),
    };
  });

  const handleTap = useCallback(
    (side: 'left' | 'right') => {
      if (side === 'left') {
        if (currentIndexRef.current > 0) {
          cubeTransition.value = -1;
          setCurrentIndex((i) => Math.max(0, i - 1));
        }
      } else {
        if (currentIndexRef.current < slidesRef.current.length - 1) {
          cubeTransition.value = 1;
          setCurrentIndex((i) => i + 1);
        } else {
          onClose();
        }
      }
    },
    [cubeTransition, onClose],
  );

  const slide = slides[currentIndex];
  const overlayTextColor = slide?.textColor || '#FFFFFF';

  const progressBars = useMemo(
    () => slides.map((_, i) => i),
    [slides.length], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!visible || !slide) return null;

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
        <Animated.View style={[styles.container, { width, height }, containerStyle]}>
          <GestureDetector gesture={pan}>
            <View style={StyleSheet.absoluteFill}>
              {/* Slide content (image + overlay text) */}
              <Animated.View style={[StyleSheet.absoluteFill, slideAnimatedStyle]}>
                {slide.backgroundUrl ? (
                  <Image
                    source={{ uri: slide.backgroundUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit={slide.imageFit ?? 'cover'}
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.imageFallback]} />
                )}

                {/* Centered overlay text (story-collection style) */}
                {slide.overlayText ? (
                  <View style={styles.overlayTextWrap} pointerEvents="none">
                    <Text
                      style={[
                        styles.overlayText,
                        { color: overlayTextColor },
                      ]}
                    >
                      {slide.overlayText}
                    </Text>
                  </View>
                ) : null}
              </Animated.View>

              {/* Tap zones */}
              <View style={styles.tapRow} pointerEvents="box-none">
                <Pressable style={styles.tapZone} onPress={() => handleTap('left')} />
                <Pressable style={styles.tapZone} onPress={() => handleTap('right')} />
              </View>

              {/* Progress bars */}
              <Animated.View
                style={[styles.progressRow, chromeStyle]}
                pointerEvents="none"
              >
                {progressBars.map((i) => {
                  if (i < currentIndex) {
                    return (
                      <View
                        key={i}
                        style={[styles.progressBar, styles.progressBarDone]}
                      />
                    );
                  }
                  if (i === currentIndex) {
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

              {/* Header */}
              <Animated.View style={[styles.header, chromeStyle]}>
                {slide.header ? (
                  <>
                    <View style={styles.headerAvatar}>
                      {slide.header.avatarUrl ? (
                        <Image
                          source={{ uri: slide.header.avatarUrl }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={styles.headerAvatarLetter}>
                          {slide.header.title.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.headerInfo}>
                      <Text style={styles.headerTitle} numberOfLines={1}>
                        {slide.header.title}
                      </Text>
                      {slide.header.subtitle ? (
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                          {slide.header.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <View style={styles.headerSpacer} />
                )}
                <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
                  <Ionicons name="close" size={26} color="#ffffff" />
                </Pressable>
              </Animated.View>

              {/* Bottom gradient + content for event-style slides */}
              {(slide.title || slide.cta || slide.subtitleLine || slide.pillText) && (
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
                    {slide.pillText ? (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{slide.pillText}</Text>
                      </View>
                    ) : null}
                    {slide.title ? (
                      <Text style={styles.bottomTitle} numberOfLines={2}>
                        {slide.title}
                      </Text>
                    ) : null}
                    {slide.subtitleLine ? (
                      <Text style={styles.bottomMeta} numberOfLines={1}>
                        {slide.subtitleLine}
                      </Text>
                    ) : null}
                    {slide.cta ? (
                      <Pressable
                        style={styles.ctaBtn}
                        onPress={slide.cta.onPress}
                        pointerEvents="auto"
                      >
                        <Ionicons name="chevron-up" size={18} color="#ffffff" />
                        <Text style={styles.ctaText}>{slide.cta.label}</Text>
                      </Pressable>
                    ) : null}
                  </Animated.View>
                </>
              )}
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageFallback: {
    backgroundColor: '#1a2a4a',
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
  tapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    top: 120,
    bottom: 200,
  },
  tapZone: {
    flex: 1,
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
