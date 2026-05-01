import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { PostRecord } from '@/lib/types/feed';
import PostAuthorRow from './PostAuthorRow';
import PostActions from './PostActions';

type Props = {
  post: PostRecord;
  isLiked: boolean;
  displayLikeCount: number;
  onLike: () => void;
  onShare: () => void;
  onMore?: () => void;
};

export default function FeedExperienceCard({
  post,
  isLiked,
  displayLikeCount,
  onLike,
  onShare,
  onMore,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const eventTitle = post.linked_event?.title;
  const eventBanner = post.linked_event?.image_url;
  const firstMedia = post.media_urls?.find(Boolean) ?? null;

  const openEvent = () => {
    if (!post.linked_event_id) return;
    router.push({
      pathname: '/event/[id]',
      params: {
        id: post.linked_event_id,
        ...(post.linked_experience_id ? { experienceId: post.linked_experience_id } : {}),
      },
    });
  };

  return (
    <Pressable
      onPress={openEvent}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        eventTitle ? `Erlebnis bei ${eventTitle} öffnen` : 'Erlebnis öffnen'
      }
    >
      <PostAuthorRow author={post.author} createdAt={post.created_at} />

      {eventTitle && (
        <View style={styles.eventLabelRow}>
          <Text style={[styles.eventLabelPrefix, { color: colors.textTertiary }]}>
            war bei:
          </Text>
          <Text
            style={[styles.eventLabelTitle, { color: colors.primary }]}
            numberOfLines={1}
          >
            {eventTitle}
          </Text>
        </View>
      )}

      {!!post.content && (
        <Text
          style={[styles.content, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {post.content}
        </Text>
      )}

      {(eventBanner || firstMedia) && (
        <View style={styles.thumbRow}>
          {eventBanner && (
            <Image
              source={{ uri: eventBanner }}
              style={[styles.thumb, { backgroundColor: colors.cardPlaceholder }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          )}
          {firstMedia && (
            <Image
              source={{ uri: firstMedia }}
              style={[styles.thumb, { backgroundColor: colors.cardPlaceholder }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          )}
        </View>
      )}

      <PostActions
        likesCount={displayLikeCount}
        commentsCount={post.comments_count}
        isLiked={isLiked}
        onLike={onLike}
        onComment={openEvent}
        onShare={onShare}
        onMore={onMore}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    overflow: 'hidden',
    gap: 8,
  },
  eventLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventLabelPrefix: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  eventLabelTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  content: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 8,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
});
