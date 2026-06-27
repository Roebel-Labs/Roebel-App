import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { EventRecord } from '@/lib/types';
import { isEventInRoebel, isEventTodayOrFuture } from '@/lib/utils';
import HorizontalEventCard from './HorizontalEventCard';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  events: EventRecord[];
};

export default function NearbyEventsSection({ events }: Props) {
  const { colors } = useTheme();
  // Filter events that are NOT in Röbel and are today or in the future
  const nearbyEvents = useMemo(() => {
    return events.filter(
      (event) =>
        !isEventInRoebel(event.location, event.formatted_address, event.address_components) &&
        isEventTodayOrFuture(event.date) &&
        event.is_popular !== true
    );
  }, [events]);

  if (nearbyEvents.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>In der Nähe</Text>
      </View>
      <FlatList
        horizontal
        data={nearbyEvents}
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
