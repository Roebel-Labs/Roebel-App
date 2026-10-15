import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { fontFamily } from '@/constants/theme';
import { DEFAULT_AUDIO_ACCENT } from '@/lib/audio-content';
import { useAudioPlayerControls, useAudioPlaybackStatus } from '@/context/AudioPlayerContext';

/**
 * Floating "now playing" bar. Renders nothing while no episode is loaded.
 * Positioned by the parent (Explore puts it above the glass bottom nav).
 */
function MiniPlayer({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { track, toggle, close } = useAudioPlayerControls();

  if (!track) return null;
  const { episode, show } = track;
  const cover = episode.cover_url ?? show.cover_url;
  const accent = show.accent_color ?? DEFAULT_AUDIO_ACCENT;

  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={style}>
      <Pressable
        onPress={() => router.push('/audio/player' as never)}
        style={[styles.bar, { backgroundColor: accent }]}
        accessibilityRole="button"
        accessibilityLabel={`Player öffnen: ${episode.title}`}
      >
        <View style={styles.cover}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        </View>
        <View style={styles.text}>
          <Text style={styles.show} numberOfLines={1}>
            {show.title}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {episode.title}
          </Text>
        </View>
        <PlayPause onPress={toggle} />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            close();
          }}
          hitSlop={10}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Wiedergabe beenden"
        >
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.75)" />
        </Pressable>
        <ProgressLine />
      </Pressable>
    </Animated.View>
  );
}

function PlayPause({ onPress }: { onPress: () => void }) {
  const { playing, isBuffering } = useAudioPlaybackStatus();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      hitSlop={8}
      style={styles.playButton}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pausieren' : 'Abspielen'}
    >
      <Ionicons
        name={playing ? 'pause' : isBuffering ? 'ellipsis-horizontal' : 'play'}
        size={20}
        color="#000"
        style={!playing && !isBuffering ? { marginLeft: 2 } : undefined}
      />
    </Pressable>
  );
}

function ProgressLine() {
  const { currentTime, duration } = useAudioPlaybackStatus();
  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  return (
    <View style={styles.track} pointerEvents="none">
      <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    gap: 10,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  show: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.65)',
  },
  title: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: '#fff',
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 28,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 3,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
});

export default memo(MiniPlayer);
