import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { PostRecord } from '@/lib/types/feed';
import PostAuthorRow from './PostAuthorRow';
import PostImageGrid from './PostImageGrid';
import PostVideoPlayer from './PostVideoPlayer';
import PostLinkPreview from './PostLinkPreview';
import PostActions from './PostActions';
import ImageZoomModal from '@/components/ImageZoomModal';

const MECKY_AVATAR = require('@/assets/images/icon.png');

type Props = {
  post: PostRecord;
  isLiked: boolean;
  displayLikeCount: number;
  walletAddress: string | undefined;
  isVisible?: boolean;
  onLike: () => void;
  onShare: () => void;
  onMore?: () => void;
};

export default function FeedMeckyCard({
  post,
  isLiked,
  displayLikeCount,
  walletAddress,
  isVisible = false,
  onLike,
  onShare,
  onMore,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const handlePress = () => {
    router.push(`/post/${post.id}` as any);
  };

  const handleComment = () => {
    router.push(`/post/${post.id}` as any);
  };

  const mediaUrls = post.media_urls?.filter(Boolean) || [];
  const firstLink = post.links && post.links.length > 0 ? post.links[0] : null;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.background,
          borderLeftColor: colors.primary,
        },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <PostAuthorRow
        author={post.author}
        createdAt={post.created_at}
        nameOverride="Mecky Bot"
        avatarOverride={MECKY_AVATAR}
        badge="Bot"
      />

      <Text style={[styles.content, { color: colors.textPrimary }]}>{post.content}</Text>

      {mediaUrls.length > 0 && (
        <PostImageGrid imageUrls={mediaUrls} onPress={(i) => setZoomImageUrl(mediaUrls[i])} />
      )}

      {post.video_url && (
        <PostVideoPlayer videoUrl={post.video_url} isVisible={isVisible} />
      )}

      {firstLink && <PostLinkPreview link={firstLink} />}

      <PostActions
        likesCount={displayLikeCount}
        commentsCount={post.comments_count}
        isLiked={isLiked}
        onLike={onLike}
        onComment={handleComment}
        onShare={onShare}
        onMore={onMore}
      />

      <ImageZoomModal
        visible={!!zoomImageUrl}
        imageUrl={zoomImageUrl || ''}
        onClose={() => setZoomImageUrl(null)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderLeftWidth: 3,
    gap: 10,
  },
  content: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
});
