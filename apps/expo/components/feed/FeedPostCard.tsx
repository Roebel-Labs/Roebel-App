import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { PostRecord } from '@/lib/types/feed';
import { isPostPinned } from '@/lib/utils/pin';
import LinkifiedText from './LinkifiedText';
import PostAuthorRow from './PostAuthorRow';
import PostImageGrid from './PostImageGrid';
import PostVideoPlayer from './PostVideoPlayer';
import PostLinkPreview from './PostLinkPreview';
import PostYouTubePreview from './PostYouTubePreview';
import PostPollView from './PostPollView';
import PostLinkedEventCard from './PostLinkedEventCard';
import PostLinkedMarketplaceCard from './PostLinkedMarketplaceCard';
import StadtkasseSnapshotCard from './StadtkasseSnapshotCard';
import PostActions from './PostActions';
import PostViewersDrawer from './PostViewersDrawer';
import ImageZoomModal from '@/components/ImageZoomModal';
import { resolveYouTubeUrl, removeYouTubeUrls } from '@/lib/utils/youtube';

// Posts can hold up to 500 chars; in the feed we preview the first 250 and
// reveal the rest inline via "Mehr anzeigen". The detail screen shows it all.
const FEED_PREVIEW_LIMIT = 250;

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
  const [expanded, setExpanded] = useState(false);
  const [viewersVisible, setViewersVisible] = useState(false);

  const isOwnPost =
    !!walletAddress && post.wallet_address?.toLowerCase() === walletAddress.toLowerCase();

  const handlePress = () => {
    router.push(`/post/${post.id}` as any);
  };

  const handleComment = () => {
    router.push(`/post/${post.id}` as any);
  };

  const mediaUrls = post.media_urls?.filter(Boolean) || [];
  const firstLink = post.links && post.links.length > 0 ? post.links[0] : null;
  const youtubeUrl = resolveYouTubeUrl(post.content, post.links?.map((l) => l.url));
  const displayContent = youtubeUrl ? removeYouTubeUrls(post.content) : post.content;
  const isMarketplacePost = !!post.linked_marketplace;
  const pinned = isPostPinned(post.pinned_until);

  const showMoreToggle = !expanded && (displayContent?.length || 0) > FEED_PREVIEW_LIMIT;
  const previewContent = showMoreToggle
    ? displayContent.slice(0, FEED_PREVIEW_LIMIT).trimEnd() + '… '
    : displayContent;

  return (
    <View
      style={[
        styles.container,
        isMarketplacePost && styles.containerMarketplace,
        { backgroundColor: colors.background },
      ]}
    >
      {/* Tappable region — opens the post. The YouTube player is kept OUT of
          this Pressable so tapping it plays inline instead of navigating. */}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.tappable,
          isMarketplacePost && styles.tappableMarketplace,
          pressed && { backgroundColor: colors.pressedOverlay },
        ]}
      >
        {pinned && (
          <View style={styles.pinnedRow}>
            <Ionicons name="pin" size={13} color={colors.textTertiary} />
            <Text style={[styles.pinnedText, { color: colors.textTertiary }]}>Angeheftet</Text>
          </View>
        )}

        <PostAuthorRow
          author={post.author}
          category={isMarketplacePost ? undefined : post.category}
          createdAt={post.created_at}
          onMore={onMore}
        />

        {displayContent ? (
          <LinkifiedText
            content={previewContent}
            style={[styles.content, { color: colors.textPrimary }]}
            linkColor={colors.primary}
          >
            {showMoreToggle && (
              <Text
                style={[styles.moreToggle, { color: colors.primary }]}
                onPress={() => setExpanded(true)}
              >
                Mehr anzeigen
              </Text>
            )}
          </LinkifiedText>
        ) : null}

        {post.linked_event && (
          <PostLinkedEventCard event={post.linked_event} />
        )}

        {post.linked_marketplace && (
          <PostLinkedMarketplaceCard listing={post.linked_marketplace} />
        )}

        {post.stadtkasse_snapshot && (
          <StadtkasseSnapshotCard
            euro={post.stadtkasse_snapshot.euro}
            onPress={() => router.push('/treasury' as any)}
          />
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

        {!youtubeUrl && firstLink ? (
          <PostLinkPreview link={firstLink} />
        ) : null}
      </Pressable>

      {youtubeUrl ? <PostYouTubePreview youtubeUrl={youtubeUrl} /> : null}

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
        viewsCount={post.views_count ?? 0}
        onViewsPress={isOwnPost ? () => setViewersVisible(true) : undefined}
      />

      <PostViewersDrawer
        visible={viewersVisible}
        onClose={() => setViewersVisible(false)}
        postId={post.id}
      />

      <ImageZoomModal
        visible={!!zoomImageUrl}
        imageUrl={zoomImageUrl || ''}
        images={mediaUrls}
        onClose={() => setZoomImageUrl(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden' as const,
    gap: 10,
  },
  containerMarketplace: {
    paddingVertical: 16,
    gap: 14,
  },
  tappable: {
    gap: 10,
  },
  tappableMarketplace: {
    gap: 14,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: -2,
  },
  pinnedText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  content: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
  },
  moreToggle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    lineHeight: 24,
  },
  sticker: {
    width: 200,
    height: 200,
    alignSelf: 'flex-start',
  },
});
