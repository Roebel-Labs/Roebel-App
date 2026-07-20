import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MovieRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { transformedImageUrl } from '@/lib/image-url';

type Props = {
  movie: MovieRecord;
  compact?: boolean;
};

export default function MovieCard({ movie, compact = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => router.push(`/movies/${movie.id}` as any)}
      style={({ pressed }) => [
        compact ? styles.cardCompact : styles.card,
        { backgroundColor: colors.background },
        pressed && styles.pressed
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${movie.title} ansehen`}
    >
      <View style={compact ? styles.imageContainerCompact : styles.imageContainer}>
        {movie.cover_image_url ? (
          <Image
            source={{ uri: transformedImageUrl(movie.cover_image_url, { width: 640 }) ?? undefined }}
            style={compact ? styles.imageCompact : styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={movie.cover_image_url ?? undefined}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={compact ? [styles.imagePlaceholderCompact, { backgroundColor: colors.surfaceSecondary }] : [styles.imagePlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.placeholderText}>🎬</Text>
          </View>
        )}

        {/* FSK Badge */}
        {movie.fsk && (
          <View style={styles.fskBadge}>
            <Text style={styles.fskText}>{movie.fsk}</Text>
          </View>
        )}
      </View>

      {!compact && (
        <View style={styles.contentContainer}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {movie.title}
          </Text>
          {movie.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
              {movie.description}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  cardCompact: {
    width: 160,
    marginRight: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 2 / 3, // Standard movie poster ratio
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageContainerCompact: {
    width: '100%',
    aspectRatio: 2 / 3,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imageCompact: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderCompact: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
  },
  fskBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fskText: {
    color: '#ffffff', // Intentionally white on dark overlay badge
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  contentContainer: {
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter',
    lineHeight: 18,
  },
});
