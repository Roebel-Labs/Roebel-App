import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { fetchExploreDeals } from '@/lib/supabase-deals';
import { fetchExploreListings } from '@/lib/supabase-marketplace';
import { fetchLiveMiniApps } from '@/lib/miniapps';
import { partitionExploreEvents, selectHeroEvents } from '@/lib/explore-events';
import { useAfterInteractions } from '@/hooks/useAfterInteractions';
import { fontFamily } from '@/constants/theme';
import {
  useExploreLayout,
  visibleBlockIds,
  miniAppSlugOf,
  type ExploreBlockId,
} from '@/lib/explore-layout';
import PinnedMiniAppBlock from '@/components/explore/PinnedMiniAppBlock';
import type {
  EventRecord,
  NewsArticle,
  MovieRecord,
  RestaurantRecord,
} from '@/lib/types';

import BottomNavigation, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import { GlassBackdrop, GlassProvider } from '@/components/GlassSurface';
import ExploreSearchBar from '@/components/ExploreSearchBar';
import ExploreCategoryChips from '@/components/ExploreCategoryChips';
import HeroCarousel from '@/components/HeroCarousel';
import ThisWeekEventsHorizontal from '@/components/ThisWeekEventsHorizontal';
import AllEventsHorizontal from '@/components/AllEventsHorizontal';
import { POSTER_ASPECT_RATIO, POSTER_CARD_WIDTH, POSTER_RADIUS } from '@/components/HorizontalEventCard';
import NewsSection from '@/components/NewsSection';
import RestaurantSection from '@/components/RestaurantSection';
import MovieSection from '@/components/MovieSection';
import MarketplaceSection from '@/components/MarketplaceSection';
import NearbyEventsSection from '@/components/NearbyEventsSection';
import NearbyOrgAccountsSection, {
  ORG_ACCOUNTS_QUERY_KEY,
  fetchOrgAccountsSection,
} from '@/components/NearbyOrgAccountsSection';
import MapFAB from '@/components/MapFAB';
import MiniAppsEntry from '@/components/miniapp/MiniAppsEntry';
import AudioSection, { AUDIO_SHOWS_QUERY_KEY } from '@/components/audio/AudioSection';
import MiniPlayer from '@/components/audio/MiniPlayer';
import { useAudioPlayerControls } from '@/context/AudioPlayerContext';
import { fetchAudioShows } from '@/lib/audio-content';
import SearchModal from '@/components/SearchModal';
import { Skeleton, HeroCarouselSkeleton } from '@/components/SkeletonLoader';

const EVENT_CARD_COLUMNS =
  'id, title, date, time, location, formatted_address, address_components, image_url, is_popular, is_cancelled, organizer_name, ticket_price';

// Stable (module-level) empty-array fallbacks: `data ?? []` would mint a new
// array identity every render, which defeats the useMemo below.
const EMPTY_EVENTS: EventRecord[] = [];
const EMPTY_NEWS: NewsArticle[] = [];
const EMPTY_MOVIES: MovieRecord[] = [];
const EMPTY_RESTAURANTS: RestaurantRecord[] = [];

const todayISO = () => new Date().toISOString().split('T')[0];

// Hero + the first four rails, matching the old fixed first paint.
const ABOVE_FOLD_BLOCKS = 5;

async function fetchExploreEvents() {
  const { data } = await supabase
    .from('events')
    .select(EVENT_CARD_COLUMNS)
    .eq('status', 'approved')
    .gte('date', todayISO()) // LIMIT: only today+future
    .order('date', { ascending: true })
    .order('time', { ascending: true, nullsFirst: true })
    .limit(60); // LIMIT
  return (data ?? []) as EventRecord[];
}

async function fetchExplorePopularEvents() {
  const { data } = await supabase
    .from('events')
    .select(EVENT_CARD_COLUMNS)
    .eq('status', 'approved')
    .eq('is_popular', true)
    // Filter server-side: without this the limit could be spent entirely on
    // past popular events and the hero would come back empty.
    .gte('date', todayISO())
    .order('date', { ascending: true })
    .order('time', { ascending: true, nullsFirst: true })
    .limit(5);
  return (data ?? []) as EventRecord[];
}

async function fetchExploreNews() {
  const { data } = await supabase
    .from('news_articles')
    .select('id, slug, title, cover_image_url, author_name, published_at, created_at, excerpt, status')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20); // LIMIT
  return (data ?? []) as NewsArticle[];
}

async function fetchExploreMovies() {
  const { data } = await supabase
    .from('movies')
    .select('id, title, date, cover_image_url, fsk, status')
    .eq('status', 'published')
    .gte('date', todayISO()) // the rail only shows upcoming screenings
    .order('date', { ascending: true })
    .limit(12); // LIMIT: the rail renders at most 6
  return (data ?? []) as MovieRecord[];
}

async function fetchExploreRestaurants() {
  const { data } = await supabase
    .from('restaurants')
    // NOTE: no opening_hours/address here — restaurants has no opening_hours
    // column, and a nonexistent column 42703-fails the whole select and hides
    // the section. Cover, logo, address and hours come from the linked org
    // account (what the detail page shows); the FK is pinned (PGRST201).
    .select(
      'id, slug, name, cover_image_url, logo_url, background_color, account_id, ' +
        'account:accounts!restaurants_account_id_fkey(cover_url, avatar_url, address, opening_hours)'
    )
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(50); // LIMIT
  return (data ?? []) as RestaurantRecord[];
}

// Section skeleton: title bar + horizontal row of card-shaped placeholders,
// mirroring the horizontal-rail layout every explore section uses.
function SectionRailSkeleton({ titleWidth = '40%' }: { titleWidth?: string | number }) {
  return (
    <View style={styles.skeletonSection}>
      <Skeleton width={titleWidth} height={24} borderRadius={6} style={{ marginBottom: 12, marginHorizontal: 16 }} />
      <View style={styles.skeletonRow}>
        {[16, 12].map((marginLeft) => (
          <View key={marginLeft} style={{ marginLeft, width: POSTER_CARD_WIDTH }}>
            <Skeleton
              width={POSTER_CARD_WIDTH}
              height={Math.round(POSTER_CARD_WIDTH / POSTER_ASPECT_RATIO)}
              borderRadius={POSTER_RADIUS}
            />
            <Skeleton width="70%" height={16} borderRadius={4} style={{ marginTop: 12 }} />
            <Skeleton width="55%" height={13} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  // Controls context only changes on track switches, never per playback tick.
  const { track: audioTrack } = useAudioPlayerControls();
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'profile'>('explore');

  const [refreshing, setRefreshing] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  // FAB show/hide-on-scroll runs entirely on the UI thread (Reanimated) so a
  // direction flip never triggers a JS re-render of this screen. MapFAB owns
  // the actual translateY/opacity tween (via useAnimatedStyle) off this
  // shared value — this only tracks scroll position + the visible/hidden bit.
  const lastScrollY = useSharedValue(0);
  const fabVisible = useSharedValue(true);
  // When the user taps a result/tile inside the search modal we close the modal
  // and navigate, but flag it to reopen once Explore regains focus — so pressing
  // back from the subpage returns to the search page, not the bare feed.
  const reopenSearch = useRef(false);

  // Progressive first paint: everything from the Mini-Apps grid downward
  // mounts once the initial interactions settle, so the search bar, chips,
  // hero and the first two rails reach the screen without waiting on six
  // more FlatLists and their images.
  const belowFoldReady = useAfterInteractions();

  useFocusEffect(
    useCallback(() => {
      if (reopenSearch.current) {
        reopenSearch.current = false;
        setShowSearchModal(true);
      }
    }, [])
  );

  const eventsQuery = useQuery({
    queryKey: ['explore', 'events'],
    queryFn: fetchExploreEvents,
    meta: { persist: true },
  });
  const popularQuery = useQuery({
    queryKey: ['explore', 'popular-events'],
    queryFn: fetchExplorePopularEvents,
    meta: { persist: true },
  });
  const newsQuery = useQuery({
    queryKey: ['explore', 'news'],
    queryFn: fetchExploreNews,
    meta: { persist: true },
  });
  const moviesQuery = useQuery({
    queryKey: ['explore', 'movies'],
    queryFn: fetchExploreMovies,
    meta: { persist: true },
  });
  const restaurantsQuery = useQuery({
    queryKey: ['explore', 'restaurants'],
    queryFn: fetchExploreRestaurants,
    meta: { persist: true },
  });
  const dealsQuery = useQuery({
    queryKey: ['explore', 'deals'],
    queryFn: () => fetchExploreDeals(12), // pool; the rail shows a random 4
    meta: { persist: true },
  });
  const listingsQuery = useQuery({
    queryKey: ['explore', 'listings'],
    queryFn: () => fetchExploreListings(24), // pool; the rail shows a random 6
    meta: { persist: true },
  });
  // The org-accounts and mini-apps rails own their queries, but they mount
  // below the fold (deferred). Subscribing here with the same keys starts
  // those requests in the first network burst; the sections then hydrate
  // from cache the moment they mount. notifyOnChangeProps: [] keeps their
  // state changes from re-rendering this screen.
  useQuery({
    queryKey: ORG_ACCOUNTS_QUERY_KEY,
    queryFn: fetchOrgAccountsSection,
    meta: { persist: true },
    notifyOnChangeProps: [],
  });
  useQuery({
    queryKey: AUDIO_SHOWS_QUERY_KEY,
    queryFn: fetchAudioShows,
    meta: { persist: true },
    notifyOnChangeProps: [],
  });
  useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
    notifyOnChangeProps: [],
  });

  const events = eventsQuery.data ?? EMPTY_EVENTS;
  const popularEvents = popularQuery.data ?? EMPTY_EVENTS;
  const newsArticles = newsQuery.data ?? EMPTY_NEWS;
  const movies = moviesQuery.data ?? EMPTY_MOVIES;
  const restaurants = restaurantsQuery.data ?? EMPTY_RESTAURANTS;
  const deals = dealsQuery.data;
  const listings = listingsQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Every explore query, including the ones owned by the rails
      // (restaurant ratings, org accounts, mini apps).
      await queryClient.refetchQueries({ queryKey: ['explore'], type: 'active' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleTabPress = (tab: 'home' | 'explore' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') {
      router.replace('/');
    } else if (tab === 'profile') {
      router.push('/profile');
    }
  };

  // Same thresholds/direction logic as the old JS-thread handler
  // (scroll down 10px -> hide, scroll up 10px -> show), just running as a
  // worklet on the UI thread instead of via setState on every frame. The
  // translateY/opacity tween itself lives in MapFAB's useAnimatedStyle.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      if (currentY > lastScrollY.value + 10) {
        fabVisible.value = false;
      } else if (currentY < lastScrollY.value - 10) {
        fabVisible.value = true;
      }
      lastScrollY.value = currentY;
    },
  });

  // One pass buckets the event list for all three event rails. `events` /
  // `popularEvents` are referentially stable across renders (EMPTY_EVENTS
  // fallback, unchanged query data), so these only recompute when the
  // underlying query data actually changes.
  const heroEvents = useMemo(() => selectHeroEvents(popularEvents), [popularEvents]);
  const eventBuckets = useMemo(() => partitionExploreEvents(events), [events]);

  // Progressive first paint keeps working with any order: the first
  // ABOVE_FOLD_BLOCKS visible blocks mount immediately, the rest after
  // interactions settle.
  const { layout } = useExploreLayout();
  const visible = useMemo(() => visibleBlockIds(layout), [layout]);
  const aboveFold = visible.slice(0, ABOVE_FOLD_BLOCKS);
  const belowFold = visible.slice(ABOVE_FOLD_BLOCKS);

  const renderBlock = (id: string) => {
    const pinnedSlug = miniAppSlugOf(id);
    if (pinnedSlug) return <PinnedMiniAppBlock key={id} slug={pinnedSlug} />;
    switch (id as ExploreBlockId) {
      case 'hero':
        // Popular events, neighbours teased at both edges
        return popularQuery.isPending ? (
          <HeroCarouselSkeleton key={id} />
        ) : (
          <HeroCarousel key={id} events={heroEvents} showPagination containerStyle={styles.hero} />
        );
      case 'this_week':
        return eventsQuery.isPending ? (
          <SectionRailSkeleton key={id} titleWidth="35%" />
        ) : (
          <ThisWeekEventsHorizontal key={id} events={eventBuckets.thisWeek} />
        );
      case 'all_events':
        return eventsQuery.isPending ? (
          <SectionRailSkeleton key={id} titleWidth="50%" />
        ) : (
          <AllEventsHorizontal key={id} events={eventBuckets.later} />
        );
      case 'nearby_events':
        return eventsQuery.isPending ? (
          <SectionRailSkeleton key={id} titleWidth="30%" />
        ) : (
          <NearbyEventsSection key={id} events={eventBuckets.nearby} />
        );
      case 'movies':
        return moviesQuery.isPending ? (
          <SectionRailSkeleton key={id} titleWidth="25%" />
        ) : (
          <MovieSection key={id} movies={movies} />
        );
      case 'audio':
        // Hören: short stories, audiobooks, podcasts
        return <AudioSection key={id} />;
      case 'mini_apps':
        return <MiniAppsEntry key={id} />;
      case 'marketplace':
        // Listings + promotional deals in one rail
        return listingsQuery.isPending || dealsQuery.isPending ? (
          <SectionRailSkeleton key={id} titleWidth="35%" />
        ) : (
          <MarketplaceSection key={id} listings={listings ?? []} deals={deals} />
        );
      case 'news':
        return newsQuery.isPending ? (
          <SectionRailSkeleton key={id} titleWidth="40%" />
        ) : (
          <NewsSection key={id} articles={newsArticles} />
        );
      case 'restaurants':
        return restaurantsQuery.isPending ? (
          <SectionRailSkeleton key={id} titleWidth="40%" />
        ) : (
          <RestaurantSection key={id} restaurants={restaurants} />
        );
      case 'businesses':
        // Nearby Org Accounts (Unternehmen)
        return <NearbyOrgAccountsSection key={id} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <GlassProvider>
      {/* GlassBackdrop: the surface the frosted bottom nav samples on
          Android. Passthrough View on web; the nav overlay stays OUTSIDE. */}
      <GlassBackdrop style={styles.glassBody}>
      <Animated.ScrollView
        // flex:1 is load-bearing on web: react-native-web sizes an unstyled
        // ScrollView to its content, so `overflow-y: auto` never has anything
        // to scroll and the page (body has overflow:hidden) just clips it.
        // Native bounds it regardless, which is why this only broke the PWA.
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Search bar */}
        <ExploreSearchBar onPress={() => setShowSearchModal(true)} />

        {/* Category tiles */}
        <ExploreCategoryChips />

        {/* Personalised blocks (lib/explore-layout.ts): order + visibility
            come from the user's layout, falling back to the default. */}
        {aboveFold.map(renderBlock)}

        {belowFoldReady ? (
          belowFold.map(renderBlock)
        ) : belowFold.length > 0 ? (
          <>
            <SectionRailSkeleton titleWidth="35%" />
            <SectionRailSkeleton titleWidth="40%" />
            <SectionRailSkeleton titleWidth="40%" />
          </>
        ) : null}

        {/* Gateway into the layout editor (second one: Profil → Darstellung) */}
        <Pressable
          onPress={() => router.push('/settings/darstellung' as any)}
          style={({ pressed }) => [
            styles.customize,
            { borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Erkunden anpassen"
        >
          <Text style={[styles.customizeText, { color: colors.textSecondary }]}>Erkunden anpassen</Text>
        </Pressable>

        {/* Clearance for the now-overlaying glass BottomNavigation (+ mini player) */}
        <View style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom + 10 + (audioTrack ? 68 : 0) }} />
      </Animated.ScrollView>
      </GlassBackdrop>

      {/* Search Modal */}
      <SearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onNavigate={() => {
          reopenSearch.current = true;
          setShowSearchModal(false);
        }}
      />

      {/* Map FAB */}
      <MapFAB visible={fabVisible} bottomOffset={audioTrack ? 64 : 0} />

      {/* Now-playing bar, floating just above the glass nav */}
      <MiniPlayer style={[styles.miniPlayer, { bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 8 }]} />

      {/* Bottom Navigation — frosted glass overlaying the scroll content */}
      <View style={styles.navOverlay}>
        <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} glass />
    </View>
      </GlassProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  glassBody: {
    flex: 1,
  },
  hero: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  navOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  miniPlayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  skeletonSection: {
    marginBottom: 32,
  },
  customize: {
    alignSelf: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  customizeText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
});
