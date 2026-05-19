import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ViewToken,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useFeed } from '@/hooks/useFeed';
import { usePostActions } from '@/hooks/usePostActions';
import { getUserLikedPostIds } from '@/lib/supabase-posts';
import type {
  FeedItem,
  FeedType,
  PostRecord,
  BusinessDealWithBusiness,
  GovernanceNudgeData,
  MeckyTipData,
} from '@/lib/types/feed';
import type {
  EventRecord,
  MarketplaceListingRecord,
  NewsArticle,
  MovieRecord,
  RestaurantRecord,
  SpecialMenuRecord,
} from '@/lib/types';
import FeedPostCard from './FeedPostCard';
import FeedAlertCard from './FeedAlertCard';
import FeedMeckyCard from './FeedMeckyCard';
import FeedExperienceCard from './FeedExperienceCard';
import FeedSponsoredCard from './FeedSponsoredCard';
import FeedMarketplaceCard from './FeedMarketplaceCard';
import FeedEventCard from './FeedEventCard';
import FeedNewsSection from './FeedNewsSection';
import FeedCinemaSection from './FeedCinemaSection';
import FeedRestaurantSection from './FeedRestaurantSection';
import FeedSpecialMenuSection from './FeedSpecialMenuSection';
import FeedPostSkeleton from './FeedPostSkeleton';
import FeedEmptyState from './FeedEmptyState';
import GovernanceNudge from './GovernanceNudge';
import MeckyTip from './MeckyTip';
import FeedProposalCard from './FeedProposalCard';
import FeedProposalCommentCard from './FeedProposalCommentCard';

export type FeedListHandle = {
  refresh: () => void;
  removePost: (postId: string) => void;
};

type Props = {
  feedType: FeedType;
  isCitizen: boolean;
  walletAddress?: string;
  onCompose: () => void;
  onMore: (post: PostRecord) => void;
  listHeader?: React.ReactNode;
  /** Shared value tracking the floating header translateY. Updated on scroll. */
  headerTranslateY?: SharedValue<number>;
  /** Total height of the floating header — used as the upper clamp for the translate. */
  headerHeight?: number;
  /** Additional top inset (e.g. status bar) added to the header padding. */
  topPadding?: number;
  /** Additional bottom inset (e.g. bottom nav) added to the footer padding. */
  bottomPadding?: number;
};

const FeedList = forwardRef<FeedListHandle, Props>(function FeedList(
  {
    feedType,
    isCitizen,
    walletAddress,
    onCompose,
    onMore,
    listHeader,
    headerTranslateY,
    headerHeight = 0,
    topPadding = 0,
    bottomPadding = 0,
  },
  ref,
) {
  const { colors } = useTheme();

  const { items, isLoading, isRefreshing, isLoadingMore, hasMore, refresh, loadMore, removePost } =
    useFeed(feedType);

  const { isLiked, getLikeCount, toggleLike, sharePost, initLikes } = usePostActions(walletAddress);

  useImperativeHandle(ref, () => ({ refresh, removePost }), [refresh, removePost]);

  const visibleDeals = useRef(new Set<string>());
  const [visibleVideoIds, setVisibleVideoIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!walletAddress || items.length === 0) return;

    const postIds = items
      .filter((item): item is FeedItem & { type: 'post' | 'mecky' } =>
        item.type === 'post' || item.type === 'mecky',
      )
      .map((item) => (item.data as PostRecord).id);

    if (postIds.length === 0) return;

    const counts: Record<string, number> = {};
    items.forEach((item) => {
      if (item.type === 'post' || item.type === 'mecky') {
        const post = item.data as PostRecord;
        counts[post.id] = post.likes_count;
      }
    });

    getUserLikedPostIds(postIds, walletAddress).then((likedIds) => {
      initLikes(likedIds, counts);
    });
  }, [items, walletAddress]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const nextVideoIds = new Set<string>();
      viewableItems.forEach((item) => {
        if (item.item?.type === 'sponsored') {
          const dealId = item.item.data?.id;
          if (dealId && !visibleDeals.current.has(dealId)) {
            visibleDeals.current.add(dealId);
          }
        }
        if (item.item?.type === 'post' || item.item?.type === 'mecky') {
          const post = item.item.data as PostRecord;
          if (post?.video_url) {
            nextVideoIds.add(post.id);
          }
        }
      });
      setVisibleVideoIds((prev) => {
        if (prev.size === nextVideoIds.size) {
          let same = true;
          prev.forEach((id) => {
            if (!nextVideoIds.has(id)) same = false;
          });
          if (same) return prev;
        }
        return nextVideoIds;
      });
    },
    [],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
    minimumViewTime: 200,
  });

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      switch (item.type) {
        case 'alert':
          return <FeedAlertCard alert={item.data} />;

        case 'post': {
          const post = item.data as PostRecord;
          if (post.post_type === 'event_experience') {
            return (
              <FeedExperienceCard
                post={post}
                isLiked={isLiked(post.id)}
                displayLikeCount={getLikeCount(post.id, post.likes_count)}
                onLike={() => toggleLike(post.id, post.likes_count)}
                onShare={() => sharePost(post.id, post.content)}
                onMore={() => onMore(post)}
              />
            );
          }
          return (
            <FeedPostCard
              post={post}
              isLiked={isLiked(post.id)}
              displayLikeCount={getLikeCount(post.id, post.likes_count)}
              walletAddress={walletAddress}
              isVisible={visibleVideoIds.has(post.id)}
              onLike={() => toggleLike(post.id, post.likes_count)}
              onShare={() => sharePost(post.id, post.content)}
              onMore={() => onMore(post)}
            />
          );
        }

        case 'mecky': {
          const post = item.data as PostRecord;
          return (
            <FeedMeckyCard
              post={post}
              isLiked={isLiked(post.id)}
              displayLikeCount={getLikeCount(post.id, post.likes_count)}
              walletAddress={walletAddress}
              isVisible={visibleVideoIds.has(post.id)}
              onLike={() => toggleLike(post.id, post.likes_count)}
              onShare={() => sharePost(post.id, post.content)}
              onMore={() => onMore(post)}
            />
          );
        }

        case 'sponsored':
          return (
            <FeedSponsoredCard
              deal={item.data as BusinessDealWithBusiness}
              isVisible={visibleDeals.current.has((item.data as BusinessDealWithBusiness).id)}
            />
          );

        case 'marketplace':
          return <FeedMarketplaceCard listing={item.data as MarketplaceListingRecord} />;

        case 'event':
          return <FeedEventCard event={item.data as EventRecord} />;

        case 'news_section':
          return <FeedNewsSection articles={item.data as NewsArticle[]} />;

        case 'cinema_section':
          return <FeedCinemaSection movies={item.data as MovieRecord[]} />;

        case 'restaurant_section':
          return <FeedRestaurantSection restaurants={item.data as RestaurantRecord[]} />;

        case 'special_menu_section':
          return <FeedSpecialMenuSection menus={item.data as SpecialMenuRecord[]} />;

        case 'governance_nudge': {
          const nudge = item.data as GovernanceNudgeData;
          return (
            <GovernanceNudge
              proposalId={nudge.proposalId}
              title={nudge.title}
              forPercentage={nudge.forPercentage}
              againstPercentage={nudge.againstPercentage}
              daysRemaining={nudge.daysRemaining}
            />
          );
        }

        case 'mecky_tip': {
          const tip = item.data as MeckyTipData;
          return <MeckyTip text={tip.text} actionLabel={tip.actionLabel} actionRoute={tip.actionRoute} />;
        }

        case 'proposal':
          return <FeedProposalCard proposal={item.data} />;

        case 'proposal_comment':
          return <FeedProposalCommentCard comment={item.data} />;

        default:
          return null;
      }
    },
    [walletAddress, isLiked, getLikeCount, toggleLike, sharePost, onMore, visibleVideoIds],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  // Direction-aware chrome visibility: hide on scroll down, reveal on scroll up.
  // Always force visible at the top / on overscroll. Only triggers a new timing
  // animation when the target state actually flips, so scroll frames don't spawn
  // overlapping animations.
  const prevScrollY = useSharedValue(0);
  const collapsed = useSharedValue(false);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (!headerTranslateY || headerHeight <= 0) return;
      const y = e.contentOffset.y;
      const dy = y - prevScrollY.value;
      prevScrollY.value = y;

      if (y <= 0) {
        if (collapsed.value) {
          collapsed.value = false;
          headerTranslateY.value = withTiming(0, { duration: 180 });
        }
        return;
      }

      if (Math.abs(dy) < 2) return;

      if (dy > 0 && !collapsed.value) {
        collapsed.value = true;
        headerTranslateY.value = withTiming(-headerHeight, { duration: 180 });
      } else if (dy < 0 && collapsed.value) {
        collapsed.value = false;
        headerTranslateY.value = withTiming(0, { duration: 180 });
      }
    },
  });

  return (
    <Animated.FlatList
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={listHeader ? <>{listHeader}</> : undefined}
      style={{ backgroundColor: colors.feedBackground }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={colors.primary}
          progressViewOffset={topPadding}
        />
      }
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      onEndReached={hasMore ? loadMore : undefined}
      onEndReachedThreshold={0.3}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig.current}
      scrollIndicatorInsets={{ top: topPadding, bottom: bottomPadding }}
      ListEmptyComponent={
        isLoading ? (
          <View style={styles.skeletonList}>
            {[1, 2, 3, 4].map((i) => (
              <FeedPostSkeleton key={i} />
            ))}
          </View>
        ) : (
          <FeedEmptyState feedType={feedType} isCitizen={isCitizen} onCompose={onCompose} />
        )
      }
      ListFooterComponent={
        isLoadingMore ? (
          <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
        ) : (
          <View style={{ height: bottomPadding + 40 }} />
        )
      }
      contentContainerStyle={[
        styles.feedContent,
        { paddingTop: topPadding + 8 },
        items.length === 0 && [styles.emptyContainer, { paddingTop: topPadding }],
      ]}
    />
  );
});

export default FeedList;

const styles = StyleSheet.create({
  feedContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 8,
  },
  skeletonList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
  },
  footerLoader: {
    padding: 20,
  },
  bottomPadding: {
    height: 100,
  },
});
