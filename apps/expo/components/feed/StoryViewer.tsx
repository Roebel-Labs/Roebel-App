import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Easing,
  Linking,
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
  Easing as ReEasing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
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
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import VolumeHighIcon from '@/assets/icons/story/volume-high-filled.svg';
import VolumeMuteIcon from '@/assets/icons/story/volume-mute-filled.svg';
import CloseIcon from '@/assets/icons/story/close.svg';

// Defensive load of expo-audio. expo-audio is a NATIVE MODULE — its Swift /
// Kotlin code only exists in binaries built after we added the package. If the
// app is running via an EAS Update on an older binary, requiring expo-audio
// throws synchronously at module-evaluation time and the app crashes on
// launch. Swallow the failure and fall back to a stub hook returning null; the
// audio effects already guard on a null player, so audio silently disables.
// After the next `eas build`, the real `useAudioPlayer` takes over automatically.
type StoryAudioPlayer = {
  play: () => void;
  pause: () => void;
  muted: boolean;
  loop: boolean;
  volume: number;
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
  videoUrl?: string | null;
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
  // Optional metadata for the shared background track: shown in a small
  // marquee tooltip under the speaker icon; tapping it opens audioLinkUrl.
  audioTitle?: string | null;
  audioLinkUrl?: string | null;
  // Per-slide auto-advance duration for this group; falls back to the
  // viewer's `durationMs` prop when unset.
  durationMs?: number;
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

// Crossfade duration between the shared background track and a slide's own
// override track (e.g. a single event with its own audio).
const CROSSFADE_MS = 600;

/**
 * Ramp one or more players' volumes from their current value to a target over
 * `durationMs`, driven by requestAnimationFrame. Any in-flight ramp tracked by
 * `rafRef` is cancelled first so successive slide changes don't fight.
 */
function fadeVolume(
  rafRef: { current: number | null },
  targets: { player: StoryAudioPlayer; to: number }[],
  durationMs: number,
) {
  if (rafRef.current != null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  const tweens = targets
    .filter((t): t is { player: NonNullable<StoryAudioPlayer>; to: number } =>
      Boolean(t.player),
    )
    .map((t) => {
      let from = 1;
      try {
        from = t.player.volume;
      } catch {
        from = 1;
      }
      return { player: t.player, from, to: t.to };
    });
  if (tweens.length === 0) return;

  const start = Date.now();
  const tick = () => {
    const p = Math.min(1, (Date.now() - start) / durationMs);
    for (const t of tweens) {
      try {
        t.player.volume = t.from + (t.to - t.from) * p;
      } catch {
        /* stale player ref — ignore */
      }
    }
    if (p < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  };
  rafRef.current = requestAnimationFrame(tick);
}

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

  // A video slide drives its own timing (advances on playToEnd) and its own
  // sound, so the fixed auto-advance timer and the collection background audio
  // both stand down while one is showing.
  const currentIsVideo = Boolean(
    currentGroup?.slides[currentSlideIndex]?.videoUrl,
  );

  // ── Audio playback (two-player crossfade) ──────────────────
  // A group can carry a *background* track (currentGroup.audioUrl) that loops
  // continuously across all its slides. A slide may additionally carry its own
  // OVERRIDE track (slide.audioUrl) — e.g. a single event with its own audio.
  // While an override is active we duck the background to silence and fade the
  // override in; when it clears we fade the override out and bring the
  // background back. The background player keeps playing underneath (volume 0)
  // the whole time so it resumes seamlessly rather than restarting.
  //
  // Passing the same URI across renders keeps a player instance alive →
  // continuous looping; passing null unloads it.
  const groupAudioUrl = currentGroup?.audioUrl ?? null;
  const slideOverrideUrl =
    currentGroup?.slides[currentSlideIndex]?.audioUrl ?? null;
  const hasAudio = Boolean(groupAudioUrl || slideOverrideUrl);

  const groupPlayer = useAudioPlayer(groupAudioUrl);
  const slidePlayer = useAudioPlayer(slideOverrideUrl);

  // Keep both players alive (loop, mute, play/pause) while the viewer is open.
  useEffect(() => {
    const apply = (p: StoryAudioPlayer, url: string | null) => {
      if (!p) return;
      try {
        p.loop = true;
        p.muted = muted;
        // Stand down while a video slide is showing — the video owns the sound.
        if (visible && !paused && url && !currentIsVideo) p.play();
        else p.pause();
      } catch (err) {
        // expo-audio occasionally throws on a stale player ref; safe to ignore.
        console.warn('StoryViewer audio control failed:', err);
      }
    };
    apply(groupPlayer, groupAudioUrl);
    apply(slidePlayer, slideOverrideUrl);
    return () => {
      try {
        groupPlayer?.pause();
      } catch {
        /* noop */
      }
      try {
        slidePlayer?.pause();
      } catch {
        /* noop */
      }
    };
  }, [
    groupPlayer,
    slidePlayer,
    groupAudioUrl,
    slideOverrideUrl,
    visible,
    paused,
    muted,
    currentIsVideo,
  ]);

  // Crossfade whenever the active source changes: override wins → duck the
  // background to 0 and fade the override up; no override → bring it back.
  const fadeRef = useRef<number | null>(null);
  useEffect(() => {
    const overrideActive = Boolean(slideOverrideUrl);
    // A freshly-created override player defaults to full volume — start it
    // silent so it visibly fades IN rather than blaring.
    if (overrideActive && slidePlayer) {
      try {
        slidePlayer.volume = 0;
      } catch {
        /* noop */
      }
    }
    fadeVolume(
      fadeRef,
      [
        { player: groupPlayer, to: overrideActive ? 0 : 1 },
        { player: slidePlayer, to: overrideActive ? 1 : 0 },
      ],
      CROSSFADE_MS,
    );
    return () => {
      if (fadeRef.current != null) {
        cancelAnimationFrame(fadeRef.current);
        fadeRef.current = null;
      }
    };
  }, [groupPlayer, slidePlayer, slideOverrideUrl]);

  // ── Auto-advance timer ─────────────────────────────────────
  const progress = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (!visible || paused || !currentGroup) return;
    // Video slides advance themselves when the clip ends (see VideoSlideFace),
    // and drive the progress bar from playback position — skip the timer.
    if (currentIsVideo) return;
    progress.setValue(0);
    const anim = RNAnimated.timing(progress, {
      toValue: 1,
      duration: currentGroup.durationMs ?? durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      stepForwardJS();
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroupIndex, currentSlideIndex, paused, visible, durationMs, currentIsVideo]);

  // ── Navigation (instant — no animation) ────────────────────
  const stepForwardJS = useCallback(() => {
    // Reset the shared progress value synchronously BEFORE the slide-index
    // state change re-renders. Otherwise the incoming segment paints bound to
    // the previous segment's finished value (1 → 100%) for one frame before
    // the timer effect resets it, making the bar flash full then snap to 0.
    progress.setValue(0);
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
  }, [onClose, progress]);

  const stepBackJS = useCallback(() => {
    progress.setValue(0); // avoid the incoming segment flashing the old value
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
  }, [progress]);

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
                {slide?.videoUrl ? (
                  <VideoSlideFace
                    key={slide.videoUrl}
                    slide={slide}
                    muted={muted}
                    paused={paused}
                    onProgress={(f) => progress.setValue(f)}
                    onEnded={stepForwardJS}
                  />
                ) : (
                  <SlideFace slide={slide} />
                )}
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
                {hasAudio && (groupPlayer || slidePlayer) ? (
                  <Pressable
                    onPress={() => setMuted((m) => !m)}
                    hitSlop={16}
                    style={styles.muteBtn}
                  >
                    {muted ? (
                      <VolumeMuteIcon width={22} height={22} />
                    ) : (
                      <VolumeHighIcon width={22} height={22} />
                    )}
                  </Pressable>
                ) : null}
                <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
                  <CloseIcon width={26} height={26} />
                </Pressable>
                {hasAudio &&
                (groupPlayer || slidePlayer) &&
                !muted &&
                currentGroup.audioTitle ? (
                  <SongTooltip
                    title={currentGroup.audioTitle}
                    onPress={() => {
                      const url = currentGroup.audioLinkUrl;
                      if (url) Linking.openURL(url).catch(() => {});
                    }}
                  />
                ) : null}
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
                      <BounceChevron />
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

// ── BounceChevron ────────────────────────────────────────────
// The swipe-up hint chevron gently bobs up and down on a smooth, infinite
// yoyo loop to nudge the user toward the "Mehr erfahren" action.
function BounceChevron() {
  const ty = useSharedValue(0);
  useEffect(() => {
    ty.value = withRepeat(
      withTiming(-5, { duration: 650 }),
      -1, // repeat forever
      true, // reverse each cycle → smooth up/down bob
    );
  }, [ty]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));
  return (
    <Animated.View style={style} pointerEvents="none">
      <Ionicons name="chevron-up" size={18} color="#ffffff" />
    </Animated.View>
  );
}

// ── SongTooltip ──────────────────────────────────────────────
// Small rounded bubble anchored under the speaker icon. Smoothly pops up
// (fade + scale + slight drop) on mount and marquee-scrolls the playing
// song's title. Tapping it opens the song link (e.g. YouTube).
function SongTooltip({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);
  const ty = useSharedValue(-4);
  useEffect(() => {
    // Single smooth scale-up — no spring overshoot/bounce.
    opacity.value = withTiming(1, { duration: 220 });
    scale.value = withTiming(1, {
      duration: 240,
      easing: ReEasing.out(ReEasing.cubic),
    });
    ty.value = withTiming(0, {
      duration: 240,
      easing: ReEasing.out(ReEasing.cubic),
    });
  }, [opacity, scale, ty]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.songTooltip, style]}>
      <View style={styles.songTooltipCaret} pointerEvents="none" />
      <Pressable
        onPress={onPress}
        hitSlop={8}
        style={styles.songTooltipPressable}
      >
        <Marquee text={title} />
      </Pressable>
    </Animated.View>
  );
}

// ── Marquee ──────────────────────────────────────────────────
// Horizontally scrolls `text` inside a fixed-width clipped window: scrolls
// once fully through, pauses, snaps back, then repeats. If the text fits the
// window, it renders static (no animation).
const MARQUEE_SPEED = 45; // px per second
const MARQUEE_START_PAUSE = 3000; // ms held at the beginning before each pass
function Marquee({ text }: { text: string }) {
  const [windowWidth, setWindowWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const tx = useSharedValue(0);

  const distance = Math.max(0, contentWidth - windowWidth);
  useEffect(() => {
    tx.value = 0;
    if (distance <= 0 || windowWidth === 0) return;
    const duration = Math.max(1200, (distance / MARQUEE_SPEED) * 1000);
    // Pause 3s at the start, slide fully through so the whole title is read,
    // snap back to the beginning, then repeat.
    tx.value = withRepeat(
      withSequence(
        withDelay(
          MARQUEE_START_PAUSE,
          withTiming(-distance, {
            duration,
            easing: ReEasing.linear,
          }),
        ),
        withTiming(0, { duration: 0 }), // snap back to the beginning
      ),
      -1,
    );
  }, [distance, windowWidth, tx]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  return (
    <View
      style={styles.marqueeWindow}
      onLayout={(e) => setWindowWidth(e.nativeEvent.layout.width)}
    >
      {/* Hidden measurer in a wide (1000px) container so Android does NOT
          clamp the single line to the 126px window — gives the true width. */}
      <View style={styles.marqueeMeasure} pointerEvents="none">
        <Text
          numberOfLines={1}
          style={styles.marqueeText}
          onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
        >
          {text}
        </Text>
      </View>
      {/* Visible text rendered at its full measured width (no ellipsis on
          either platform); the window's overflow:hidden clips it and
          translateX scrolls it. */}
      <Animated.Text
        numberOfLines={1}
        style={[
          styles.marqueeText,
          contentWidth > 0 ? { width: contentWidth } : null,
          style,
        ]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

// ── SlideFace ────────────────────────────────────────────────
function SlideFace({ slide }: { slide: StorySlideInput | undefined }) {
  if (!slide) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
        <Image
          source={require('@/assets/illustration/story-bg.png')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }
  const overlayTextColor = slide.textColor || '#000000';
  return (
    <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
      {/* Shared illustration backdrop — fills the letterbox behind every
          (contain-fitted) slide; fully covered by cover/video slides. */}
      <Image
        source={require('@/assets/illustration/story-bg.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      {slide.backgroundUrl ? (
        <Image
          source={{ uri: slide.backgroundUrl }}
          style={StyleSheet.absoluteFill}
          contentFit={slide.imageFit ?? 'cover'}
        />
      ) : null}
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

// ── VideoSlideFace ───────────────────────────────────────────
// Mounted (keyed on the video URL) only for video slides. Owns one expo-video
// player: plays with sound, mirrors the viewer's mute/pause state, feeds the
// progress bar from playback position, and advances on `playToEnd`.
function VideoSlideFace({
  slide,
  muted,
  paused,
  onProgress,
  onEnded,
}: {
  slide: StorySlideInput;
  muted: boolean;
  paused: boolean;
  onProgress: (fraction: number) => void;
  onEnded: () => void;
}) {
  const player = useVideoPlayer(slide.videoUrl ?? '', (p) => {
    p.loop = false;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.2;
  });

  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  // Latest callbacks without resubscribing the native listener every render.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // Drive the viewer's progress bar from playback position.
  useEffect(() => {
    const dur = player.duration || 0;
    if (dur > 0) onProgressRef.current(Math.min(1, (currentTime || 0) / dur));
  }, [currentTime, player]);

  // Advance to the next slide when the clip finishes.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => onEndedRef.current());
    return () => sub.remove();
  }, [player]);

  // Mirror the viewer's mute + long-press-pause state onto the player.
  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      /* stale player ref — ignore */
    }
  }, [muted, player]);

  useEffect(() => {
    try {
      if (paused) player.pause();
      else player.play();
    } catch {
      /* stale player ref — ignore */
    }
  }, [paused, player]);

  const overlayTextColor = slide.textColor || '#000000';
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="cover"
      />
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
    backgroundColor: '#00498B',
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
  songTooltip: {
    position: 'absolute',
    top: 44,
    right: 30,
    maxWidth: 150,
    backgroundColor: 'rgba(40,40,40,0.92)',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  songTooltipCaret: {
    position: 'absolute',
    top: -5,
    right: 14,
    width: 10,
    height: 10,
    backgroundColor: 'rgba(40,40,40,0.92)',
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  songTooltipPressable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  marqueeWindow: {
    width: 126,
    height: 16,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  marqueeMeasure: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1000,
    opacity: 0,
  },
  marqueeText: {
    position: 'absolute',
    left: 0,
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter-Medium',
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
