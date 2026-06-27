import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { EventRecord } from '@/lib/types';
import { isEventThisWeek, isEventTodayOrFuture, isEventInRoebel } from '@/lib/utils';
import HorizontalEventCard from './HorizontalEventCard';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  events: EventRecord[];
};

export default function ThisWeekEventsHorizontal({ events }: Props) {
  const { colors } = useTheme();

  const thisWeekEvents = useMemo(() => {
    return events.filter(
      (event) =>
        isEventThisWeek(event.date) &&
        isEventTodayOrFuture(event.date) &&
        isEventInRoebel(event.location, event.formatted_address, event.address_components)
    );
  }, [events]);

  if (thisWeekEvents.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Diese Woche</Text>
      </View>
      <FlatList
        horizontal
        data={thisWeekEvents}
        renderItem={({ item }) => <HorizontalEventCard event={item} />}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
});
