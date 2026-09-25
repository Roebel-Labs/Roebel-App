import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchArticleNarration, formatClock } from '@/lib/news-audio';

// ─── Defensive expo-audio load ──────────────────────────────
// Native module: requiring it throws on a binary that predates the package.
// Fall back to stubs and hide the row instead of crashing. Mirrors
// FeedAudioPlayerCard.tsx / StoryViewer.tsx.
type AudioPlayerLike = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void | Promise<void>;
} | null;
type AudioStatusLike = {
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  didJustFinish?: boolean;
  isLoaded?: boolean;
};
type UseAudioPlayerFn = (source: unknown, options?: { updateInterval?: number }) => AudioPlayerLike;
type UseAudioPlayerStatusFn = (player: AudioPlayerLike) => AudioStatusLike;
type SetAudioModeFn = (mode: Record<string, unknown>) => Promise<void>;

let useAudioPlayer: UseAudioPlayerFn = () => null;
let useAudioPlayerStatus: UseAudioPlayerStatusFn = () => ({});
let setAudioModeAsync: SetAudioModeFn = async () => {};
let audioModuleAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-audio');
  if (mod?.useAudioPlayer) {
    useAudioPlayer = mod.useAudioPlayer as UseAudioPlayerFn;
    audioModuleAvailable = true;
  }
  if (mod?.useAudioPlayerStatus) useAudioPlayerStatus = mod.useAudioPlayerStatus as UseAudioPlayerStatusFn;
  if (mod?.setAudioModeAsync) setAudioModeAsync = mod.setAudioModeAsync as SetAudioModeFn;
} catch (err) {
  console.warn('[ArticleListenRow] expo-audio native module unavailable — Vorlesen disabled.', err);
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';

type Props = {
  slug: string;
  /** Estimate shown until the real recording length is known. */
  estimatedMinutes: number;
  onMore: () => void;
};

export default function ArticleListenRow({ slug, estimatedMinutes, onMore }: Props) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [source, setSource] = useState<string | null>(null);
  const [knownDurationMs, setKnownDurationMs] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const playWhenLoaded = useRef(false);

  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const playing = Boolean(status.playing);
  const duration = status.duration && status.duration > 0 ? status.duration : (knownDurationMs ?? 0) / 1000;
  const current = status.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const started = phase === 'ready' && (playing || current > 0);

  // First load: start playback as soon as the file is ready.
  useEffect(() => {
    if (playWhenLoaded.current && status.isLoaded && player) {
      playWhenLoaded.current = false;
      player.play();
    }
  }, [status.isLoaded, player]);

  // Back to the start when the recording ends, so the button reads "play" again.
  useEffect(() => {
    if (status.didJustFinish && player) {
      player.pause();
      void player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const handlePress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (phase === 'loading') return;
    if (phase === 'ready' && player) {
      if (playing) player.pause();
      else player.play();
      return;
    }
    setPhase('loading');
    try {
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      const narration = await fetchArticleNarration(slug);
      playWhenLoaded.current = true;
      setKnownDurationMs(narration.durationMs);
      setSource(narration.url);
      setPhase('ready');
    } catch (err) {
      console.warn('[ArticleListenRow] narration failed:', err);
      setPhase('error');
    }
  }, [phase, player, playing, slug]);

  const handleSeek = useCallback(
    (e: GestureResponderEvent) => {
      if (!player || trackWidth <= 0 || duration <= 0) return;
      const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth));
      void player.seekTo(ratio * duration);
    },
    [player, trackWidth, duration],
  );

  if (!audioModuleAvailable) return null;

  const minutes = knownDurationMs ? Math.max(1, Math.round(knownDurationMs / 60_000)) : estimatedMinutes;
  const label = (() => {
    if (phase === 'loading') return 'WIRD VORBEREITET …';
    if (phase === 'error') return 'GERADE NICHT MÖGLICH';
    if (started) return `${formatClock(current)} / ${formatClock(duration)}`;
    return `${minutes} MIN`;
  })();

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Vorlesen pausieren' : 'Artikel vorlesen'}
          style={({ pressed }) => [
            styles.playButton,
            { backgroundColor: colors.textPrimary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {phase === 'loading' ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={20}
              color={colors.background}
              style={playing ? undefined : styles.playGlyph}
            />
          )}
        </Pressable>

        <View style={styles.labels}>
          <Text style={[styles.duration, { color: colors.textPrimary }]}>{label}</Text>
          <Text style={[styles.disclosure, { color: colors.textTertiary }]}>
            {phase === 'error' ? 'Tippe, um es erneut zu versuchen' : 'Vorlesen · Mecky, KI-Stimme'}
          </Text>
        </View>

        <Pressable
          onPress={onMore}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Weitere Optionen"
          style={styles.moreButton}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {started && (
        <Pressable
          onPress={handleSeek}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
          hitSlop={{ top: 12, bottom: 12 }}
          accessibilityRole="adjustable"
          accessibilityLabel="Wiedergabeposition"
          style={styles.trackHit}
        >
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.trackFill, { width: `${progress * 100}%`, backgroundColor: colors.textPrimary }]} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The play triangle sits optically left of center; nudge it.
  playGlyph: {
    marginLeft: 3,
  },
  labels: {
    flex: 1,
    gap: 2,
  },
  duration: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  disclosure: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
  },
  moreButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackHit: {
    marginTop: 16,
    paddingVertical: 6,
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: 3,
  },
});
