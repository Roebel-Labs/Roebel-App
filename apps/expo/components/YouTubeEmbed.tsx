import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useTheme } from '@/context/ThemeContext';
import { extractYouTubeVideoId } from '@/lib/utils/youtube';

type Props = {
  youtubeUrl: string;
  height?: number;
  borderRadius?: number;
  autoplay?: boolean;
};

export default function YouTubeEmbed({ youtubeUrl, height = 220, borderRadius = 12, autoplay = true }: Props) {
  const { colors } = useTheme();
  const [error, setError] = useState(false);

  const onError = useCallback(() => {
    setError(true);
  }, []);

  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) return null;

  const handleOpenInYouTube = () => {
    Linking.openURL(youtubeUrl).catch(console.error);
  };

  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.surface, height, borderRadius }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          Video konnte nicht geladen werden
        </Text>
        <Pressable
          style={[styles.fallbackButton, { backgroundColor: colors.primary }]}
          onPress={handleOpenInYouTube}
        >
          <Text style={styles.fallbackButtonText}>Auf YouTube öffnen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderRadius }]}>
      <YoutubePlayer
        height={height}
        videoId={videoId}
        play={autoplay}
        onError={onError}
        webViewProps={{
          allowsInlineMediaPlayback: true,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  errorContainer: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  fallbackButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  fallbackButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
