import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  UIManager,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useNotificationsContext } from '@/context/NotificationsContext';
import { useMessaging } from '@/context/MessagingContext';
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
import MailIcon from '@/assets/icons/mail-01.svg';
import CalendarIcon from '@/assets/icons/calendar-02.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';
import PostBar from './PostBar';
import EventStoryBar from './EventStoryBar';
import { usePostActions } from '@/hooks/usePostActions';

const TAB_ORDER: FeedType[] = ['main', 'rathaus', 'app'];

// Detect whether the native PagerView module is baked into the current
// binary. An EAS Update can ship JS that imports a new native module into
// a binary that was built before the module existed — rendering that
// module would crash the app. We fall back to a pure-JS horizontal
// ScrollView when the native view manager isn't registered.
const PagerViewModule = (() => {
  try {
    const mod = require('react-native-pager-view');
    const native =
      !!UIManager.getViewManagerConfig?.('RNCViewPager') ||
      !!UIManager.getViewManagerConfig?.('RCTRNCViewPager');
    return native ? mod.default : null;
  } catch {
    return null;
  }
})() as React.ComponentType<any> | null;

type PagerProps = {
  initialPage: number;
  scrollProgress: SharedValue<number>;
  onPageSelected: (index: number) => void;
  pageWidth: number;
  children: React.ReactNode;
};

type PagerHandle = {
  setPage: (index: number) => void;
};

const NativePager = PagerViewModule
  ? React.forwardRef<PagerHandle, PagerProps>(function NativePager(
      { initialPage, scrollProgress, onPageSelected, children, pageWidth: _pageWidth },
      ref,
    ) {
      const pagerRef = useRef<any>(null);
      React.useImperativeHandle(ref, () => ({
        setPage: (i: number) => pagerRef.current?.setPage?.(i),
      }));

      const handleScroll = useCallback(
        (e: { nativeEvent: { position: number; offset: number } }) => {
          scrollProgress.value = e.nativeEvent.position + e.nativeEvent.offset;
        },
        [scrollProgress],
      );

      const handleSelected = useCallback(
        (e: { nativeEvent: { position: number } }) => {
          onPageSelected(e.nativeEvent.position);
        },
        [onPageSelected],
      );

      const Pager = PagerViewModule!;
      return (
        <Pager
          ref={pagerRef}
          style={styles.pager}
          initialPage={initialPage}
          onPageScroll={handleScroll}
          onPageSelected={handleSelected}
          offscreenPageLimit={1}
          overdrag
        >
          {children}
        </Pager>
      );
    })
  : null;

const ScrollPager = React.forwardRef<PagerHandle, PagerProps>(function ScrollPager(
  { initialPage, scrollProgress, onPageSelected, pageWidth, children },
  ref,
) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useSharedValue(initialPage * pageWidth);

  React.useEffect(() => {
    scrollProgress.value = pageWidth > 0 ? scrollX.value / pageWidth : 0;
  }, [pageWidth, scrollProgress, scrollX]);

  React.useImperativeHandle(ref, () => ({
    setPage: (i: number) => {
      scrollRef.current?.scrollTo({ x: i * pageWidth, animated: true });
    },
  }));

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      scrollProgress.value = pageWidth > 0 ? e.contentOffset.x / pageWidth : 0;
    },
  });

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      onPageSelected(idx);
    },
    [onPageSelected, pageWidth],
  );

  return (
    <Animated.ScrollView
      ref={scrollRef as any}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      onMomentumScrollEnd={handleMomentumEnd}
      decelerationRate="fast"
      disableIntervalMomentum
      bounces={false}
      overScrollMode="never"
      contentOffset={{ x: initialPage * pageWidth, y: 0 }}
      style={styles.pager}
    >
      {children}
    </Animated.ScrollView>
  );
});

const Pager = (NativePager ?? ScrollPager) as React.ForwardRefExoticComponent<
  PagerProps & React.RefAttributes<PagerHandle>
>;

export default function FeedHome() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, isCitizen } = useUser();
  const walletAddress = user?.wallet_address;
  const { showSnackbar } = useSnackbar();
  const { totalUnreadCount } = useNotificationsContext();
  const { unreadCount: unreadMessages } = useMessaging();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [headerHeight, setHeaderHeight] = useState(0);
  const headerTranslateY = useSharedValue(0);

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setHeaderHeight((prev) => (prev === next ? prev : next));
  }, []);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  // Bottom nav slides off only when the header is fully collapsed.
  const bottomNavTranslateY = useDerivedValue(() => {
    if (headerHeight === 0) return 0;
    const collapsed = headerTranslateY.value <= -headerHeight + 1;
    return withTiming(collapsed ? BOTTOM_NAV_HEIGHT + insets.bottom + 16 : 0, {
      duration: 180,
    });
  });
  const bottomNavAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bottomNavTranslateY.value }],
  }));

  const [activeTab, setActiveTab] = useState<FeedType>('main');
  const [navTab, setNavTab] = useState<'home' | 'explore' | 'map' | 'profile'>('home');
  const [reportDrawerVisible, setReportDrawerVisible] = useState(false);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [optionsDrawerVisible, setOptionsDrawerVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostRecord | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [editComposerVisible, setEditComposerVisible] = useState(false);

  const pagerRef = useRef<PagerHandle>(null);
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

  const handlePageSelected = useCallback((idx: number) => {
    const next = TAB_ORDER[idx];
    if (next) setActiveTab(next);
  }, []);

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
    <Animated.View
      onLayout={onHeaderLayout}
      style={[
        styles.headerWrapper,
        styles.headerFloating,
        { backgroundColor: colors.background },
        headerAnimatedStyle,
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Röbel</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerIconBtn}
            accessibilityLabel="Kalender"
            onPress={() => router.push('/calendar' as any)}
          >
            <CalendarIcon width={22} height={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.headerIconBtn}
            accessibilityLabel="Nachrichten"
            onPress={() => router.push('/messages' as any)}
          >
            <MailIcon width={22} height={22} color={colors.textPrimary} />
            {unreadMessages > 0 && <View style={styles.dot} />}
          </Pressable>
          <Pressable
            style={styles.headerIconBtn}
            accessibilityLabel="Benachrichtigungen"
            onPress={() => router.push('/notifications' as any)}
          >
            <NotificationIcon width={22} height={22} color={colors.textPrimary} />
            {totalUnreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <PostBar avatarUrl={user?.profile_picture_url ?? null} onPress={handleCompose} />

      {isCitizen && (
        <FeedTabBar activeTab={activeTab} onTabChange={handleTabChange} scrollProgress={scrollProgress} />
      )}
    </Animated.View>
  );

  const bottomPadding = BOTTOM_NAV_HEIGHT + insets.bottom;
  const feedListProps = {
    headerTranslateY,
    headerHeight,
    topPadding: headerHeight,
    bottomPadding,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {isCitizen ? (
        <Pager
          ref={pagerRef}
          initialPage={0}
          scrollProgress={scrollProgress}
          onPageSelected={handlePageSelected}
          pageWidth={screenWidth}
        >
          <View key="main" style={[styles.page, { width: screenWidth }]} collapsable={false}>
            <FeedList
              ref={mainListRef}
              feedType="main"
              isCitizen={isCitizen}
              walletAddress={walletAddress}
              onCompose={handleCompose}
              onMore={handleMore}
              listHeader={<EventStoryBar />}
              {...feedListProps}
            />
          </View>
          <View key="rathaus" style={[styles.page, { width: screenWidth }]} collapsable={false}>
            <FeedList
              ref={rathausListRef}
              feedType="rathaus"
              isCitizen={isCitizen}
              walletAddress={walletAddress}
              onCompose={handleCompose}
              onMore={handleMore}
              {...feedListProps}
            />
          </View>
          <View key="app" style={[styles.page, { width: screenWidth }]} collapsable={false}>
            <FeedList
              ref={appListRef}
              feedType="app"
              isCitizen={isCitizen}
              walletAddress={walletAddress}
              onCompose={handleCompose}
              onMore={handleMore}
              {...feedListProps}
            />
          </View>
        </Pager>
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
            {...feedListProps}
          />
        </View>
      )}

      {appHeader}

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

      <Animated.View
        style={[
          styles.bottomFloating,
          { backgroundColor: colors.background },
          bottomNavAnimatedStyle,
        ]}
      >
        <BottomNavigation activeTab={navTab} onTabPress={handleNavTabPress} />
      </Animated.View>
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
  headerFloating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomFloating: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    lineHeight: 12,
  },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#DC2626',
  },
});
