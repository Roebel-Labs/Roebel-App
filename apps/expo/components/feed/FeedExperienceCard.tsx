import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { PostRecord } from '@/lib/types/feed';
import PostAuthorRow from './PostAuthorRow';
import PostLinkedEventCard from './PostLinkedEventCard';
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
        post.linked_event?.title
          ? `Erlebnis bei ${post.linked_event.title} öffnen`
          : 'Erlebnis öffnen'
      }
    >
      <PostAuthorRow author={post.author} createdAt={post.created_at} onMore={onMore} />

      {!!post.content && (
        <Text
          style={[styles.headline, { color: colors.textPrimary }]}
          numberOfLines={3}
        >
          {post.content}
        </Text>
      )}

      {post.linked_event && <PostLinkedEventCard event={post.linked_event} />}

      <PostActions
        likesCount={displayLikeCount}
        commentsCount={post.comments_count}
        isLiked={isLiked}
        onLike={onLike}
        onComment={openEvent}
        onShare={onShare}
        iconOnly
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    overflow: 'hidden',
    gap: 14,
  },
  headline: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 28,
  },
});
