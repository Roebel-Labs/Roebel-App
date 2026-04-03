import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchIcon, CalendarIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { EventRecord, Filters, NewsArticle, MovieRecord, RestaurantRecord } from '@/lib/types';
import EventCard from '@/components/EventCard';
import SwipeableCardStack from '@/components/SwipeableCardStack';
import ThisWeekEvents from '@/components/ThisWeekEvents';
import NewsSection from '@/components/NewsSection';
import MovieSection from '@/components/MovieSection';
import RestaurantSection from '@/components/RestaurantSection';
import SearchModal from '@/components/SearchModal';
import CalendarModal from '@/components/CalendarModal';
import { Skeleton, EventCardSkeleton, HeroCardSkeleton } from '@/components/SkeletonLoader';
import { useRouter } from 'expo-router';
import { isEventThisWeek, isEventTodayOrFuture, isEventInRoebel } from '@/lib/utils';
import HomeCategoryChips from '@/components/HomeCategoryChips';
import NearbyEventsSection from '@/components/NearbyEventsSection';
import { EventCategory } from '@/lib/categories';
import NotificationPromptDrawer from '@/components/NotificationPromptDrawer';
import { useNotificationsContext } from '@/context/NotificationsContext';
import { useTheme } from '@/context/ThemeContext';
import { useExtendedMode } from '@/context/AppModeContext';
import FeedHome from '@/components/feed/FeedHome';
import { useLivestream } from '@/hooks/useLivestream';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import LivestreamBanner from '@/components/LivestreamBanner';
import AnnouncementModal from '@/components/AnnouncementModal';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function FeedScreen() {
  const { isExtendedMode } = useExtendedMode();

  // Extended mode: show social feed instead of default home
  if (isExtendedMode) {
    return <FeedHome />;
  }

  return <DefaultHome />;
}

function DefaultHome() {
  const router = useRouter();
  const { colors } = useTheme();
  const [filters, setFilters] = useState<Filters>({
    query: '',
    category: '',
    freeOnly: false,
    startDate: null,
    endDate: null,
  });
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [popularEvents, setPopularEvents] = useState<EventRecord[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsListLoading, setEventsListLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const announcementShownRef = useRef(false);
  const { primaryLiveEvent } = useLivestream();
  const { announcement, dismiss: dismissAnnouncement } = useAnnouncements();

  const {
    permissionStatus,
    hasSeenPrompt,
    isLoading: notificationsLoading,
    requestPermission,
    markPromptAsDismissed,
    enableAllNotifications,
  } = useNotificationsContext();

  const debounced = useDebounced(filters, 300);

  useEffect(() => {
    if (
      permissionStatus === 'undetermined' &&
      !hasSeenPrompt &&
      !notificationsLoading &&
      !loading
    ) {
      const timer = setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [permissionStatus, hasSeenPrompt, notificationsLoading, loading]);

  useEffect(() => {
    if (
      announcement &&
      !announcementShownRef.current &&
      !loading
    ) {
      const timer = setTimeout(() => {
        setShowAnnouncementModal(true);
        announcementShownRef.current = true;
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [announcement, loading]);

  const handleNotificationActivate = async () => {
    const granted = await requestPermission();
    if (granted) {
      await enableAllNotifications();
    }
    setShowNotificationPrompt(false);
  };

  const handleNotificationDismiss = async () => {
    await markPromptAsDismissed();
    setShowNotificationPrompt(false);
  };

  useEffect(() => {
    let isCancelled = false;
    async function fetchInitialData() {
      setLoading(true);

      try {
        const eventsQuery = supabase
          .from('events')
          .select('*')
          .eq('status', 'approved')
          .order('date', { ascending: true })
          .order('time', { ascending: true, nullsFirst: true });

        const popularQuery = supabase
          .from('events')
          .select('*')
          .eq('status', 'approved')
          .eq('is_popular', true)
          .order('date', { ascending: true })
          .order('time', { ascending: true, nullsFirst: true })
          .limit(3);

        const newsQuery = supabase
          .from('news_articles')
          .select('*')
          .eq('status', 'published')
          .order('published_at', { ascending: false });

        const moviesQuery = supabase
          .from('movies')
          .select('id, title, description, date, time, cover_image_url, trailer_youtube_url, fsk, status, created_at, updated_at')
          .eq('status', 'published')
          .order('date', { ascending: true });

        const restaurantsQuery = supabase
          .from('restaurants')
          .select('*')
          .eq('status', 'published')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });

        const [eventsResult, popularResult, newsResult, moviesResult, restaurantsResult] = await Promise.all([
          eventsQuery,
          popularQuery,
          newsQuery,
          moviesQuery,
          restaurantsQuery
        ]);

        if (!isCancelled) {
          if (eventsResult.data) {
            setEvents(eventsResult.data as EventRecord[]);
          }
          if (popularResult.data) {
            setPopularEvents(popularResult.data as EventRecord[]);
          }
          if (newsResult.data) {
            setNewsArticles(newsResult.data as NewsArticle[]);
          }
          if (moviesResult.data) {
            setMovies(moviesResult.data as MovieRecord[]);
          }
          if (restaurantsResult.data) {
            setRestaurants(restaurantsResult.data as RestaurantRecord[]);
          }
          setLoading(false);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Fetch error:', error);
          setLoading(false);
        }
      }
    }

    fetchInitialData();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    let isCancelled = false;
    async function fetchFilteredEvents() {
      setEventsListLoading(true);

      let q = supabase
        .from('events')
        .select('*')
        .eq('status', 'approved')
        .order('date', { ascending: true })
        .order('time', { ascending: true, nullsFirst: true });

      if (debounced.query.trim()) {
        const like = `%${debounced.query.trim()}%`;
        q = q.or(
          `title.ilike.${like},description.ilike.${like},location.ilike.${like},organizer_name.ilike.${like}`
        );
      }
      if (debounced.category && debounced.category.trim() !== '') {
        q = q.eq('category', debounced.category);
      }
      if (debounced.freeOnly) {
        q = q.lte('ticket_price', 0);
      }
      if (debounced.startDate) {
        q = q.gte('date', debounced.startDate);
      }
      if (debounced.endDate) {
        q = q.lte('date', debounced.endDate);
      }

      const { data, error } = await q;
      if (!isCancelled) {
        if (error) {
          console.error(error);
          setEvents([]);
        } else {
          setEvents(data as EventRecord[]);
        }
        setEventsListLoading(false);
      }
    }

    fetchFilteredEvents();
    return () => {
      isCancelled = true;
    };
  }, [debounced, loading]);

  const futurePopularEvents = useMemo(() => {
    return popularEvents.filter(event => isEventTodayOrFuture(event.date));
  }, [popularEvents]);

  const eventsToDisplay = useMemo(() => {
    let eventsForList = events.filter(event =>
      event.is_popular === false &&
      !(isEventThisWeek(event.date) && isEventTodayOrFuture(event.date)) &&
      isEventInRoebel(event.location, event.formatted_address, event.address_components)
    );

    if (filters.category && filters.category.trim() !== '') {
      eventsForList = eventsForList.filter(event => event.category === filters.category);
    }

    return eventsForList;
  }, [events, filters.category]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Röbel App</Text>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}
              accessibilityLabel="Kalender öffnen"
              onPress={() => setShowCalendarModal(true)}
            >
              <CalendarIcon size={20} color={colors.tabIconActive} />
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}
              accessibilityLabel="Suchen"
              onPress={() => setShowSearchModal(true)}
            >
              <SearchIcon size={20} color={colors.tabIconActive} />
            </Pressable>
          </View>
        </View>
        {loading ? (
          <>
            <HeroCardSkeleton />
            <View style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 12 }}>
              <Skeleton width={180} height={22} borderRadius={6} />
            </View>
            {[1, 2, 3].map((index) => (
              <EventCardSkeleton key={index} />
            ))}
          </>
        ) : (
          <>
            {primaryLiveEvent && <LivestreamBanner event={primaryLiveEvent} />}
            <SwipeableCardStack events={futurePopularEvents} showPagination loop containerStyle={{ paddingVertical: 16, marginBottom: 0 }} />
            <ThisWeekEvents events={events} />
            <NewsSection articles={newsArticles} />
            <MovieSection movies={movies} />
            <RestaurantSection restaurants={restaurants} />
            <NearbyEventsSection events={events} />

            <View style={styles.eventsSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Weitere Veranstaltungen</Text>
              <HomeCategoryChips
                onCategoryPress={(category: EventCategory) => {
                  router.push(`/category/${category}` as any);
                }}
              />
              <View style={styles.eventsList}>
              {eventsListLoading ? (
                <>
                  {[1, 2, 3].map((index) => (
                    <EventCardSkeleton key={index} />
                  ))}
                </>
              ) : eventsToDisplay.length === 0 ? (
                <Text style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 20 }}>Keine Veranstaltungen entsprechen deinen Filtern.</Text>
              ) : (
                eventsToDisplay.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <SearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />

      <CalendarModal
        visible={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
      />

      <NotificationPromptDrawer
        visible={showNotificationPrompt}
        onActivate={handleNotificationActivate}
        onDismiss={handleNotificationDismiss}
      />

      {announcement && (
        <AnnouncementModal
          visible={showAnnouncementModal}
          announcement={announcement}
          onDismiss={() => {
            setShowAnnouncementModal(false);
            if (announcement.show_once) {
              dismissAnnouncement(announcement.id);
            }
          }}
        />
      )}
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
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventsSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  eventsList: {
    marginTop: 0,
  },
});
