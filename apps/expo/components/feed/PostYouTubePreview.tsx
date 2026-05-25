import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import YouTubeEmbed from '@/components/YouTubeEmbed';
import {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  getYouTubeThumbnailFallback,
} from '@/lib/utils/youtube';

const PLAYER_HEIGHT = 200;

type Props = {
  youtubeUrl: string;
  title?: string | null;
};

/**
 * YouTube link preview for feed posts. Shows a 16:9 thumbnail with a red play
 * button; tapping the thumbnail mounts the inline player (lazy — the WebView is
 * only created on demand). Tapping anywhere outside the thumbnail bubbles to the
 * surrounding post card so the post still opens.
 */
export default function PostYouTubePreview({ youtubeUrl, title }: Props) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) return null;

  if (playing) {
    return (
      <View style={styles.wrapper}>
        <YouTubeEmbed youtubeUrl={youtubeUrl} height={PLAYER_HEIGHT} />
      </View>
    );
  }

  const thumbnail = thumbFailed
    ? getYouTubeThumbnailFallback(videoId)
    : getYouTubeThumbnail(videoId);

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => setPlaying(true)}
        style={({ pressed }) => [
          styles.thumbnailContainer,
          { backgroundColor: colors.cardPlaceholder },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Video abspielen"
      >
        <Image
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setThumbFailed(true)}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.playButton}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </Pressable>
      <View style={styles.info}>
        <Text style={[styles.siteName, { color: colors.textTertiary }]}>YOUTUBE</Text>
        {title ? (
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  thumbnailContainer: {
    height: PLAYER_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#ffffff',
    fontSize: 22,
    marginLeft: 3,
  },
  info: {
    gap: 2,
  },
  siteName: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
});
