import React, {
  useCallback,
  useEffect,
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

// Defensive load of expo-audio. expo-audio is a NATIVE MODULE — its Swift /
// Kotlin code only exists in binaries built after we added the package. If the
// app is running via an EAS Update on an older binary, requiring expo-audio
// throws synchronously at module-evaluation time and the app crashes on
// launch. Swallow the failure and fall back to a stub hook; the audio
// `useEffect` already guards on `!player`, so audio silently disables.
// After the next `eas build`, the real `useAudioPlayer` takes over automatically.
type StoryAudioPlayer = {
  play: () => void;
  pause: () => void;
  muted: boolean;
  loop: boolean;
} | null;
type UseAudioPlayerFn = (source: string | null) => StoryAudioPlayer;

let useAudioPlayer: UseAudioPlayerFn = () => null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-audio');
  if (mod?.useAudioPlayer) {
    useAudioPlayer = mod.useAudioPlayer as UseAudioPlayerFn;
    console.log('[StoryViewer] expo-audio loaded ✓');
  }
} catch (err) {
  console.warn(
    '[StoryViewer] expo-audio native module unavailable — audio disabled. ' +
      'Run `eas build` to ship a binary that includes it.',
    err,
  );
}

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
  // Per-slide overrides — useful when one group holds slides with different
  // headers / swipe-up destinations / audio (e.g. the unified "events" story).
  header?: StoryHeader;
  onSwipeUp?: () => void;
  audioUrl?: string | null;
};

export type StoryGroup = {
  id: string;
  header?: StoryHeader;
  slides: StorySlideInput[];
  onSwipeUp?: () => void;
  audioUrl?: string | null;
};

type Props = {
  visible: boolean;
  groups: StoryGroup[];
  initialGroupIndex: number;
  initialSlideIndex?: number;
  onClose: () => void;
  durationMs?: number;
};

const SWIPE_DOWN_THRESHOLD = 120;
const SWIPE_DOWN_VELOCITY = 800;
const SWIPE_UP_THRESHOLD = 90;
const SWIPE_UP_VELOCITY = 700;

export default function StoryViewer({
  visible,
  groups,
  initialGroupIndex,
  initialSlideIndex = 0,
  onClose,
  durationMs = 6000,
}: Props) {
  const { width: _width, height } = useWindowDimensions();

  // ── React state ────────────────────────────────────────────
  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const [slideIndices, setSlideIndices] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  // ── Shared value (vertical drag only) ──────────────────────
  const dragY = useSharedValue(0);

  // Reset state when the viewer (re-)opens at a new starting group/slide.
  useEffect(() => {
    if (!visible) return;
    setCurrentGroupIndex(initialGroupIndex);
    const startingGroup = groups[initialGroupIndex];
    if (startingGroup && initialSlideIndex > 0) {
      setSlideIndices({ [startingGroup.id]: initialSlideIndex });
    } else {
      setSlideIndices({});
    }
    setPaused(false);
    setMuted(false); // sound on every time the viewer opens
    dragY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupIndex, initialSlideIndex, visible]);

  // Refs for use inside gesture callbacks and the timer.
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const currentGroupIndexRef = useRef(currentGroupIndex);
  currentGroupIndexRef.current = currentGroupIndex;
  const slideIndicesRef = useRef(slideIndices);
  slideIndicesRef.current = slideIndices;

  const currentGroup = groups[currentGroupIndex];
  const currentSlideIndex = currentGroup
    ? Math.min(
        slideIndices[currentGroup.id] ?? 0,
        currentGroup.slides.length - 1,
      )
    : 0;

  // ── Audio playback ─────────────────────────────────────────
  // Resolve the active track: slide override beats group default.
  const currentSlideAudio = currentGroup?.slides[currentSlideIndex]?.audioUrl;
  const audioUrl = (currentSlideAudio ?? currentGroup?.audioUrl ?? null) || null;
  // useAudioPlayer accepts a URI string (or null/undefined to unload).
  // Re-creating with a new URI swaps the source; passing the same URI
  // across renders keeps the player instance alive → continuous playback
  // across slides of the same collection.
  const player = useAudioPlayer(audioUrl);

  useEffect(() => {
    if (!player) return;
    try {
      player.loop = true;
      player.muted = muted;
      if (visible && !paused && audioUrl) {
        player.play();
      } else {
        player.pause();
      }
    } catch (err) {
      // expo-audio occasionally throws on a stale player ref; safe to ignore.
      console.warn('StoryViewer audio control failed:', err);
    }
    return () => {
      try {
        player.pause();
      } catch {
        /* noop */
      }
    };
  }, [player, audioUrl, visible, paused, muted]);

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

  // ── Navigation (instant — no animation) ────────────────────
  const stepForwardJS = useCallback(() => {
    const gi = currentGroupIndexRef.current;
    const grp = groupsRef.current[gi];
    if (!grp) return;
    const si = slideIndicesRef.current[grp.id] ?? 0;
    if (si < grp.slides.length - 1) {
      setSlideIndices((p) => ({ ...p, [grp.id]: si + 1 }));
      return;
    }
    if (gi >= groupsRef.current.length - 1) {
      onClose();
      return;
    }
    const nextGrp = groupsRef.current[gi + 1];
    if (nextGrp) {
      setSlideIndices((p) =>
        p[nextGrp.id] === 0 ? p : { ...p, [nextGrp.id]: 0 },
      );
    }
    setCurrentGroupIndex(gi + 1);
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
    if (gi <= 0) return; // Already at very first slide of first group
    const prevGrp = groupsRef.current[gi - 1];
    if (prevGrp) {
      const prevLast = Math.max(0, prevGrp.slides.length - 1);
      setSlideIndices((p) => ({ ...p, [prevGrp.id]: prevLast }));
    }
    setCurrentGroupIndex(gi - 1);
  }, []);

  const triggerSwipeUp = useCallback(() => {
    const grp = groupsRef.current[currentGroupIndexRef.current];
    if (!grp) return;
    const si = slideIndicesRef.current[grp.id] ?? 0;
    const slide = grp.slides[si];
    const handler = slide?.onSwipeUp ?? grp.onSwipeUp;
    handler?.();
  }, []);

  // ── Gestures ───────────────────────────────────────────────
  const tap = Gesture.Tap()
    .maxDuration(280)
    .maxDistance(12)
    .onEnd((e, success) => {
      if (!success) return;
      if (e.x < _width / 2) runOnJS(stepBackJS)();
      else runOnJS(stepForwardJS)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(220)
    .maxDistance(12)
    .onStart(() => runOnJS(setPaused)(true))
    .onFinalize(() => runOnJS(setPaused)(false));

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    // Pure horizontal swipes don't claim this gesture — they just do nothing.
    .failOffsetX([-20, 20])
    .onStart(() => {
      runOnJS(setPaused)(true);
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd((e) => {
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
    });

  const composed = Gesture.Race(tap, Gesture.Simultaneous(longPress, pan));

  // ── Animated styles ────────────────────────────────────────
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

  const slideStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      transform: [{ translateY: down }],
      opacity: interpolate(
        down,
        [0, height * 0.6],
        [1, 0.35],
        Extrapolation.CLAMP,
      ),
    };
  });

  const chromeStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      opacity: interpolate(
        down,
        [0, height * 0.18],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    };
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

  if (!visible || !currentGroup) return null;

  const slide = currentGroup.slides[currentSlideIndex];

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
        <Animated.View
          style={[styles.container, { width: _width, height }, backdropStyle]}
        >
          <GestureDetector gesture={composed}>
            <View style={StyleSheet.absoluteFill}>
              <Animated.View style={[StyleSheet.absoluteFill, slideStyle]}>
                <SlideFace slide={slide} />
              </Animated.View>
            </View>
          </GestureDetector>

          {/* Chrome — rendered outside the gesture detector so Pressables win. */}
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

          {(() => {
            const header = slide?.header ?? currentGroup.header;
            return (
              <Animated.View
                style={[styles.header, chromeStyle]}
                pointerEvents="box-none"
              >
                {header ? (
                  <>
                    <View style={styles.headerAvatar} pointerEvents="none">
                      {header.avatarUrl ? (
                        <Image
                          source={{ uri: header.avatarUrl }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={styles.headerAvatarLetter}>
                          {header.title.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.headerInfo} pointerEvents="none">
                      <Text style={styles.headerTitle} numberOfLines={1}>
                        {header.title}
                      </Text>
                      {header.subtitle ? (
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                          {header.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <View style={styles.headerSpacer} pointerEvents="none" />
                )}
                {audioUrl && player ? (
                  <Pressable
                    onPress={() => setMuted((m) => !m)}
                    hitSlop={16}
                    style={styles.muteBtn}
                  >
                    <Ionicons
                      name={muted ? 'volume-mute' : 'volume-high'}
                      size={22}
                      color="#ffffff"
                    />
                  </Pressable>
                ) : null}
                <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
                  <Ionicons name="close" size={26} color="#ffffff" />
                </Pressable>
              </Animated.View>
            );
          })()}

          {(() => {
            if (!slide) return null;
            const hasBottom =
              slide.title || slide.cta || slide.subtitleLine || slide.pillText;
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
                  {slide.pillText ? (
                    <View style={styles.pill} pointerEvents="none">
                      <Text style={styles.pillText}>{slide.pillText}</Text>
                    </View>
                  ) : null}
                  {slide.title ? (
                    <Text
                      style={styles.bottomTitle}
                      numberOfLines={2}
                      pointerEvents="none"
                    >
                      {slide.title}
                    </Text>
                  ) : null}
                  {slide.subtitleLine ? (
                    <Text
                      style={styles.bottomMeta}
                      numberOfLines={1}
                      pointerEvents="none"
                    >
                      {slide.subtitleLine}
                    </Text>
                  ) : null}
                  {slide.cta ? (
                    <Pressable style={styles.ctaBtn} onPress={slide.cta.onPress}>
                      <Ionicons name="chevron-up" size={18} color="#ffffff" />
                      <Text style={styles.ctaText}>{slide.cta.label}</Text>
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
function SlideFace({ slide }: { slide: StorySlideInput | undefined }) {
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
    height: 3,
    borderRadius: 1.5,
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
    borderRadius: 1.5,
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
  muteBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
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
