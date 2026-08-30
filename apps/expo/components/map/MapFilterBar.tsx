import React from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MapFilterState } from '@/lib/map/filters';

type Props = {
  filter: MapFilterState;
  onFilterChange: (filter: MapFilterState) => void;
  liveBuses?: boolean;
  onToggleLiveBuses?: () => void;
  liveBusCount?: number;
  // Absolute offset from the screen bottom (sits above the action row)
  bottom: number;
  opacity?: Animated.Value;
};

type LayerChip = {
  key: 'events' | 'restaurants' | 'businesses' | 'pois';
  label: string;
  emoji: string;
};

const CHIPS: LayerChip[] = [
  { key: 'events', label: 'Events', emoji: '🎪' },
  { key: 'restaurants', label: 'Gastro', emoji: '🍽️' },
  { key: 'businesses', label: 'Shops', emoji: '🛍️' },
  { key: 'pois', label: 'Tipps', emoji: '⭐' },
];

export default function MapFilterBar({
  filter,
  onFilterChange,
  liveBuses,
  onToggleLiveBuses,
  liveBusCount = 0,
  bottom,
  opacity,
}: Props) {
  const { colors } = useTheme();

  const toggle = (key: LayerChip['key'] | 'openNow') => {
    onFilterChange({ ...filter, [key]: !filter[key] });
  };

  const chipStyle = (active: boolean) => [
    styles.chip,
    {
      backgroundColor: colors.card,
      borderColor: active ? colors.textPrimary : colors.border,
      opacity: active ? 1 : 0.62,
    },
  ];
  const chipTextStyle = (active: boolean) => [
    styles.chipText,
    { color: active ? colors.textPrimary : colors.textTertiary },
  ];

  return (
    <Animated.View
      style={[styles.container, { bottom }, opacity ? { opacity } : null]}
      pointerEvents="box-none"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {/* Jetzt geöffnet — leading toggle, Corner's "open now" */}
        <Pressable style={chipStyle(filter.openNow)} onPress={() => toggle('openNow')}>
          <Text style={styles.chipEmoji}>🕐</Text>
          <Text style={chipTextStyle(filter.openNow)}>Jetzt geöffnet</Text>
        </Pressable>

        {CHIPS.map((c) => {
          const active = filter[c.key];
          return (
            <Pressable key={c.key} style={chipStyle(active)} onPress={() => toggle(c.key)}>
              <Text style={styles.chipEmoji}>{c.emoji}</Text>
              <Text style={chipTextStyle(active)}>{c.label}</Text>
            </Pressable>
          );
        })}

        {onToggleLiveBuses ? (
          <Pressable style={chipStyle(!!liveBuses)} onPress={onToggleLiveBuses}>
            {liveBuses ? (
              <View style={[styles.liveDot, { backgroundColor: '#2BD46B' }]} />
            ) : (
              <Text style={styles.chipEmoji}>🚌</Text>
            )}
            <Text style={chipTextStyle(!!liveBuses)}>
              ÖPNV{liveBuses && liveBusCount > 0 ? ` · ${liveBusCount}` : ''}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 150,
  },
  row: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
});
