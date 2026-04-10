import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ViewToken,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useNotificationsContext } from '@/context/NotificationsContext';
import { useFeed } from '@/hooks/useFeed';
import { usePostActions } from '@/hooks/usePostActions';
import { getUserLikedPostIds, deletePost } from '@/lib/supabase-posts';
import type { FeedItem, FeedType, PostRecord } from '@/lib/types/feed';
import type { EventRecord, MarketplaceListingRecord, NewsArticle, MovieRecord, RestaurantRecord, SpecialMenuRecord } from '@/lib/types';
import type { BusinessDealWithBusiness } from '@/lib/types/feed';
import BottomNavigation from '@/components/BottomNavigation';
import FeedTabBar from './FeedTabBar';
import ContextBar from './ContextBar';
import GovernanceNudge from './GovernanceNudge';
import MeckyTip from './MeckyTip';
import type { GovernanceNudgeData, MeckyTipData } from '@/lib/types/feed';
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
import PostComposer from './PostComposer';
import PostOptionsDrawer from './PostOptionsDrawer';
import ReportDrawer from './ReportDrawer';
import ConfirmationDrawer from '@/components/ConfirmationDrawer';
import FeedFAB from './FeedFAB';
import MailIcon from '@/assets/icons/mail.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';
import PostBar from './PostBar';
import EventStoryBar from './EventStoryBar';

export default function FeedHome() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, isCitizen } = useUser();
  const walletAddress = user?.wallet_address;
  const { showSnackbar } = useSnackbar();
  const { unreadCount } = useNotificationsContext();

  const [activeTab, setActiveTab] = useState<FeedType>('main');
  const [navTab, setNavTab] = useState<'home' | 'explore' | 'map' | 'profile'>('home');
  const [reportDrawerVisible, setReportDrawerVisible] = useState(false);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [optionsDrawerVisible, setOptionsDrawerVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostRecord | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [editComposerVisible, setEditComposerVisible] = useState(false);

  // Track visible sponsored cards for impression tracking
  const visibleDeals = useRef(new Set<string>());

  // Non-citizens can only see the 'main' feed
  const effectiveTab: FeedType = isCitizen ? activeTab : 'main';

  const { items, isLoading, isRefreshing, isLoadingMore, hasMore, refresh, loadMore } =
    useFeed(effectiveTab);

  const { isLiked, getLikeCount, toggleLike, sharePost, reportPost, initLikes } = usePostActions(walletAddress);

  // Initialize like states when items change
  React.useEffect(() => {
    if (!walletAddress || items.length === 0) return;

    const postIds = items
      .filter((item): item is FeedItem & { type: 'post' | 'mecky' } =>
        item.type === 'post' || item.type === 'mecky'
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

  // Track viewable items for ad impressions
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
    []
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  });

  const handleTabPress = (tab: 'home' | 'explore' | 'map' | 'profile') => {
    setNavTab(tab);
    if (tab === 'explore') {
      router.push('/explore');
    } else if (tab === 'map') {
      router.push('/location');
    } else if (tab === 'profile') {
      router.push('/profile');
    }
  };

  const handleCompose = () => {
    if (!walletAddress) return;
    router.push({ pathname: '/create', params: { feedType: effectiveTab } } as any);
  };

  const handleMore = (post: PostRecord) => {
    setSelectedPost(post);
    setOptionsDrawerVisible(true);
  };

  const handleEditPost = () => {
    setEditComposerVisible(true);
  };

  const handleDeletePost = () => {
    setDeleteConfirmVisible(true);
  };

  const confirmDeletePost = async () => {
    if (!selectedPost) return;
    try {
      await deletePost(selectedPost.id);
      showSnackbar({ message: 'Beitrag gelöscht' });
      setDeleteConfirmVisible(false);
      setSelectedPost(null);
      refresh();
    } catch {
      showSnackbar({ message: 'Fehler beim Löschen des Beitrags' });
    }
  };

  const handlePostUpdated = () => {
    setEditComposerVisible(false);
    setSelectedPost(null);
    refresh();
  };

  const handleOpenReport = () => {
    if (!selectedPost) return;
    setReportingPostId(selectedPost.id);
    setReportDrawerVisible(true);
  };

  const handleSubmitReport = async (reason: string) => {
    if (!reportingPostId) return;
    try {
      await reportPost(reportingPostId, reason);
      showSnackbar({ message: 'Beitrag wurde gemeldet' });
    } catch {
      showSnackbar({ message: 'Fehler beim Melden des Beitrags' });
      throw new Error('Report failed');
    }
  };

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
              onMore={() => handleMore(post)}
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
              onMore={() => handleMore(post)}
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
          return <GovernanceNudge proposalId={nudge.proposalId} title={nudge.title} forPercentage={nudge.forPercentage} againstPercentage={nudge.againstPercentage} daysRemaining={nudge.daysRemaining} />;
        }

        case 'mecky_tip': {
          const tip = item.data as MeckyTipData;
          return <MeckyTip text={tip.text} actionLabel={tip.actionLabel} actionRoute={tip.actionRoute} />;
        }

        default:
          return null;
      }
    },
    [walletAddress, isLiked, getLikeCount, toggleLike, sharePost]
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const listHeader = (
    <View style={[styles.headerWrapper, { backgroundColor: colors.background, marginHorizontal: -8, marginBottom: 8 }]}>
      {/* App header row */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Röbel</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.headerIconBtn, { backgroundColor: colors.surfaceSecondary }]}
            accessibilityLabel="Nachrichten"
            onPress={() => router.push('/messages' as any)}
          >
            <MailIcon width={20} height={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            style={[styles.headerIconBtn, { backgroundColor: colors.surfaceSecondary }]}
            accessibilityLabel="Benachrichtigungen"
            onPress={() => router.push('/notifications' as any)}
          >
            <NotificationIcon width={20} height={20} color={colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Post bar — tap to compose */}
      <PostBar
        avatarUrl={user?.profile_picture_url ?? null}
        onPress={handleCompose}
      />

      {/* Tab bar — only for verified citizens */}
      {isCitizen && <FeedTabBar activeTab={activeTab} onTabChange={setActiveTab} />}

      {/* Context bar — temporarily hidden, keep component for later */}
      {/* <ContextBar /> */}

      {/* Event story bar — Für alle tab only */}
      {effectiveTab === 'main' && <EventStoryBar />}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Feed list */}
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        style={{ backgroundColor: colors.feedBackground }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
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
            <FeedEmptyState
              feedType={effectiveTab}
              isCitizen={isCitizen}
              onCompose={handleCompose}
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
          ) : (
            <View style={styles.bottomPadding} />
          )
        }
        contentContainerStyle={[
          styles.feedContent,
          items.length === 0 && styles.emptyContainer,
        ]}
      />

      {/* FAB */}
      {walletAddress && <FeedFAB onPress={handleCompose} />}

      {/* Post options drawer */}
      <PostOptionsDrawer
        visible={optionsDrawerVisible}
        onClose={() => setOptionsDrawerVisible(false)}
        isOwner={!!walletAddress && selectedPost?.wallet_address === walletAddress}
        onEdit={handleEditPost}
        onDelete={handleDeletePost}
        onReport={handleOpenReport}
      />

      {/* Report drawer */}
      <ReportDrawer
        visible={reportDrawerVisible}
        onClose={() => setReportDrawerVisible(false)}
        onReport={handleSubmitReport}
      />

      {/* Delete confirmation */}
      <ConfirmationDrawer
        visible={deleteConfirmVisible}
        title="Beitrag löschen?"
        message="Dieser Beitrag wird dauerhaft entfernt."
        variant="destructive"
        confirmText="Löschen"
        cancelText="Abbrechen"
        onConfirm={confirmDeletePost}
        onCancel={() => setDeleteConfirmVisible(false)}
      />

      {/* Edit composer */}
      {selectedPost && (
        <PostComposer
          visible={editComposerVisible}
          onClose={() => setEditComposerVisible(false)}
          onPostCreated={() => {}}
          feedType={effectiveTab}
          walletAddress={walletAddress || ''}
          isCitizen={isCitizen}
          user={user}
          editingPost={selectedPost}
          onPostUpdated={handlePostUpdated}
        />
      )}

      {/* Bottom navigation */}
      <BottomNavigation activeTab={navTab} onTabPress={handleTabPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedContent: {
    paddingHorizontal: 8,
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
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    lineHeight: 14,
  },
});
