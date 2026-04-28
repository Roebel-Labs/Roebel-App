import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CalendarIcon,
  MarketsIcon,
  StarIconComponent as StarIcon,
} from '@/components/Icons';

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

// Inline fork & knife icon (Gastronomie)
function CutleryIcon({ size = 16, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 3v8a2 2 0 0 0 2 2v8M5 3v6a2 2 0 0 0 2 2"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 3v18M16 3c2 0 3 2 3 5v3c0 1-1 2-3 2"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Inline bus icon (Live ÖPNV)
function BusIcon({ size = 16, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 17V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v9M5 17v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2M5 17h14M19 17v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2M5 11h14"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={8} cy={14} r={1} fill={color} />
      <Circle cx={16} cy={14} r={1} fill={color} />
    </Svg>
  );
}

type Chip = {
  key: keyof MapFilter;
  label: string;
  Icon: React.FC<{ size?: number; color?: string }>;
};

const CHIPS: Chip[] = [
  { key: 'events', label: 'Veranstaltungen', Icon: CalendarIcon },
  { key: 'restaurants', label: 'Gastronomie', Icon: CutleryIcon },
  { key: 'businesses', label: 'Unternehmen', Icon: MarketsIcon },
  { key: 'pois', label: 'Tipps', Icon: StarIcon },
];

export default function MapFilterChips({
  filter,
  onFilterChange,
  liveBuses,
  onToggleLiveBuses,
  liveBusCount = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const toggleFilter = (key: keyof MapFilter) => {
    onFilterChange({ ...filter, [key]: !filter[key] });
  };

  return (
    <View
      style={[
        styles.container,
        // Position below the safe-area-aware header (header height ~52 + 12 spacing)
        { top: insets.top + 60 },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {CHIPS.map((c) => {
          const isActive = filter[c.key];
          const Icon = c.Icon;
          return (
            <Pressable
              key={c.key}
              style={[
                styles.chip,
                {
                  // Always white background — active state shown by full black icon/text;
                  // inactive uses softer gray.
                  backgroundColor: '#ffffff',
                  opacity: isActive ? 1 : 0.7,
                },
              ]}
              onPress={() => toggleFilter(c.key)}
            >
              <Icon size={16} color={isActive ? '#000000' : '#9CA3AF'} />
              <Text
                style={[
                  styles.chipText,
                  { color: isActive ? '#000000' : '#9CA3AF' },
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
                backgroundColor: '#ffffff',
                marginLeft: 4,
                opacity: liveBuses ? 1 : 0.7,
              },
            ]}
            onPress={onToggleLiveBuses}
          >
            {liveBuses ? (
              <View style={[styles.liveDot, { backgroundColor: '#2BD46B' }]} />
            ) : (
              <BusIcon size={16} color="#9CA3AF" />
            )}
            <Text
              style={[
                styles.chipText,
                { color: liveBuses ? '#000000' : '#9CA3AF' },
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
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
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
