import React, { useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { PostRecord } from '@/lib/types/feed';
import PostAuthorRow from './PostAuthorRow';
import PostImageGrid from './PostImageGrid';
import PostLinkedEventCard from './PostLinkedEventCard';
import PostActions from './PostActions';
import ImageZoomModal from '@/components/ImageZoomModal';

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
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const mediaUrls = post.media_urls?.filter(Boolean) || [];

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
    <>
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

        {post.content?.trim() ? (
          <Text
            style={[styles.content, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {post.content}
          </Text>
        ) : null}

        {mediaUrls.length > 0 && (
          <PostImageGrid imageUrls={mediaUrls} onPress={(i) => setZoomImageUrl(mediaUrls[i])} />
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

      <ImageZoomModal
        visible={!!zoomImageUrl}
        imageUrl={zoomImageUrl || ''}
        images={mediaUrls}
        onClose={() => setZoomImageUrl(null)}
      />
    </>
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
  content: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
});
