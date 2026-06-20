import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/context/ThemeContext';
import type { AudioPlayerData } from '@/lib/types/feed';
import PlayIcon from '@/assets/icons/play.svg';
import PauseIcon from '@/assets/icons/pause.svg';

// ─── Defensive expo-audio load ──────────────────────────────
// expo-audio is a NATIVE MODULE — requiring it throws on an older binary that
// predates the package (e.g. when running via an EAS Update). Swallow the
// failure and fall back to stub hooks; the card then renders static (no spin,
// no playback) instead of crashing. After the next `eas build`, the real hooks
// take over automatically. Mirrors the pattern in StoryViewer.tsx.
type AudioPlayerLike = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void | Promise<void>;
  playing: boolean;
  currentTime: number;
  duration: number;
  loop: boolean;
} | null;

type AudioStatusLike = {
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  didJustFinish?: boolean;
  isLoaded?: boolean;
};

type UseAudioPlayerFn = (source: unknown, updateInterval?: number) => AudioPlayerLike;
type UseAudioPlayerStatusFn = (player: AudioPlayerLike) => AudioStatusLike;
type SetAudioModeFn = (mode: Record<string, unknown>) => Promise<void>;

let useAudioPlayer: UseAudioPlayerFn = () => null;
let useAudioPlayerStatus: UseAudioPlayerStatusFn = () => ({});
let setAudioModeAsync: SetAudioModeFn = async () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-audio');
  if (mod?.useAudioPlayer) useAudioPlayer = mod.useAudioPlayer as UseAudioPlayerFn;
  if (mod?.useAudioPlayerStatus) useAudioPlayerStatus = mod.useAudioPlayerStatus as UseAudioPlayerStatusFn;
  if (mod?.setAudioModeAsync) setAudioModeAsync = mod.setAudioModeAsync as SetAudioModeFn;
} catch (err) {
  console.warn(
    '[FeedAudioPlayerCard] expo-audio native module unavailable — audio disabled. ' +
      'Run `eas build` to ship a binary that includes it.',
    err,
  );
}

// ─── Defensive expo-keep-awake load ─────────────────────────
// Keeps the screen from sleeping while the track plays (same effect video
// playback has). Native module — guard the require like expo-audio above.
type KeepAwakeFn = (tag?: string) => Promise<void>;
let activateKeepAwakeAsync: KeepAwakeFn = async () => {};
let deactivateKeepAwake: KeepAwakeFn = async () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ka = require('expo-keep-awake');
  if (ka?.activateKeepAwakeAsync) activateKeepAwakeAsync = ka.activateKeepAwakeAsync as KeepAwakeFn;
  if (ka?.deactivateKeepAwake) deactivateKeepAwake = ka.deactivateKeepAwake as KeepAwakeFn;
} catch (err) {
  console.warn('[FeedAudioPlayerCard] expo-keep-awake unavailable — screen may sleep during playback.', err);
}
const KEEP_AWAKE_TAG = 'roebel-audio-player';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TRACK_SOURCE = require('@/assets/audio/roebel-bleibt.mp3');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const COVER_SOURCE = require('@/assets/audio/cover.png');

// Fixed waveform silhouette (normalized 0..1 bar heights) — purely decorative,
// coloured up to the playback progress to read as a scrubber.
const WAVEFORM = [
  0.45, 0.7, 0.55, 0.85, 0.4, 0.6, 0.5, 0.75, 0.45, 0.65, 0.55, 0.8, 0.5, 0.6,
  0.45, 0.7, 0.5, 0.85, 0.55, 0.65, 0.4, 0.6, 0.5, 0.75, 0.45, 0.7, 0.55, 0.6,
  0.5, 0.8, 0.45, 0.65, 0.55, 0.7,
];

const PLATE_SIZE = 112;
const BUTTON_SIZE = 54;
const WAVEFORM_HEIGHT = 30;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type Props = {
  data: AudioPlayerData;
};

export default function FeedAudioPlayerCard({ data }: Props) {
  const { colors } = useTheme();

  const player = useAudioPlayer(TRACK_SOURCE, 250);
  const status = useAudioPlayerStatus(player);

  const [isPlaying, setIsPlaying] = useState(false);
  const waveformWidth = useRef(0);

  const currentTime = status?.currentTime ?? 0;
  const duration = status?.duration ?? 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // ── Rotating plate ──────────────────────────────────────
  const rotation = useSharedValue(0);
  const plateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    if (isPlaying) {
      // 360° steps make the 360→0 wrap seamless and resume from the frozen angle.
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 8000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [isPlaying, rotation]);

  // ── Play-once: reset when the track finishes ────────────
  useEffect(() => {
    if (status?.didJustFinish) {
      try {
        player?.pause();
        player?.seekTo(0);
      } catch {
        /* noop */
      }
      setIsPlaying(false);
    }
  }, [status?.didJustFinish, player]);

  // ── Keep the screen awake while playing ─────────────────
  // Playback continues even when the card scrolls off-screen, so hold a wake
  // lock for the duration and release it on pause / finish / unmount.
  useEffect(() => {
    if (!isPlaying) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [isPlaying]);

  // ── Stop when the app leaves the foreground ─────────────
  // Without background-audio mode the OS suspends the session on close and would
  // otherwise auto-resume on the next launch. Explicitly stop so the track stays
  // paused until the user taps play again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        try {
          player?.pause();
        } catch {
          /* noop */
        }
        setIsPlaying(false);
      }
    });
    return () => sub.remove();
  }, [player]);

  const toggle = useCallback(async () => {
    if (!player) return;
    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        await setAudioModeAsync({ playsInSilentMode: true });
        if (progress >= 1) player.seekTo(0);
        player.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn('[FeedAudioPlayerCard] playback toggle failed:', err);
    }
  }, [player, isPlaying, progress]);

  const onWaveformLayout = useCallback((e: LayoutChangeEvent) => {
    waveformWidth.current = e.nativeEvent.layout.width;
  }, []);

  const onWaveformPress = useCallback(
    (e: GestureResponderEvent) => {
      if (!player || duration <= 0 || waveformWidth.current <= 0) return;
      const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / waveformWidth.current));
      try {
        player.seekTo(ratio * duration);
      } catch {
        /* noop */
      }
    },
    [player, duration],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      {/* Plate */}
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Abspielen'}>
        <View style={styles.plate}>
          <Animated.View style={[styles.coverWrap, plateStyle]}>
            <Image source={COVER_SOURCE} style={styles.cover} contentFit="cover" />
          </Animated.View>
          <View style={styles.buttonOverlay} pointerEvents="none">
            <BlurView intensity={40} tint="light" style={styles.blurCircle}>
              {isPlaying ? (
                <PauseIcon width={20} height={20} color="#1f2937" />
              ) : (
                <PlayIcon width={22} height={22} color="#1f2937" style={styles.playIcon} />
              )}
            </BlurView>
          </View>
        </View>
      </Pressable>

      {/* Meta + waveform */}
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {data.subtitle}
        </Text>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {data.title}
        </Text>
        <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
          {data.artist}
        </Text>

        <View style={styles.controls}>
          <Pressable style={styles.waveform} onLayout={onWaveformLayout} onPress={onWaveformPress}>
            {WAVEFORM.map((h, i) => {
              const filled = i / WAVEFORM.length <= progress;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: 6 + h * (WAVEFORM_HEIGHT - 6),
                      backgroundColor: filled ? colors.primary : colors.textTertiary,
                    },
                  ]}
                />
              );
            })}
          </Pressable>
          <Text style={[styles.time, { color: colors.textTertiary }]}>{formatTime(currentTime)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 20,
    padding: 16,
  },
  plate: {
    width: PLATE_SIZE,
    height: PLATE_SIZE,
    borderRadius: PLATE_SIZE / 2,
    overflow: 'hidden',
    position: 'relative',
  },
  coverWrap: {
    width: PLATE_SIZE,
    height: PLATE_SIZE,
  },
  cover: {
    width: PLATE_SIZE,
    height: PLATE_SIZE,
  },
  buttonOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurCircle: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // Frosted-glass fallback tint (Android blur is limited) + subtle ring.
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  playIcon: {
    marginLeft: 2,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    lineHeight: 22,
    marginBottom: 2,
  },
  artist: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: WAVEFORM_HEIGHT,
  },
  bar: {
    width: 2.5,
    borderRadius: 2,
  },
  time: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    minWidth: 34,
    textAlign: 'right',
  },
});
