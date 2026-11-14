import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fontFamily } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAudioPlayerControls, useAudioPlaybackStatus } from '@/context/AudioPlayerContext';

/**
 * "Now playing" inside the system tab bar's accessory (iOS 26+). The system
 * draws the glass capsule around it; we only lay out the content. Expanded
 * ('regular') above the tab bar it shows cover, show and title; collapsed
 * ('inline', when the bar shrinks on scroll) only the title.
 */
export default function TabBarAccessoryPlayer() {
  const router = useRouter();
  const { colors } = useTheme();
  const { track, toggle } = useAudioPlayerControls();
  const placement = NativeTabs.BottomAccessory.usePlacement();

  if (!track) return null;
  const { episode, show } = track;
  const cover = episode.cover_url ?? show.cover_url;
  const inline = placement === 'inline';

  return (
    <Pressable
      onPress={() => router.push('/audio/player' as never)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`Player öffnen: ${episode.title}`}
    >
      {!inline && (
        <View style={styles.cover}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        </View>
      )}
      <View style={styles.text}>
        {!inline && (
          <Text style={[styles.show, { color: colors.textSecondary }]} numberOfLines={1}>
            {show.title}
          </Text>
        )}
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {episode.title}
        </Text>
      </View>
      <PlayPause onPress={toggle} color={colors.textPrimary} />
    </Pressable>
  );
}

function PlayPause({ onPress, color }: { onPress: () => void; color: string }) {
  const { playing, isBuffering } = useAudioPlaybackStatus();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      hitSlop={10}
      style={styles.play}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pausieren' : 'Abspielen'}
    >
      <Ionicons name={playing ? 'pause' : isBuffering ? 'ellipsis-horizontal' : 'play'} size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  cover: {
    width: 32,
    height: 32,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(127,127,127,0.2)',
  },
  text: { flex: 1, minWidth: 0 },
  show: { fontSize: 11, fontFamily: fontFamily.regular },
  title: { fontSize: 14, fontFamily: fontFamily.semiBold },
  play: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
