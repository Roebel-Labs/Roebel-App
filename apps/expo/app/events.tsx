import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { EventRecord } from '@/lib/types';
import EventCard from '@/components/EventCard';
import { EventCardSkeleton } from '@/components/SkeletonLoader';
import BottomNavigation from '@/components/BottomNavigation';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { CATEGORY_METADATA, EVENT_CATEGORIES, EventCategory } from '@/lib/categories';

type PillFilter = 'Alle' | EventCategory;

const PILLS: PillFilter[] = ['Alle', ...EVENT_CATEGORIES];

export default function EventsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<PillFilter>('Alle');

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .gte('date', todayString)
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: true });

    if (error) {
      console.error('Error fetching events:', error);
      setEvents([]);
    } else {
      setEvents((data ?? []) as EventRecord[]);
    }
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  }

  const filteredEvents =
    activeFilter === 'Alle' ? events : events.filter((e) => e.category === activeFilter);

  const renderPill = ({ item }: { item: PillFilter }) => {
    const isActive = activeFilter === item;
    const meta = item === 'Alle' ? null : CATEGORY_METADATA[item];
    const pillBackground = isActive
      ? colors.primary
      : isDark
      ? '#4a4d52'
      : colors.surfaceSecondary;
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loading && (
          <View style={styles.list}>
            <EventCardSkeleton />
            <EventCardSkeleton />
            <EventCardSkeleton />
          </View>
        )}

        {!loading && (
          <View style={styles.list}>
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => <EventCard key={event.id} event={event} />)
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Keine Veranstaltungen gefunden.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <BottomNavigation
        activeTab="explore"
        onTabPress={(tab) => {
          if (tab === 'home') router.replace('/');
          else if (tab === 'explore') router.replace('/explore');
          else if (tab === 'profile') router.push('/profile');
        }}
      />
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
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  pillRowContainer: {
    flexGrow: 0,
  },
  pillRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontFamily: 'Inter-Medium',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    paddingTop: 8,
  },
  list: {
    paddingHorizontal: 16,
    gap: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
});
