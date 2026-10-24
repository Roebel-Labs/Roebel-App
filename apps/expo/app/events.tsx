import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Pressable,
  FlatList,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { resolveEventAuthors } from '@/lib/supabase-posts';
import { EventRecord } from '@/lib/types';
import EventListRow from '@/components/EventListRow';
import { EventListRowSkeleton } from '@/components/SkeletonLoader';
import BottomNavigation, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import GlassSurface, { GlassBackdrop, GlassProvider } from '@/components/GlassSurface';
import MapFAB from '@/components/MapFAB';
import { ArrowLeftIcon, CalendarIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CATEGORY_METADATA, EVENT_CATEGORIES, EventCategory } from '@/lib/categories';

type PillFilter = 'Alle' | EventCategory;

const PILLS: PillFilter[] = ['Alle', ...EVENT_CATEGORIES];

/** Gutter for the whole screen — header, filter rail and list share it. */
const GUTTER = 16;

export default function EventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<PillFilter>('Alle');
  // Measured, not guessed: the chrome floats over the list, so the scroll
  // content has to reserve exactly the height the header ends up taking
  // (the filter rail wraps differently across font scales).
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('events')
      // The account embed feeds resolveEventAuthors, which turns the row into
      // a display identity (org name/avatar, or the owner's user profile) —
      // never a wallet address.
      .select('*, account:accounts(id, name, avatar_url, account_type)')
      .eq('status', 'approved')
      .gte('date', todayString)
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: true });

    if (error) {
      console.error('Error fetching events:', error);
      setEvents([]);
    } else {
      const rows = (data ?? []) as any[];
      await resolveEventAuthors(rows);
      setEvents(rows as EventRecord[]);
    }
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  }

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    setHeaderHeight(e.nativeEvent.layout.height);
  }, []);

  const filteredEvents = useMemo(
    () => (activeFilter === 'Alle' ? events : events.filter((e) => e.category === activeFilter)),
    [events, activeFilter]
  );

  // Calendar pill hides on scroll-down, returns on scroll-up — same UI-thread
  // worklet as the Karte pill on Erkunden.
  const pillVisible = useSharedValue(true);
  const lastScrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      if (currentY > lastScrollY.value + 10) {
        pillVisible.value = false;
      } else if (currentY < lastScrollY.value - 10) {
        pillVisible.value = true;
      }
      lastScrollY.value = currentY;
    },
  });

  const renderEvent = useCallback(
    ({ item, index }: { item: EventRecord; index: number }) => (
      <EventListRow
        event={item}
        // One date chip per day: the rail only marks where a new day starts,
        // so same-day events hang under it.
        showDate={index === 0 || filteredEvents[index - 1].date !== item.date}
        showDivider={index < filteredEvents.length - 1}
      />
    ),
    [filteredEvents]
  );

  const renderPill = ({ item }: { item: PillFilter }) => {
    const isActive = activeFilter === item;
    const meta = item === 'Alle' ? null : CATEGORY_METADATA[item];
    const pillBackground = isActive
      ? colors.primary
      : isDark
      ? 'rgba(255,255,255,0.10)'
      : 'rgba(0,0,0,0.05)';
    const labelColor = isActive ? colors.textInverted : colors.textPrimary;

    return (
      <Pressable
        onPress={() => setActiveFilter(item)}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: pillBackground },
          pressed && styles.pillPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={item}
      >
        {meta && (
          <Image source={meta.image} style={styles.pillImage} contentFit="contain" transition={0} />
        )}
        <Text style={[styles.pillLabel, { color: labelColor }]} numberOfLines={1}>
          {item}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassProvider>
        {/* GlassBackdrop: the surface Android's frosted chrome samples from.
            The header and bottom nav deliberately sit OUTSIDE it, after it in
            JSX order — see GlassSurface.tsx. */}
        <GlassBackdrop style={styles.flex}>
          {/* Virtualized: the old ScrollView mounted every upcoming event (and
              its images) at once, and Android's frost re-sampled all of it
              each frame. */}
          {loading ? (
            <View style={[styles.list, { paddingTop: headerHeight + 12 }]}>
              <EventListRowSkeleton />
              <EventListRowSkeleton />
              <EventListRowSkeleton />
            </View>
          ) : (
            <Animated.FlatList
              style={styles.flex}
              data={filteredEvents}
              renderItem={renderEvent}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={[
                styles.scrollContent,
                styles.list,
                {
                  paddingTop: headerHeight + 12,
                  paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 88,
                },
              ]}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews
              showsVerticalScrollIndicator={false}
              scrollIndicatorInsets={{ top: headerHeight }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    Keine Veranstaltungen gefunden.
                  </Text>
                </View>
              }
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                  progressViewOffset={headerHeight}
                />
              }
            />
          )}
        </GlassBackdrop>

        {/* Frosted chrome: title bar + category rail in one floating pane.
            Real blur on iOS only — on Android the bottom nav stays the single
            blur sampler of this screen (see GlassBackdrop); a second sampler
            over the list made scrolling stutter. */}
        <View style={[styles.headerFloating, { paddingTop: insets.top }]} onLayout={onHeaderLayout}>
          <GlassSurface edge="bottom" />
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Zurück"
            >
              <ArrowLeftIcon size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Veranstaltungen</Text>
            <View style={styles.headerSpacer} />
          </View>

          <FlatList
            horizontal
            data={PILLS}
            renderItem={renderPill}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
            style={styles.pillRowContainer}
          />
        </View>

        <MapFAB
          visible={pillVisible}
          label="Kalender"
          href="/calendar"
          replace
          icon={<CalendarIcon size={16} color={colors.textPrimary} />}
          accessibilityLabel="Kalenderansicht öffnen"
        />

        <View style={styles.navOverlay}>
          <BottomNavigation
            activeTab="explore"
            glass
            onTabPress={(tab) => {
              if (tab === 'home') router.replace('/');
              else if (tab === 'explore') router.replace('/explore');
              else if (tab === 'profile') router.push('/profile');
            }}
          />
        </View>
      </GlassProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  headerFloating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 48,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backButtonPressed: {
    opacity: 0.5,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: fontFamily.headingSemiBold,
  },
  headerSpacer: {
    width: 40,
  },
  pillRowContainer: {
    flexGrow: 0,
  },
  pillRow: {
    paddingHorizontal: GUTTER,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
    minHeight: 36,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillImage: {
    width: 22,
    height: 22,
  },
  pillLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  scrollContent: {
    flexGrow: 1,
  },
  list: {
    paddingHorizontal: GUTTER,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
  },
  navOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
