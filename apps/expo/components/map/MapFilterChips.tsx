import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from '@/lib/map/constants';

export type MapFilter = {
  events: boolean;
  restaurants: boolean;
  businesses: boolean;
};

type Props = {
  filter: MapFilter;
  onFilterChange: (filter: MapFilter) => void;
};

const CHIPS: { key: keyof MapFilter; entityType: string }[] = [
  { key: 'events', entityType: 'event' },
  { key: 'restaurants', entityType: 'restaurant' },
  { key: 'businesses', entityType: 'business' },
];

export default function MapFilterChips({ filter, onFilterChange }: Props) {
  const { colors } = useTheme();

  const toggleFilter = (key: keyof MapFilter) => {
    onFilterChange({ ...filter, [key]: !filter[key] });
  };

  return (
    <View style={styles.container}>
      {CHIPS.map(({ key, entityType }) => {
        const isActive = filter[key];
        const chipColor = ENTITY_TYPE_COLORS[entityType];
        const label = ENTITY_TYPE_LABELS[entityType];

        return (
          <Pressable
            key={key}
            style={[
              styles.chip,
              {
                backgroundColor: isActive ? colors.background : colors.surface,
                borderColor: isActive ? chipColor : colors.surface,
              },
            ]}
            onPress={() => toggleFilter(key)}
          >
            <View style={[styles.dot, { backgroundColor: isActive ? chipColor : colors.textTertiary }]} />
            <Text
              style={[
                styles.chipText,
                { color: isActive ? colors.textPrimary : colors.textTertiary },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
    zIndex: 100,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
