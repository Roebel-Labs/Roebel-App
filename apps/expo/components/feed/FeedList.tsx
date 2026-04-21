import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ViewToken,
} from 'react-native';
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

export type FeedListHandle = {
  refresh: () => void;
};

type Props = {
  feedType: FeedType;
  isCitizen: boolean;
  walletAddress?: string;
  onCompose: () => void;
  onMore: (post: PostRecord) => void;
  listHeader?: React.ReactNode;
};

const FeedList = forwardRef<FeedListHandle, Props>(function FeedList(
  { feedType, isCitizen, walletAddress, onCompose, onMore, listHeader },
  ref,
) {
  const { colors } = useTheme();

  const { items, isLoading, isRefreshing, isLoadingMore, hasMore, refresh, loadMore } =
    useFeed(feedType);

  const { isLiked, getLikeCount, toggleLike, sharePost, initLikes } = usePostActions(walletAddress);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  const visibleDeals = useRef(new Set<string>());

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
      viewableItems.forEach((item) => {
        if (item.item?.type === 'sponsored') {
          const dealId = item.item.data?.id;
          if (dealId && !visibleDeals.current.has(dealId)) {
            visibleDeals.current.add(dealId);
          }
        }
      });
    },
    [],
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  });

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      switch (item.type) {
        case 'alert':
          return <FeedAlertCard alert={item.data} />;

        case 'post': {
          const post = item.data as PostRecord;
          return (
            <FeedPostCard
              post={post}
              isLiked={isLiked(post.id)}
              displayLikeCount={getLikeCount(post.id, post.likes_count)}
              walletAddress={walletAddress}
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

        default:
          return null;
      }
    },
    [walletAddress, isLiked, getLikeCount, toggleLike, sharePost, onMore],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  return (
    <FlatList
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={listHeader ? <>{listHeader}</> : undefined}
      style={{ backgroundColor: colors.feedBackground }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
      }
      onEndReached={hasMore ? loadMore : undefined}
      onEndReachedThreshold={0.3}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig.current}
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
          <View style={styles.bottomPadding} />
        )
      }
      contentContainerStyle={[styles.feedContent, items.length === 0 && styles.emptyContainer]}
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
