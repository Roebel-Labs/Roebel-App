import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { resolveEventAuthors } from '@/lib/supabase-posts';
import { EventRecord } from '@/lib/types';
import EventListRow, { DATE_RAIL_WIDTH, EventDateChip } from '@/components/EventListRow';
import EventMonthCalendar from '@/components/events/EventMonthCalendar';
import { EventListRowSkeleton } from '@/components/SkeletonLoader';
import BottomNavigation, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import GlassSurface, { GlassBackdrop, GlassProvider } from '@/components/GlassSurface';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CATEGORY_METADATA, EVENT_CATEGORIES, EventCategory } from '@/lib/categories';

type PillFilter = 'Alle' | EventCategory;

const PILLS: PillFilter[] = ['Alle', ...EVENT_CATEGORIES];

/** Gutter for the whole screen — header, filter rail and list share it. */
const GUTTER = 16;
/** Space between the header and the calendar at the top of the list. */
const LIST_TOP_GAP = 12;

// Sticky date strip under the category pills: date chips (78pt tall) with
// 8pt above and 12pt below.
const STRIP_HEIGHT = 98;
const STRIP_CHIP_GAP = 8;

// The calendar wants a scroll to land a date's first row right under the strip.
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<EventRecord>);

/**
 * Reports each list cell's y in the list's content coordinates, which is
 * what the sticky strip needs to follow the section under it. A module-level
 * cell component (an inline one would remount every cell on each render)
 * that gets its callback through context.
 */
const CellLayoutContext = createContext<((id: string, y: number) => void) | null>(null);

function TrackedCell({ cellKey, index, item, onLayout, children, ...rest }: any) {
  const record = useContext(CellLayoutContext);
  return (
    <View
      {...rest}
      onLayout={(e: LayoutChangeEvent) => {
        onLayout?.(e);
        if (item) record?.(String(item.id), e.nativeEvent.layout.y);
      }}
    >
      {children}
    </View>
  );
}

type DayStart = { date: string; id: string; index: number };

export default function EventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<PillFilter>('Alle');
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [activeDate, setActiveDate] = useState<string | null>(null);
  // Measured, not guessed: the chrome floats over the list, so the scroll
  // content has to reserve exactly the height the header ends up taking
  // (the filter rail wraps differently across font scales). This is the
  // title + pills part only; the date strip below grows on top of the list.
  const [headerHeight, setHeaderHeight] = useState(0);

  const listRef = useRef<FlatList<EventRecord>>(null);
  const stripRef = useRef<FlatList<DayStart>>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    const todayString = format(new Date(), 'yyyy-MM-dd');

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

  // First event of every day: the strip's chips and the scroll targets.
  const dayStarts = useMemo(() => {
    const starts: DayStart[] = [];
    filteredEvents.forEach((e, index) => {
      if (index === 0 || filteredEvents[index - 1].date !== e.date) {
        starts.push({ date: e.date, id: String(e.id), index });
      }
    });
    return starts;
  }, [filteredEvents]);

  const markedDates = useMemo(() => new Set(dayStarts.map((d) => d.date)), [dayStarts]);

  // ---- Scroll tracking (UI thread) ----------------------------------------
  // Day-start offsets live in a shared value so the scroll worklet can work
  // out the current section without a JS round trip per frame; it only
  // calls back into JS when the section actually changes.
  const cellOffsets = useRef(new Map<string, number>());
  const dayStartsRef = useRef(dayStarts);
  dayStartsRef.current = dayStarts;
  const dayOffsets = useSharedValue<{ y: number; date: string }[]>([]);
  const calendarHeight = useSharedValue(0);
  const chromeHeight = useSharedValue(0);
  const stripShown = useSharedValue(false);
  const activeDateShared = useSharedValue('');
  const rebuildQueued = useRef(false);

  useEffect(() => {
    chromeHeight.value = headerHeight + STRIP_HEIGHT;
  }, [headerHeight, chromeHeight]);

  const rebuildDayOffsets = useCallback(() => {
    rebuildQueued.current = false;
    const next: { y: number; date: string }[] = [];
    for (const d of dayStartsRef.current) {
      const y = cellOffsets.current.get(d.id);
      if (y != null) next.push({ y, date: d.date });
    }
    dayOffsets.value = next;
  }, [dayOffsets]);

  const recordCellLayout = useCallback(
    (id: string, y: number) => {
      cellOffsets.current.set(id, y);
      if (!rebuildQueued.current) {
        rebuildQueued.current = true;
        requestAnimationFrame(rebuildDayOffsets);
      }
    },
    [rebuildDayOffsets]
  );

  // A new filter remounts the list (see `key` below) — start from clean offsets.
  useEffect(() => {
    cellOffsets.current.clear();
    dayOffsets.value = [];
    activeDateShared.value = '';
    setActiveDate(dayStarts[0]?.date ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  useEffect(() => {
    rebuildDayOffsets();
  }, [dayStarts, rebuildDayOffsets]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      // The strip slides in once the calendar's bottom edge has passed under
      // where the strip sits — so a jump that parks a date right below the
      // strip always has the strip showing.
      stripShown.value =
        calendarHeight.value > 0 && y >= LIST_TOP_GAP + calendarHeight.value - STRIP_HEIGHT - 1;

      const probe = y + chromeHeight.value + 1;
      const offsets = dayOffsets.value;
      let current = '';
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i].y <= probe) current = offsets[i].date;
      }
      if (current !== '' && current !== activeDateShared.value) {
        activeDateShared.value = current;
        runOnJS(setActiveDate)(current);
      }
    },
  });

  const stripProgress = useDerivedValue(() =>
    withTiming(stripShown.value ? 1 : 0, { duration: 200 })
  );
  const stripStyle = useAnimatedStyle(() => ({
    height: stripProgress.value * STRIP_HEIGHT,
    opacity: stripProgress.value,
  }));

  // Keep the active chip in view as the sections go by.
  useEffect(() => {
    if (!activeDate) return;
    const index = dayStarts.findIndex((d) => d.date === activeDate);
    if (index >= 0) {
      stripRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    }
  }, [activeDate, dayStarts]);

  // ---- Jumping to a date ---------------------------------------------------
  const scrollInset = headerHeight + STRIP_HEIGHT;

  const scrollToDate = useCallback(
    (dateISO: string) => {
      // The day itself, or the next one that has events.
      const target =
        dayStarts.find((d) => d.date >= dateISO) ?? dayStarts[dayStarts.length - 1];
      if (!target) return;
      activeDateShared.value = target.date;
      setActiveDate(target.date);
      const y = cellOffsets.current.get(target.id);
      if (y != null) {
        listRef.current?.scrollToOffset({ offset: Math.max(0, y - scrollInset), animated: true });
      } else {
        listRef.current?.scrollToIndex({ index: target.index, viewOffset: scrollInset, animated: true });
      }
    },
    [dayStarts, scrollInset, activeDateShared]
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // The row isn't measured yet: get close on the average row height,
      // then retry once the rows around it have rendered.
      listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, viewOffset: scrollInset, animated: true });
      }, 150);
    },
    [scrollInset]
  );

  const onSelectDate = useCallback(
    (dateISO: string) => {
      setSelectedDate(dateISO);
      scrollToDate(dateISO);
    },
    [scrollToDate]
  );

  // ---- Rendering -----------------------------------------------------------
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

  const renderStripChip = ({ item }: { item: DayStart }) => (
    <Pressable
      onPress={() => scrollToDate(item.date)}
      style={({ pressed }) => [styles.stripChip, pressed && styles.pillPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: item.date === activeDate }}
      accessibilityLabel={`Zu ${format(new Date(`${item.date}T12:00:00`), 'EEEE, d. MMMM', { locale: de })} springen`}
    >
      <EventDateChip date={item.date} active={item.date === activeDate} />
    </Pressable>
  );

  const calendar = (
    <View
      style={styles.calendar}
      onLayout={(e) => {
        calendarHeight.value = e.nativeEvent.layout.height;
      }}
    >
      <EventMonthCalendar
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        markedDates={markedDates}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassProvider>
        {/* GlassBackdrop: the surface Android's frosted chrome samples from.
            The header and bottom nav deliberately sit OUTSIDE it, after it in
            JSX order — see GlassSurface.tsx. */}
        <GlassBackdrop style={styles.flex}>
          <CellLayoutContext.Provider value={recordCellLayout}>
            <AnimatedFlatList
              // Remount per filter: fresh cells, fresh offsets, back to the top.
              key={activeFilter}
              ref={listRef as any}
              style={styles.flex}
              data={loading ? [] : filteredEvents}
              renderItem={renderEvent}
              keyExtractor={(item) => String(item.id)}
              CellRendererComponent={TrackedCell}
              ListHeaderComponent={calendar}
              contentContainerStyle={[
                styles.scrollContent,
                styles.list,
                {
                  paddingTop: headerHeight + LIST_TOP_GAP,
                  paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24,
                },
              ]}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              onScrollToIndexFailed={onScrollToIndexFailed}
              initialNumToRender={6}
              maxToRenderPerBatch={8}
              windowSize={9}
              showsVerticalScrollIndicator={false}
              scrollIndicatorInsets={{ top: headerHeight }}
              ListEmptyComponent={
                loading ? (
                  <View>
                    <EventListRowSkeleton />
                    <EventListRowSkeleton />
                    <EventListRowSkeleton />
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      Keine Veranstaltungen gefunden.
                    </Text>
                  </View>
                )
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
          </CellLayoutContext.Provider>
        </GlassBackdrop>

        {/* Frosted chrome: title bar + category rail + (once the calendar has
            scrolled away) the date strip, all in one floating pane — the same
            real blur as the bottom nav. */}
        <View style={styles.headerFloating}>
          <GlassSurface edge="bottom" androidExperimentalBlur />
          <View style={{ paddingTop: insets.top }} onLayout={onHeaderLayout}>
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

          <Animated.View style={[styles.strip, stripStyle]}>
            <FlatList
              ref={stripRef}
              horizontal
              data={dayStarts}
              renderItem={renderStripChip}
              keyExtractor={(item) => item.date}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stripRow}
              getItemLayout={(_, index) => ({
                length: DATE_RAIL_WIDTH + STRIP_CHIP_GAP,
                offset: GUTTER + index * (DATE_RAIL_WIDTH + STRIP_CHIP_GAP),
                index,
              })}
            />
          </Animated.View>
        </View>

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
  strip: {
    overflow: 'hidden',
  },
  stripRow: {
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 12,
  },
  stripChip: {
    width: DATE_RAIL_WIDTH,
    marginRight: STRIP_CHIP_GAP,
  },
  calendar: {
    marginBottom: 16,
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
