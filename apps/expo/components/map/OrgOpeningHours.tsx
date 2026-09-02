/**
 * The "geöffnet 7–18 Uhr ⌄" line in the org sheet, expanding to the full week.
 *
 * Collapsed it answers the only question most people have — can I go now.
 * Expanded it shows every day, with today emphasised so the eye lands on the
 * row that matters.
 */
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { isRestaurantOpen } from '@/lib/utils';
import type { OpeningHours } from '@/lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const WEEKDAYS: { key: keyof OpeningHours & string; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

// JS getDay() is Sunday-first; WEEKDAYS is Monday-first.
const WEEKDAY_ORDER: (keyof OpeningHours & string)[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function formatDay(day: OpeningHours[keyof OpeningHours] | undefined): string {
  if (!day || day.closed) return 'Geschlossen';
  return `${day.open} – ${day.close}`;
}

export default function OrgOpeningHours({ hours }: { hours: OpeningHours | null }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (!hours) return null;

  const status = isRestaurantOpen(hours);
  const todayKey = WEEKDAY_ORDER[new Date().getDay()];
  const today = hours[todayKey];

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded ? 'Öffnungszeiten einklappen' : 'Alle Öffnungszeiten anzeigen'
        }
        style={styles.summaryRow}
        hitSlop={8}
      >
        <Text
          style={[
            styles.status,
            { color: status.isOpen ? colors.success : colors.textTertiary },
          ]}
        >
          {status.isOpen ? 'geöffnet' : 'geschlossen'}
        </Text>
        <Text style={[styles.summaryHours, { color: colors.textPrimary }]}>
          {formatDay(today)}
        </Text>
        <Text style={[styles.chevron, { color: colors.textTertiary }]}>
          {expanded ? '⌃' : '⌄'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.week}>
          {WEEKDAYS.map(({ key, label }) => {
            const isToday = key === todayKey;
            return (
              <View key={key} style={styles.dayRow}>
                <Text
                  style={[
                    isToday ? styles.dayLabelToday : styles.dayLabel,
                    { color: isToday ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    isToday ? styles.dayValueToday : styles.dayValue,
                    { color: isToday ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  {formatDay(hours[key])}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  status: { fontFamily: fontFamily.medium, fontSize: 16 },
  summaryHours: { fontFamily: fontFamily.regular, fontSize: 16 },
  chevron: { fontSize: 16, marginTop: -2 },
  week: { paddingTop: 4, paddingBottom: 8, gap: 6, paddingHorizontal: 16 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { fontFamily: fontFamily.regular, fontSize: 15 },
  dayLabelToday: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  dayValue: { fontFamily: fontFamily.regular, fontSize: 15 },
  dayValueToday: { fontFamily: fontFamily.semiBold, fontSize: 15 },
});
