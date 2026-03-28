import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { EventRecord } from '@/lib/types';
import { isEventThisWeek, isEventTodayOrFuture } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import EventCard from './EventCard';

type Props = {
  events: EventRecord[];
};

export default function ThisWeekEvents({ events }: Props) {
  const { colors } = useTheme();

  // Filter events for this week that are today or in the future
  const thisWeekEvents = events.filter(event =>
    isEventThisWeek(event.date) && isEventTodayOrFuture(event.date)
  );

  if (thisWeekEvents.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Diese Woche</Text>
      </View>

      <View style={styles.eventsContainer}>
        {thisWeekEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  eventsContainer: {
    marginTop: 0,
  },
});
