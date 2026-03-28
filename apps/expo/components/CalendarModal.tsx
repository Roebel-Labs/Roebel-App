import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import EventCard from '@/components/EventCard';
import { supabase } from '@/lib/supabase';
import { EventRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function CalendarModal({ visible, onClose }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();

  // Fetch events when modal opens
  useEffect(() => {
    if (visible) {
      fetchEvents();
      // Reset to current month when opening
      setCurrentDate(new Date());
      setSelectedDate(null);
    }
  }, [visible]);

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

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Add padding days to start from Monday
  const startDayOfWeek = monthStart.getDay();
  const paddingDays = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
  const paddingDaysArray = Array.from({ length: paddingDays }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(date.getDate() - (paddingDays - i));
    return date;
  });

  const allDays = [...paddingDaysArray, ...calendarDays];

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
    if (!isSameMonth(date, currentDate)) return; // Don't select dates outside current month
    setSelectedDate(isSameDay(date, selectedDate || new Date('1900-01-01')) ? null : date);
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
        style={styles.dayContainer}
        onPress={() => handleDatePress(date)}
        disabled={!isCurrentMonth}
      >
        <View style={[
          styles.dayContent,
          isTodayDate && { backgroundColor: colors.surfaceSecondary },
          isSelected && styles.selectedBackground,
        ]}>
          <Text style={[
            styles.dayText,
            { color: colors.textPrimary },
            !isCurrentMonth && { color: colors.disabled },
            isTodayDate && { color: colors.textPrimary, fontFamily: 'Inter-Medium' },
            isSelected && styles.selectedText,
          ]}>
            {format(date, 'd')}
          </Text>
          {hasEvents && isCurrentMonth && (
            <View style={[
              styles.eventIndicator,
              (isSelected || isTodayDate) && styles.eventIndicatorLight,
            ]} />
          )}
        </View>
      </Pressable>
    );
  };

  const handleClose = () => {
    setSelectedDate(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Kalender</Text>
          <Pressable onPress={handleClose} style={styles.cancelButton}>
            <Text style={[styles.cancelText, { color: colors.primary }]}>Fertig</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Calendar */}
          <View style={[styles.calendarContainer, { backgroundColor: colors.background }]}>
            {/* Month navigation */}
            <View style={styles.monthHeader}>
              <Pressable onPress={() => navigateMonth('prev')} style={[styles.navButton, { backgroundColor: colors.surfaceSecondary }]}>
                <ChevronLeft size={20} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
                {format(currentDate, 'MMMM yyyy', { locale: de })}
              </Text>
              <Pressable onPress={() => navigateMonth('next')} style={[styles.navButton, { backgroundColor: colors.surfaceSecondary }]}>
                <ChevronRight size={20} color={colors.textPrimary} />
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
              {allDays.map((date, index) => renderDay(date, index))}
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
      </View>
    </Modal>
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
    paddingVertical: 12,
    paddingTop: 60, // Account for status bar
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  scrollView: {
    flex: 1,
  },
  calendarContainer: {
    marginHorizontal: 16,
    marginTop: 16,
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
  selectedBackground: {
    backgroundColor: '#194383',
  },
  selectedText: {
    color: '#ffffff',
    fontFamily: 'Inter-Medium',
  },
  eventIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#194383',
  },
  eventIndicatorLight: {
    backgroundColor: '#ffffff',
  },
  eventsSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
