import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatClock, mediaSubtitle, mediaTitle, type MediaLink } from '@/lib/chat/media-links';
import { chatFont, useChatTokens } from './tokens';

// ─── Defensive expo-audio load ──────────────────────────────
// Native module: requiring it throws on a binary that predates the package. Fall back to stubs and
// open the file in the browser instead of crashing. Mirrors components/news/ArticleListenRow.tsx.
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
  if (mod?.useAudioPlayer && mod?.useAudioPlayerStatus) {
    useAudioPlayer = mod.useAudioPlayer as UseAudioPlayerFn;
    useAudioPlayerStatus = mod.useAudioPlayerStatus as UseAudioPlayerStatusFn;
    audioModuleAvailable = true;
  }
  if (mod?.setAudioModeAsync) setAudioModeAsync = mod.setAudioModeAsync as SetAudioModeFn;
} catch (err) {
  console.warn('[MediaLinkRow] expo-audio native module unavailable, audio opens in the browser.', err);
}

export type MediaLinkRowProps = {
  link: MediaLink;
  /** Opens a URL in the in-app browser (video, and audio when the player is unavailable). */
  onOpen?: (url: string) => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** A generated MP3 (plays inline) or MP4 (opens in the in-app browser) from a `sources` part. */
export function MediaLinkRow({ link, onOpen, onLongPress, style }: MediaLinkRowProps) {
  const open = useCallback(
    (url: string) => (onOpen ? onOpen(url) : Linking.openURL(url).catch(() => {})),
    [onOpen],
  );
  if (link.kind === 'audio' && audioModuleAvailable) {
    return <AudioRow link={link} onOpen={open} onLongPress={onLongPress} style={style} />;
  }
  return (
    <RowShell
      title={mediaTitle(link)}
      subtitle={link.kind === 'video' ? `${mediaSubtitle('video')} · Tippen zum Ansehen` : mediaSubtitle('audio')}
      icon="play"
      label={link.kind === 'video' ? `${mediaTitle(link)} ansehen` : `${mediaTitle(link)} anhören`}
      onPress={() => open(link.url)}
      onLongPress={onLongPress}
      style={style}
    />
  );
}

function AudioRow({
  link,
  onOpen,
  onLongPress,
  style,
}: {
  link: MediaLink;
  onOpen: (url: string) => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  // The file is only loaded after the first tap, so a thread full of recordings stays cheap.
  const [source, setSource] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const playWhenLoaded = useRef(false);
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const playing = Boolean(status.playing);
  const duration = status.duration && status.duration > 0 ? status.duration : 0;
  const current = status.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
  const loaded = Boolean(source && status.isLoaded);

  useEffect(() => {
    if (playWhenLoaded.current && status.isLoaded && player) {
      playWhenLoaded.current = false;
      setWaiting(false);
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

  // A file that never loads must not spin forever: offer the browser instead.
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      playWhenLoaded.current = false;
      setWaiting(false);
      setSource(null);
      onOpen(link.url);
    }, 15_000);
    return () => clearTimeout(timer);
  }, [waiting, link.url, onOpen]);

  const toggle = () => {
    if (waiting) return;
    if (loaded && player) {
      if (playing) player.pause();
      else player.play();
      return;
    }
    playWhenLoaded.current = true;
    setWaiting(true);
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    setSource(link.url);
  };

  const started = loaded && (playing || current > 0);
  return (
    <RowShell
      title={mediaTitle(link)}
      subtitle={started ? `${formatClock(current)} / ${formatClock(duration)}` : waiting ? 'Wird geladen …' : mediaSubtitle('audio')}
      icon={playing ? 'pause' : 'play'}
      busy={waiting}
      progress={started ? progress : undefined}
      label={playing ? `${mediaTitle(link)} pausieren` : `${mediaTitle(link)} anhören`}
      onPress={toggle}
      onLongPress={onLongPress}
      style={style}
    />
  );
}

function RowShell({
  title,
  subtitle,
  icon,
  busy,
  progress,
  label,
  onPress,
  onLongPress,
  style,
}: {
  title: string;
  subtitle: string;
  icon: 'play' | 'pause';
  busy?: boolean;
  /** 0..1; the bar is hidden while undefined. */
  progress?: number;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useChatTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [styles.card, { backgroundColor: t.bubbleBot, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <View style={[styles.button, { backgroundColor: t.primaryButton }]}>
        {busy ? (
          <ActivityIndicator size="small" color={t.primaryButtonText} />
        ) : (
          <Ionicons name={icon} size={18} color={t.primaryButtonText} style={icon === 'play' ? styles.playGlyph : undefined} />
        )}
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, { color: t.textPrimary }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: t.textTertiary }]}>
          {subtitle}
        </Text>
        {progress !== undefined ? (
          <View style={[styles.track, { backgroundColor: t.separator }]}>
            <View style={[styles.fill, { backgroundColor: t.textPrimary, width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: 22,
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 9,
    maxWidth: '80%',
    minWidth: 220,
  },
  button: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  playGlyph: { marginLeft: 2 },
  text: { marginLeft: 11, flexShrink: 1, flexGrow: 1 },
  title: { fontFamily: chatFont.medium, fontSize: 16, letterSpacing: -0.2 },
  subtitle: { fontFamily: chatFont.regular, fontSize: 13, marginTop: 2 },
  track: { height: 3, borderRadius: 1.5, marginTop: 6, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 1.5 },
});

export default MediaLinkRow;
