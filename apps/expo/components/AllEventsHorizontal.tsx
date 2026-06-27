import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { EventRecord } from '@/lib/types';
import { isEventThisWeek, isEventTodayOrFuture } from '@/lib/utils';
import HorizontalEventCard from './HorizontalEventCard';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  events: EventRecord[];
};

export default function AllEventsHorizontal({ events }: Props) {
  const { colors } = useTheme();

  const otherEvents = useMemo(() => {
    return events.filter(
      (event) =>
        isEventTodayOrFuture(event.date) &&
        !isEventThisWeek(event.date) &&
        event.is_popular !== true
    );
  }, [events]);

  if (otherEvents.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Alle Veranstaltungen</Text>
      </View>
      <FlatList
        horizontal
        data={otherEvents}
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
