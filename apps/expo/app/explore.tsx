import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { fetchBusinesses } from '@/lib/supabase-businesses';
import { fetchActiveDeals } from '@/lib/supabase-deals';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { isEventTodayOrFuture, isEventInRoebel } from '@/lib/utils';
import type {
  EventRecord,
  NewsArticle,
  MovieRecord,
  RestaurantRecord,
  BusinessRecord,
  BusinessDealWithBusiness,
  MarketplaceListingRecord,
} from '@/lib/types';

import { useAppMode } from '@/context/AppModeContext';
import MiniGamesSection from '@/components/games/MiniGamesSection';
import FortuneCardsBanner from '@/components/games/FortuneCardsBanner';
import HoroscopeBanner from '@/components/games/HoroscopeBanner';
import BottomNavigation, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import { SearchIcon } from '@/components/Icons';
import ExploreCategoryChips from '@/components/ExploreCategoryChips';
import SwipeableCardStack from '@/components/SwipeableCardStack';
import ThisWeekEventsHorizontal from '@/components/ThisWeekEventsHorizontal';
import AllEventsHorizontal from '@/components/AllEventsHorizontal';
import DealsGridSection from '@/components/DealsGridSection';
import NewsSection from '@/components/NewsSection';
import BusinessSection from '@/components/BusinessSection';
import RestaurantSection from '@/components/RestaurantSection';
import MovieSection from '@/components/MovieSection';
import MarketplaceSection from '@/components/MarketplaceSection';
import NearbyEventsSection from '@/components/NearbyEventsSection';
import MapFAB from '@/components/MapFAB';
import SearchModal from '@/components/SearchModal';
import { Skeleton, HeroCardSkeleton } from '@/components/SkeletonLoader';

export default function ExploreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeMode } = useAppMode();
  const isNotTourist = activeMode !== 'tourist';
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'profile'>('explore');

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [deals, setDeals] = useState<BusinessDealWithBusiness[]>([]);
  const [popularEvents, setPopularEvents] = useState<EventRecord[]>([]);
  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const lastScrollY = useRef(0);

  const fetchAllData = useCallback(async () => {
    try {
      const [
        eventsResult,
        popularEventsResult,
        newsResult,
        moviesResult,
        restaurantsResult,
        businessesResult,
        dealsResult,
        listingsResult,
      ] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('status', 'approved')
          .order('date', { ascending: true })
          .order('time', { ascending: true, nullsFirst: true }),
        supabase
          .from('events')
          .select('*')
          .eq('status', 'approved')
          .eq('is_popular', true)
          .order('date', { ascending: true })
          .order('time', { ascending: true, nullsFirst: true })
          .limit(3),
        supabase
          .from('news_articles')
          .select('*')
          .eq('status', 'published')
          .order('published_at', { ascending: false }),
        supabase
          .from('movies')
          .select('id, title, description, date, time, cover_image_url, trailer_youtube_url, fsk, status, created_at, updated_at')
          .eq('status', 'published')
          .order('date', { ascending: true }),
        supabase
          .from('restaurants')
          .select('*')
          .eq('status', 'published')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        fetchBusinesses(),
        fetchActiveDeals(),
        fetchMarketplaceListings({ limit: 10 }),
      ]);

      if (eventsResult.data) setEvents(eventsResult.data as EventRecord[]);
      if (popularEventsResult.data) setPopularEvents(popularEventsResult.data as EventRecord[]);
      if (newsResult.data) setNewsArticles(newsResult.data as NewsArticle[]);
      if (moviesResult.data) setMovies(moviesResult.data as MovieRecord[]);
      if (restaurantsResult.data) setRestaurants(restaurantsResult.data as RestaurantRecord[]);
      setBusinesses(businessesResult);
      setDeals(dealsResult as BusinessDealWithBusiness[]);
      setListings(listingsResult);
    } catch (error) {
      console.error('Error fetching explore data:', error);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setLoading(true);
      await fetchAllData();
      if (!isCancelled) setLoading(false);
    }
    load();
    return () => { isCancelled = true; };
  }, [fetchAllData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  const handleTabPress = (tab: 'home' | 'explore' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') {
      router.replace('/');
    } else if (tab === 'profile') {
      router.push('/profile');
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    if (currentY > lastScrollY.current + 10) {
      setFabVisible(false);
    } else if (currentY < lastScrollY.current - 10) {
      setFabVisible(true);
    }
    lastScrollY.current = currentY;
  };

  // Filter events for sections
  const futurePopularEvents = popularEvents.filter((e) => isEventTodayOrFuture(e.date));
  const futureEvents = events.filter((e) => isEventTodayOrFuture(e.date));
  const nearbyEvents = futureEvents.filter(
    (e) => !isEventInRoebel(e.location, e.formatted_address, e.address_components) && !e.is_popular
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Entdecken</Text>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}
            accessibilityLabel="Suchen"
            onPress={() => setShowSearchModal(true)}
          >
            <SearchIcon size={20} color={colors.tabIconActive} />
          </Pressable>
        </View>

        {/* Category Chips */}
        <ExploreCategoryChips />

        {loading ? (
          <View style={styles.skeletonContainer}>
            <HeroCardSkeleton />
            <View style={styles.skeletonSection}>
              <Skeleton width="40%" height={24} borderRadius={6} style={{ marginBottom: 12, marginHorizontal: 16 }} />
              <View style={styles.skeletonRow}>
                <Skeleton width={240} height={140} borderRadius={12} style={{ marginLeft: 16 }} />
                <Skeleton width={240} height={140} borderRadius={12} style={{ marginLeft: 12 }} />
              </View>
            </View>
            <View style={styles.skeletonSection}>
              <Skeleton width="40%" height={24} borderRadius={6} style={{ marginBottom: 12, marginHorizontal: 16 }} />
              <View style={styles.skeletonRow}>
                <Skeleton width={240} height={140} borderRadius={12} style={{ marginLeft: 16 }} />
                <Skeleton width={240} height={140} borderRadius={12} style={{ marginLeft: 12 }} />
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Hero Swiper */}
            <SwipeableCardStack
              events={futurePopularEvents}
              showPagination
              loop
              containerStyle={{ paddingVertical: 16, marginBottom: 0 }}
            />

            {/* This Week Events - Horizontal */}
            <ThisWeekEventsHorizontal events={futureEvents} />

            {/* All Events - Horizontal */}
            <AllEventsHorizontal events={futureEvents} />

            {/* Movies */}
            <MovieSection movies={movies} />

            {/* Marketplace */}
            <MarketplaceSection listings={listings} />

            {/* Deals */}
            <DealsGridSection deals={deals} />

            {/* News */}
            <NewsSection articles={newsArticles} />

            {/* Horoscope Banner (Extended Mode) */}
            {isNotTourist && <HoroscopeBanner />}

            {/* Local Businesses */}
            <BusinessSection businesses={businesses} />

            {/* Restaurants */}
            <RestaurantSection restaurants={restaurants} />

            {/* Nearby Events */}
            <NearbyEventsSection events={nearbyEvents} />

            {/* Fortune Cards Banner (Extended Mode) */}
            {isNotTourist && <FortuneCardsBanner />}

            {/* Mini Games (Extended Mode) */}
            {isNotTourist && <MiniGamesSection />}
          </>
        )}

        {/* Bottom padding for BottomNavigation */}
        <View style={{ height: BOTTOM_NAV_HEIGHT + 10 }} />
      </ScrollView>

      {/* Search Modal */}
      <SearchModal visible={showSearchModal} onClose={() => setShowSearchModal(false)} />

      {/* Map FAB */}
      <MapFAB visible={fabVisible} />

      {/* Bottom Navigation */}
      <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  skeletonContainer: {
    marginTop: 24,
  },
  skeletonSection: {
    marginBottom: 32,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
