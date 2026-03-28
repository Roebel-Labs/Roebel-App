import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowLeftIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import { EventDateRecord, EventRecord } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';

export default function EventAllDates() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [dates, setDates] = useState<EventDateRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [eventResult, datesResult] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).single(),
        supabase
          .from('event_dates')
          .select('*')
          .eq('event_id', id)
          .order('date', { ascending: true }),
      ]);

      if (eventResult.data) setEvent(eventResult.data as EventRecord);
      if (datesResult.data) setDates(datesResult.data as EventDateRecord[]);
      setLoading(false);
    }
    if (id) load();
  }, [id]);

  const renderDate = ({ item }: { item: EventDateRecord }) => {
    const date = parseISO(item.date);
    const isPastDate = isPast(date) && !isToday(date);
    const isTodayDate = isToday(date);

    return (
      <View
        style={[
          styles.dateCard,
          { backgroundColor: colors.surface },
          isPastDate && { backgroundColor: colors.surface },
          item.is_cancelled && { backgroundColor: colors.errorBackground },
        ]}
      >
        <View style={styles.dateCardContent}>
          <View
            style={[
              styles.dateCircle,
              { backgroundColor: colors.cardPlaceholder },
              isTodayDate && { backgroundColor: colors.primary },
              isPastDate && { backgroundColor: colors.disabled },
            ]}
          >
            <Text
              style={[
                styles.dateCircleText,
                { color: colors.textPrimary },
                isTodayDate && { color: colors.textInverted },
                isPastDate && { color: colors.textSecondary },
              ]}
            >
              {format(date, 'd')}
            </Text>
          </View>
          <View style={styles.flex1}>
            <Text
              style={[
                styles.datePrimaryText,
                { color: colors.textPrimary },
                isPastDate && { color: colors.textTertiary },
              ]}
            >
              {format(date, 'EEEE, d. MMMM yyyy', { locale: de })}
            </Text>
            {event?.time && (
              <Text
                style={[
                  styles.dateSecondaryText,
                  { color: colors.textSecondary },
                  isPastDate && { color: colors.textTertiary },
                ]}
              >
                {formatTime(event.time)}
                {event.end_time && ` - ${formatTime(event.end_time)}`}
              </Text>
            )}
            {item.notes && (
              <Text style={[styles.dateNotes, { color: colors.primary }]}>{item.notes}</Text>
            )}
          </View>
        </View>
        {item.is_cancelled && (
          <View style={[styles.badge, { backgroundColor: colors.error }]}>
            <Text style={[styles.badgeText, { color: colors.textInverted }]}>Abgesagt</Text>
          </View>
        )}
        {isTodayDate && !item.is_cancelled && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.textInverted }]}>Heute</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Laden...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Count upcoming dates
  const upcomingCount = dates.filter(d => !isPast(parseISO(d.date)) || isToday(parseISO(d.date))).length;
  const pastCount = dates.length - upcomingCount;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButtonCircle, { backgroundColor: colors.surfaceSecondary }]}>
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Alle Termine</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Event Title */}
      <View style={[styles.eventTitleSection, { borderBottomColor: colors.border }]}>
        <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>{event?.title}</Text>
        <Text style={[styles.eventLocation, { color: colors.textSecondary }]}>{event?.location}</Text>
        <View style={styles.countsRow}>
          <Text style={[styles.upcomingCount, { color: colors.primary }]}>
            {upcomingCount} kommende{upcomingCount !== 1 ? '' : 'r'} Termin{upcomingCount !== 1 ? 'e' : ''}
          </Text>
          {pastCount > 0 && (
            <Text style={[styles.pastCount, { color: colors.textTertiary }]}>
              • {pastCount} vergangen
            </Text>
          )}
        </View>
      </View>

      {/* Dates List */}
      <FlatList
        data={dates}
        renderItem={renderDate}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Keine Termine gefunden</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
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
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  eventTitleSection: {
    padding: 20,
    borderBottomWidth: 1,
  },
  eventTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
  },
  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upcomingCount: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  pastCount: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  dateCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dateCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dateCircle: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  dateCircleText: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  datePrimaryText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    textTransform: 'capitalize',
  },
  dateSecondaryText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  dateNotes: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    fontStyle: 'italic',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    marginTop: 40,
    fontSize: 15,
  },
});
