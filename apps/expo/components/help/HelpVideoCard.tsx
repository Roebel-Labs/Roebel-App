// apps/expo/components/help/HelpVideoCard.tsx

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Linking } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { HelpVideo } from '@/lib/types-help';

type Props = {
  video: HelpVideo;
};

export default function HelpVideoCard({ video }: Props) {
  const { colors } = useTheme();

  const handlePress = () => {
    Linking.openURL(video.youtube_url);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
  };

  return (
    <Pressable onPress={handlePress} style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.thumbnailContainer}>
        <Image
          source={{ uri: video.thumbnail_url }}
          style={styles.thumbnail}
          contentFit="cover"
        />
        <View style={styles.playButton}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          ▶ {video.duration} · {formatDate(video.published_date)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    height: 160,
    position: 'relative',
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 2,
  },
  info: {
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
});
