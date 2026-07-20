import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { NewsArticle } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { formatPublishDate, calculateReadTime } from '@/lib/utils';
import { transformedImageUrl } from '@/lib/image-url';

type Props = {
  article: NewsArticle;
  compact?: boolean;
};

export default function NewsCard({ article, compact = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const publishDate = formatPublishDate(article.published_at);
  const readTime = calculateReadTime(article.content);

  return (
    <Pressable
      onPress={() => router.push(`/news/${article.slug}` as any)}
      style={({ pressed }) => [
        compact ? styles.cardCompact : styles.card,
        { backgroundColor: colors.background },
        pressed && styles.pressed
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${article.title} lesen`}
    >
      <View style={compact ? styles.imageContainerCompact : styles.imageContainer}>
        {article.cover_image_url ? (
          <Image
            source={{ uri: transformedImageUrl(article.cover_image_url, { width: 640 }) ?? undefined }}
            style={compact ? styles.imageCompact : styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={article.cover_image_url ?? undefined}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={compact ? [styles.imagePlaceholderCompact, { backgroundColor: colors.surfaceSecondary }] : [styles.imagePlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.placeholderText}>📰</Text>
          </View>
        )}
      </View>

      <View style={compact ? styles.contentContainerCompact : styles.contentContainer}>
        <Text style={compact ? [styles.titleCompact, { color: colors.textPrimary }] : [styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {article.title}
        </Text>

        {!compact && article.excerpt && (
          <Text style={[styles.excerpt, { color: colors.textSecondary }]} numberOfLines={3}>
            {article.excerpt}
          </Text>
        )}

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>{article.author_name}</Text>
          {readTime && (
            <>
              <Text style={[styles.metaDot, { color: colors.textTertiary }]}>•</Text>
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>{readTime}</Text>
            </>
          )}
        </View>

        <Text style={[styles.dateText, { color: colors.textTertiary }]}>{publishDate}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  cardCompact: {
    width: 240,
    marginRight: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageContainerCompact: {
    width: '100%',
    height: 140,
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
  contentContainer: {
    paddingVertical: 16,
    paddingHorizontal: 0,
  },
  contentContainerCompact: {
    paddingTop: 12,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 24,
  },
  titleCompact: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    lineHeight: 22,
  },
  excerpt: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 13,
  },
  metaDot: {
    fontSize: 13,
    marginHorizontal: 6,
  },
  dateText: {
    fontSize: 12,
  },
});
