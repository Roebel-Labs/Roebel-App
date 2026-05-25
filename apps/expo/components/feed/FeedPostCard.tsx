import React, { useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { PostRecord } from '@/lib/types/feed';
import PostAuthorRow from './PostAuthorRow';
import PostImageGrid from './PostImageGrid';
import PostVideoPlayer from './PostVideoPlayer';
import PostLinkPreview from './PostLinkPreview';
import PostYouTubePreview from './PostYouTubePreview';
import PostPollView from './PostPollView';
import PostLinkedEventCard from './PostLinkedEventCard';
import PostLinkedMarketplaceCard from './PostLinkedMarketplaceCard';
import PostActions from './PostActions';
import ImageZoomModal from '@/components/ImageZoomModal';
import { resolveYouTubeUrl } from '@/lib/utils/youtube';

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

export default function FeedPostCard({
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
  const youtubeUrl = resolveYouTubeUrl(post.content, post.links?.map((l) => l.url));
  const isMarketplacePost = !!post.linked_marketplace;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        isMarketplacePost && styles.containerMarketplace,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <PostAuthorRow
        author={post.author}
        category={isMarketplacePost ? undefined : post.category}
        createdAt={post.created_at}
        onMore={onMore}
      />

      <Text style={[styles.content, { color: colors.textPrimary }]}>{post.content}</Text>

      {post.linked_event && (
        <PostLinkedEventCard event={post.linked_event} />
      )}

      {post.linked_marketplace && (
        <PostLinkedMarketplaceCard listing={post.linked_marketplace} />
      )}

      {mediaUrls.length > 0 && (
        <PostImageGrid imageUrls={mediaUrls} onPress={(i) => setZoomImageUrl(mediaUrls[i])} />
      )}

      {post.video_url && (
        <PostVideoPlayer videoUrl={post.video_url} isVisible={isVisible} />
      )}

      {post.sticker && (
        <Image
          source={{ uri: post.sticker.asset_url }}
          style={styles.sticker}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      )}

      {youtubeUrl ? (
        <PostYouTubePreview youtubeUrl={youtubeUrl} title={firstLink?.og_title ?? null} />
      ) : firstLink ? (
        <PostLinkPreview link={firstLink} />
      ) : null}

      {post.poll && (
        <PostPollView poll={post.poll} walletAddress={walletAddress} />
      )}

      <PostActions
        likesCount={displayLikeCount}
        commentsCount={post.comments_count}
        isLiked={isLiked}
        onLike={onLike}
        onComment={handleComment}
        onShare={onShare}
        iconOnly={isMarketplacePost}
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
    gap: 10,
  },
  containerMarketplace: {
    paddingVertical: 16,
    borderRadius: 20,
    gap: 14,
  },
  content: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  sticker: {
    width: 200,
    height: 200,
    alignSelf: 'flex-start',
  },
});
