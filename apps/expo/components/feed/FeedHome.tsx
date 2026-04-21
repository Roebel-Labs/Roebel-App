import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import PagerView, {
  type PagerViewOnPageScrollEventData,
  type PagerViewOnPageSelectedEventData,
} from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useNotificationsContext } from '@/context/NotificationsContext';
import { deletePost } from '@/lib/supabase-posts';
import type { FeedType, PostRecord } from '@/lib/types/feed';
import BottomNavigation from '@/components/BottomNavigation';
import FeedTabBar from './FeedTabBar';
import FeedList, { type FeedListHandle } from './FeedList';
import PostComposer from './PostComposer';
import PostOptionsDrawer from './PostOptionsDrawer';
import ReportDrawer from './ReportDrawer';
import ConfirmationDrawer from '@/components/ConfirmationDrawer';
import FeedFAB from './FeedFAB';
import MailIcon from '@/assets/icons/mail.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';
import PostBar from './PostBar';
import EventStoryBar from './EventStoryBar';
import { usePostActions } from '@/hooks/usePostActions';

const TAB_ORDER: FeedType[] = ['main', 'rathaus', 'app'];

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

  const pagerRef = useRef<PagerView>(null);
  const scrollProgress = useSharedValue(0);

  const mainListRef = useRef<FeedListHandle>(null);
  const rathausListRef = useRef<FeedListHandle>(null);
  const appListRef = useRef<FeedListHandle>(null);
  const nonCitizenListRef = useRef<FeedListHandle>(null);

  const { reportPost } = usePostActions(walletAddress);

  const refreshAll = useCallback(() => {
    mainListRef.current?.refresh();
    rathausListRef.current?.refresh();
    appListRef.current?.refresh();
    nonCitizenListRef.current?.refresh();
  }, []);

  const effectiveTab: FeedType = isCitizen ? activeTab : 'main';

  const handleTabChange = (tab: FeedType) => {
    const idx = TAB_ORDER.indexOf(tab);
    if (idx === -1) return;
    pagerRef.current?.setPage(idx);
    setActiveTab(tab);
  };

  const handlePageScroll = useCallback(
    (e: { nativeEvent: PagerViewOnPageScrollEventData }) => {
      scrollProgress.value = e.nativeEvent.position + e.nativeEvent.offset;
    },
    [scrollProgress],
  );

  const handlePageSelected = useCallback(
    (e: { nativeEvent: PagerViewOnPageSelectedEventData }) => {
      const idx = e.nativeEvent.position;
      const next = TAB_ORDER[idx];
      if (next) setActiveTab(next);
    },
    [],
  );

  const handleNavTabPress = (tab: 'home' | 'explore' | 'map' | 'profile') => {
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
      refreshAll();
    } catch {
      showSnackbar({ message: 'Fehler beim Löschen des Beitrags' });
    }
  };

  const handlePostUpdated = () => {
    setEditComposerVisible(false);
    setSelectedPost(null);
    refreshAll();
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

  const appHeader = (
    <View style={[styles.headerWrapper, { backgroundColor: colors.background }]}>
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
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <PostBar avatarUrl={user?.profile_picture_url ?? null} onPress={handleCompose} />

      {isCitizen && (
        <FeedTabBar activeTab={activeTab} onTabChange={handleTabChange} scrollProgress={scrollProgress} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {appHeader}

      {isCitizen ? (
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageScroll={handlePageScroll}
          onPageSelected={handlePageSelected}
          offscreenPageLimit={1}
          overdrag
        >
          <View key="main" style={styles.page} collapsable={false}>
            <FeedList
              ref={mainListRef}
              feedType="main"
              isCitizen={isCitizen}
              walletAddress={walletAddress}
              onCompose={handleCompose}
              onMore={handleMore}
              listHeader={<EventStoryBar />}
            />
          </View>
          <View key="rathaus" style={styles.page} collapsable={false}>
            <FeedList
              ref={rathausListRef}
              feedType="rathaus"
              isCitizen={isCitizen}
              walletAddress={walletAddress}
              onCompose={handleCompose}
              onMore={handleMore}
            />
          </View>
          <View key="app" style={styles.page} collapsable={false}>
            <FeedList
              ref={appListRef}
              feedType="app"
              isCitizen={isCitizen}
              walletAddress={walletAddress}
              onCompose={handleCompose}
              onMore={handleMore}
            />
          </View>
        </PagerView>
      ) : (
        <View style={styles.pager}>
          <FeedList
            ref={nonCitizenListRef}
            feedType="main"
            isCitizen={isCitizen}
            walletAddress={walletAddress}
            onCompose={handleCompose}
            onMore={handleMore}
            listHeader={<EventStoryBar />}
          />
        </View>
      )}

      {walletAddress && <FeedFAB onPress={handleCompose} />}

      <PostOptionsDrawer
        visible={optionsDrawerVisible}
        onClose={() => setOptionsDrawerVisible(false)}
        isOwner={!!walletAddress && selectedPost?.wallet_address === walletAddress}
        onEdit={handleEditPost}
        onDelete={handleDeletePost}
        onReport={handleOpenReport}
      />

      <ReportDrawer
        visible={reportDrawerVisible}
        onClose={() => setReportDrawerVisible(false)}
        onReport={handleSubmitReport}
      />

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

      <BottomNavigation activeTab={navTab} onTabPress={handleNavTabPress} />
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
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
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
