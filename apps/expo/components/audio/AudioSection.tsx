import React, { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import {
  AUDIO_KIND_LABEL,
  DEFAULT_AUDIO_ACCENT,
  fetchAudioShows,
  type AudioShowWithEpisodes,
} from '@/lib/audio-content';
import { useAudioPlayerControls, useAudioPlaybackStatus } from '@/context/AudioPlayerContext';
import { RAIL_LIST_PROPS } from '@/components/railListProps';

export const AUDIO_SHOWS_QUERY_KEY = ['explore', 'audio-shows'] as const;

const CARD_SIZE = 148;

function AudioCard({ show }: { show: AudioShowWithEpisodes }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { track } = useAudioPlayerControls();
  const isCurrent = track?.show.id === show.id;
  const subtitle = [AUDIO_KIND_LABEL[show.kind], show.author].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => router.push(`/audio/${show.id}` as never)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${show.title}, ${subtitle}`}
    >
      <View style={[styles.cover, { backgroundColor: show.accent_color ?? DEFAULT_AUDIO_ACCENT }]}>
        {show.cover_url ? (
          <Image
            source={{ uri: show.cover_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <Ionicons name="headset" size={40} color="rgba(255,255,255,0.7)" />
        )}
        <CardPlayButton show={show} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
        {show.title}
      </Text>
      <Text style={[styles.subtitle, { color: isCurrent ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
        {isCurrent ? 'Läuft gerade' : subtitle}
      </Text>
    </Pressable>
  );
}

/** Play/pause straight from the cover, like the Spotify shelf. Only this
 * button subscribes to the 4×/s status ticks. */
function CardPlayButton({ show }: { show: AudioShowWithEpisodes }) {
  const { available, track, playEpisode, toggle } = useAudioPlayerControls();
  const { playing } = useAudioPlaybackStatus();
  const isCurrent = track?.show.id === show.id;

  const onPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isCurrent) {
      toggle();
      return;
    }
    const first = show.episodes.find((e) => e.audio_url);
    if (first) playEpisode(first, show);
  }, [isCurrent, toggle, show, playEpisode]);

  if (!available) return null;
  const showPause = isCurrent && playing;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.playButton}
      accessibilityRole="button"
      accessibilityLabel={showPause ? 'Pausieren' : 'Abspielen'}
    >
      <Ionicons name={showPause ? 'pause' : 'play'} size={18} color="#000" style={showPause ? undefined : styles.playGlyph} />
    </Pressable>
  );
}

const renderItem = ({ item }: { item: AudioShowWithEpisodes }) => <AudioCard show={item} />;
const keyExtractor = (item: AudioShowWithEpisodes) => item.id;

function AudioSection() {
  const { colors } = useTheme();
  const { data } = useQuery({
    queryKey: AUDIO_SHOWS_QUERY_KEY,
    queryFn: fetchAudioShows,
    meta: { persist: true },
  });

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Hören</Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>Geschichten, Hörbücher & Podcasts</Text>
      </View>
      <FlatList
        horizontal
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={Separator}
        {...RAIL_LIST_PROPS}
      />
    </View>
  );
}

const Separator = () => <View style={{ width: 12 }} />;

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  sectionHint: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  card: {
    width: CARD_SIZE,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cover: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    marginLeft: 2,
  },
  title: {
    marginTop: 10,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: fontFamily.regular,
  },
});

export default memo(AudioSection);
