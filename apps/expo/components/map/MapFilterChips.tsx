import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export type MapFilter = {
  events: boolean;
  restaurants: boolean;
  businesses: boolean;
  pois: boolean;
};

type Props = {
  filter: MapFilter;
  onFilterChange: (filter: MapFilter) => void;
  liveBuses?: boolean;
  onToggleLiveBuses?: () => void;
  liveBusCount?: number;
};

type Chip = {
  key: keyof MapFilter | 'live';
  label: string;
  emoji: string;
};

const CHIPS: Chip[] = [
  { key: 'events', label: 'Veranstaltungen', emoji: '📅' },
  { key: 'restaurants', label: 'Gastronomie', emoji: '🍽' },
  { key: 'businesses', label: 'Unternehmen', emoji: '🏪' },
  { key: 'pois', label: 'Tipps', emoji: '⭐' },
];

export default function MapFilterChips({
  filter,
  onFilterChange,
  liveBuses,
  onToggleLiveBuses,
  liveBusCount = 0,
}: Props) {
  const { colors } = useTheme();

  const toggleFilter = (key: keyof MapFilter) => {
    onFilterChange({ ...filter, [key]: !filter[key] });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {CHIPS.map((c) => {
          const isActive = filter[c.key as keyof MapFilter];
          return (
            <Pressable
              key={c.key}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? '#000000' : '#ffffff',
                },
              ]}
              onPress={() => toggleFilter(c.key as keyof MapFilter)}
            >
              <Text style={styles.chipEmoji}>{c.emoji}</Text>
              <Text
                style={[
                  styles.chipText,
                  { color: isActive ? '#ffffff' : '#000000' },
                ]}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Live ÖPNV — last chip on the right */}
        {onToggleLiveBuses ? (
          <Pressable
            style={[
              styles.chip,
              {
                backgroundColor: liveBuses ? '#194383' : '#ffffff',
                marginLeft: 4,
              },
            ]}
            onPress={onToggleLiveBuses}
          >
            <View
              style={[
                styles.liveDot,
                { backgroundColor: liveBuses ? '#2BD46B' : '#9CA3AF' },
              ]}
            />
            <Text
              style={[
                styles.chipText,
                { color: liveBuses ? '#ffffff' : '#000000' },
              ]}
            >
              Live ÖPNV{liveBuses && liveBusCount > 0 ? ` · ${liveBusCount}` : ''}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  row: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
