import React, { memo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { EventRecord } from '@/lib/types';
import HorizontalEventCard from './HorizontalEventCard';
import { useTheme } from '@/context/ThemeContext';
import { RAIL_LIST_PROPS } from './railListProps';

type Props = {
  /** Already bucketed by partitionExploreEvents: upcoming, this week, in Röbel. */
  events: EventRecord[];
};

const renderEventCard = ({ item }: { item: EventRecord }) => <HorizontalEventCard event={item} />;
const eventKey = (event: EventRecord) => event.id;

function ThisWeekEventsHorizontal({ events }: Props) {
  const { colors } = useTheme();

  if (events.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Diese Woche</Text>
      </View>
      <FlatList
        horizontal
        data={events}
        renderItem={renderEventCard}
        keyExtractor={eventKey}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        {...RAIL_LIST_PROPS}
      />
    </View>
  );
}

export default memo(ThisWeekEventsHorizontal);

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
