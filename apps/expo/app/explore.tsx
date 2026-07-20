import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { fetchActiveDeals } from '@/lib/supabase-deals';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { isEventTodayOrFuture, isEventInRoebel } from '@/lib/utils';
import type {
  EventRecord,
  NewsArticle,
  MovieRecord,
  RestaurantRecord,
  BusinessDealWithBusiness,
} from '@/lib/types';

import BottomNavigation, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import ExploreSearchBar from '@/components/ExploreSearchBar';
import ExploreCategoryChips from '@/components/ExploreCategoryChips';
import SwipeableCardStack from '@/components/SwipeableCardStack';
import ThisWeekEventsHorizontal from '@/components/ThisWeekEventsHorizontal';
import AllEventsHorizontal from '@/components/AllEventsHorizontal';
import DealsGridSection from '@/components/DealsGridSection';
import NewsSection from '@/components/NewsSection';
import RestaurantSection from '@/components/RestaurantSection';
import MovieSection from '@/components/MovieSection';
import MarketplaceSection from '@/components/MarketplaceSection';
import NearbyEventsSection from '@/components/NearbyEventsSection';
import NearbyOrgAccountsSection from '@/components/NearbyOrgAccountsSection';
import MapFAB from '@/components/MapFAB';
import MiniAppsEntry from '@/components/miniapp/MiniAppsEntry';
import SearchModal from '@/components/SearchModal';
import { Skeleton, HeroCardSkeleton } from '@/components/SkeletonLoader';

async function fetchExploreData() {
  const [
    eventsResult,
    popularEventsResult,
    newsResult,
    moviesResult,
    restaurantsResult,
    dealsResult,
    listingsResult,
  ] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .gte('date', new Date().toISOString().split('T')[0]) // LIMIT: only today+future
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: true })
      .limit(60), // LIMIT
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
      .order('published_at', { ascending: false })
      .limit(20), // LIMIT
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
      .order('name', { ascending: true })
      .limit(50), // LIMIT
    fetchActiveDeals(),
    fetchMarketplaceListings({ limit: 10 }),
  ]);

  return {
    events: (eventsResult.data ?? []) as EventRecord[],
    popularEvents: (popularEventsResult.data ?? []) as EventRecord[],
    newsArticles: (newsResult.data ?? []) as NewsArticle[],
    movies: (moviesResult.data ?? []) as MovieRecord[],
    restaurants: (restaurantsResult.data ?? []) as RestaurantRecord[],
    deals: dealsResult as BusinessDealWithBusiness[],
    listings: listingsResult,
  };
}

export default function ExploreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'profile'>('explore');

  const [refreshing, setRefreshing] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const lastScrollY = useRef(0);
  // When the user taps a result/tile inside the search modal we close the modal
  // and navigate, but flag it to reopen once Explore regains focus — so pressing
  // back from the subpage returns to the search page, not the bare feed.
  const reopenSearch = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (reopenSearch.current) {
        reopenSearch.current = false;
        setShowSearchModal(true);
      }
    }, [])
  );

  const exploreQuery = useQuery({
    queryKey: ['explore', 'all'],
    queryFn: fetchExploreData,
    meta: { persist: true },
  });

  const events = exploreQuery.data?.events ?? [];
  const popularEvents = exploreQuery.data?.popularEvents ?? [];
  const newsArticles = exploreQuery.data?.newsArticles ?? [];
  const movies = exploreQuery.data?.movies ?? [];
  const restaurants = exploreQuery.data?.restaurants ?? [];
  const deals = exploreQuery.data?.deals ?? [];
  const listings = exploreQuery.data?.listings ?? [];
  const loading = exploreQuery.isPending;

  const onRefresh = async () => {
    setRefreshing(true);
    await exploreQuery.refetch();
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
        {/* Search bar */}
        <ExploreSearchBar onPress={() => setShowSearchModal(true)} />

        {/* Category tiles */}
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
              containerStyle={{ paddingTop: 8, paddingBottom: 16, marginBottom: 0 }}
            />

            {/* This Week Events - Horizontal */}
            <ThisWeekEventsHorizontal events={futureEvents} />

            {/* Movies */}
            <MovieSection movies={movies} />

            {/* Mini Apps store entry */}
            <MiniAppsEntry />

            {/* Marketplace */}
            <MarketplaceSection listings={listings} />

            {/* News */}
            <NewsSection articles={newsArticles} />

            {/* Deals */}
            <DealsGridSection deals={deals} />

            {/* Restaurants */}
            <RestaurantSection restaurants={restaurants} />

            {/* Nearby Events */}
            <NearbyEventsSection events={nearbyEvents} />

            {/* Nearby Org Accounts (Unternehmen) */}
            <NearbyOrgAccountsSection />

            {/* All Events - Horizontal */}
            <AllEventsHorizontal events={futureEvents} />
          </>
        )}

        {/* Bottom padding for BottomNavigation */}
        <View style={{ height: BOTTOM_NAV_HEIGHT + 10 }} />
      </ScrollView>

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
  skeletonContainer: {
    marginTop: 24,
  },
  skeletonSection: {
    marginBottom: 32,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
});
