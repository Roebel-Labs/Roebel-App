import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import EventCard from '@/components/EventCard';
import BottomNavigation from '@/components/BottomNavigation';
import { supabase } from '@/lib/supabase';
import { EventRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

export default function CalendarScreen() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'map' | 'profile'>('home');
  const { colors } = useTheme();

  // Fetch events on component mount
  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'approved')
        .order('date', { ascending: true })
        .order('time', { ascending: true, nullsFirst: true });

      if (error) {
        console.error('Calendar events error:', error);
        setEvents([]);
      } else {
        setEvents(data as EventRecord[]);
      }
      setLoading(false);
    }

    fetchEvents();
  }, []);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped: { [key: string]: EventRecord[] } = {};
    events.forEach(event => {
      const dateKey = event.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });
    return grouped;
  }, [events]);

  // Get events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return eventsByDate[dateKey] || [];
  }, [selectedDate, eventsByDate]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
    setSelectedDate(null);
  };

  const handleDatePress = (date: Date) => {
    setSelectedDate(isSameDay(date, selectedDate || new Date('1900-01-01')) ? null : date);
  };

  const handleTabPress = (tab: 'home' | 'explore' | 'map' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'explore') {
      router.replace('/explore');
    } else if (tab === 'map') {
      router.push('/location');
    } else if (tab === 'profile') {
      router.replace('/profile');
    } else if (tab === 'home') {
      router.replace('/');
    }
  };

  const renderDay = (date: Date, index: number) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const hasEvents = eventsByDate[dateKey] && eventsByDate[dateKey].length > 0;
    const isSelected = selectedDate && isSameDay(date, selectedDate);
    const isCurrentMonth = isSameMonth(date, currentDate);
    const isTodayDate = isToday(date);

    return (
      <Pressable
        key={index}
        style={[
          styles.dayContainer,
          isSelected && styles.daySelected,
          !isCurrentMonth && styles.dayOutsideMonth,
        ]}
        onPress={() => handleDatePress(date)}
      >
        <View style={[
          styles.dayContent,
          isTodayDate && { backgroundColor: colors.primary },
        ]}>
          <Text style={[
            styles.dayText,
            { color: colors.textPrimary },
            !isCurrentMonth && { color: colors.disabled },
            isSelected && { color: colors.textInverted, fontFamily: 'Inter-Medium' },
            isTodayDate && { color: colors.textInverted, fontFamily: 'Inter-Medium' },
          ]}>
            {format(date, 'd')}
          </Text>
          {hasEvents && (
            <View style={[
              styles.eventIndicator,
              { backgroundColor: colors.primary },
              isSelected && { backgroundColor: colors.textInverted },
            ]} />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Kalender</Text>
          </View>
        </View>

        {/* Calendar */}
        <View style={[styles.calendarContainer, { backgroundColor: colors.background }]}>
          {/* Month navigation */}
          <View style={styles.monthHeader}>
            <Pressable onPress={() => navigateMonth('prev')} style={[styles.navButton, { backgroundColor: colors.surfaceSecondary }]}>
              <ChevronLeft size={20} color={colors.tabIconActive} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
              {format(currentDate, 'MMMM yyyy', { locale: de })}
            </Text>
            <Pressable onPress={() => navigateMonth('next')} style={[styles.navButton, { backgroundColor: colors.surfaceSecondary }]}>
              <ChevronRight size={20} color={colors.tabIconActive} />
            </Pressable>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekHeader}>
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
              <View key={day} style={styles.weekDayContainer}>
                <Text style={[styles.weekDayText, { color: colors.textTertiary }]}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((date, index) => renderDay(date, index))}
          </View>
        </View>

        {/* Selected date events */}
        {selectedDate && (
          <View style={styles.eventsSection}>
            <Text style={[styles.eventsTitle, { color: colors.textPrimary }]}>
              {format(selectedDate, 'EEEE, d. MMMM yyyy', { locale: de })}
            </Text>
            {loading ? (
              <Text style={[styles.loadingText, { color: colors.textTertiary }]}>Lade Veranstaltungen...</Text>
            ) : selectedDateEvents.length === 0 ? (
              <Text style={[styles.noEventsText, { color: colors.textTertiary }]}>
                Keine Veranstaltungen an diesem Tag
              </Text>
            ) : (
              selectedDateEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))
            )}
          </View>
        )}
      </ScrollView>

      <BottomNavigation
        activeTab={activeTab}
        onTabPress={handleTabPress}
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Medium',
  },
  calendarContainer: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  monthTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    textTransform: 'capitalize',
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayContainer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayContainer: {
    width: `${100/7}%`,
    aspectRatio: 1,
    padding: 2,
  },
  dayContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    position: 'relative',
  },
  dayText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  daySelected: {
    backgroundColor: 'transparent',
  },
  dayOutsideMonth: {
    opacity: 0.5,
  },
  eventIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  eventsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  eventsTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  loadingText: {
    textAlign: 'center',
    fontFamily: 'Inter',
    marginTop: 20,
  },
  noEventsText: {
    textAlign: 'center',
    fontFamily: 'Inter',
    marginTop: 20,
  },
});
