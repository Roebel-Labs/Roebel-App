/**
 * The one-line status next to a place's category: open/closed for anything
 * with opening hours, the date for an event, the water status for a swim spot.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CalendarIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { isRestaurantOpen } from '@/lib/utils';
import { SWIM_STATUS_COLORS, SWIM_STATUS_LABELS_DE } from '@/lib/supabase-pois';
import type { PlaceItem } from '@/lib/map/place-item';

export function formatEventDate(date: string, time: string | null): string {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return time ? `${day} · ${time.slice(0, 5)} Uhr` : day;
}

export default function PlaceStatusBadge({ item }: { item: PlaceItem }) {
  const { colors } = useTheme();

  if (
    item.entityType === 'restaurant' ||
    item.entityType === 'business' ||
    item.entityType === 'org'
  ) {
    if (!item.data.opening_hours) return null;
    const status = isRestaurantOpen(item.data.opening_hours);
    const color = status.isOpen ? '#2B9348' : '#D32F2F';
    return (
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.text, { color }]}>{status.isOpen ? 'Geöffnet' : 'Geschlossen'}</Text>
      </View>
    );
  }

  if (item.entityType === 'event' && item.data.date) {
    return (
      <View style={styles.row}>
        <CalendarIcon width={12} height={12} color={colors.textSecondary} />
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {formatEventDate(item.data.date, item.data.time)}
        </Text>
      </View>
    );
  }

  if (item.entityType === 'poi') {
    const p = item.data;
    const isSwim = p.type === 'swim_spot' && p.status?.startsWith('swim_');
    if (isSwim && SWIM_STATUS_COLORS[p.status as string]) {
      const c = SWIM_STATUS_COLORS[p.status as string];
      return (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: c }]} />
          <Text style={[styles.text, { color: c }]}>{SWIM_STATUS_LABELS_DE[p.status as string]}</Text>
        </View>
      );
    }
  }

  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontFamily: fontFamily.medium },
});
