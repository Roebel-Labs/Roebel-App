import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { parseIsoDay, toIsoDay } from '@/lib/vacation-rentals';

type Props = {
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MAX_MONTHS_AHEAD = 18;

/**
 * One-month range picker: first tap sets the arrival, the second (later) tap
 * the departure; tapping again starts over. Past days are disabled.
 */
export default function StayRangeCalendar({ checkIn, checkOut, onChange }: Props) {
  const { colors } = useTheme();
  const today = toIsoDay(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d++) out.push(toIsoDay(new Date(month.getFullYear(), month.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const now = new Date();
  const monthsAhead = (month.getFullYear() - now.getFullYear()) * 12 + month.getMonth() - now.getMonth();
  const canPrev = monthsAhead > 0;
  const canNext = monthsAhead < MAX_MONTHS_AHEAD;

  const pick = (day: string) => {
    if (!checkIn || checkOut || day <= checkIn) onChange(day, null);
    else onChange(checkIn, day);
  };

  const shift = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          onPress={() => canPrev && shift(-1)}
          style={[styles.navBtn, !canPrev && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Vorheriger Monat"
          disabled={!canPrev}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
          {month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          onPress={() => canNext && shift(1)}
          style={[styles.navBtn, !canNext && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Nächster Monat"
          disabled={!canNext}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[styles.weekday, { color: colors.textTertiary }]}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.cell} />;
          const past = day < today;
          const isEdge = day === checkIn || day === checkOut;
          const inRange = !!checkIn && !!checkOut && day > checkIn && day < checkOut;
          return (
            <View
              key={day}
              style={[
                styles.cell,
                inRange && { backgroundColor: colors.surfaceSecondary },
                day === checkIn && checkOut && styles.rangeStart,
                day === checkOut && styles.rangeEnd,
                (day === checkIn && checkOut) || day === checkOut ? { backgroundColor: colors.surfaceSecondary } : null,
              ]}
            >
              <Pressable
                onPress={() => pick(day)}
                disabled={past}
                style={[styles.dayBtn, isEdge && { backgroundColor: colors.textPrimary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: isEdge, disabled: past }}
                accessibilityLabel={parseIsoDay(day).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: isEdge ? colors.background : past ? colors.textTertiary : colors.textPrimary },
                    past && styles.pastText,
                  ]}
                >
                  {Number(day.slice(8, 10))}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  monthLabel: { fontSize: 16, fontFamily: fontFamily.semiBold },
  row: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontFamily: fontFamily.medium, paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  rangeStart: { borderTopLeftRadius: 22, borderBottomLeftRadius: 22 },
  rangeEnd: { borderTopRightRadius: 22, borderBottomRightRadius: 22 },
  dayBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15, fontFamily: fontFamily.medium },
  pastText: { textDecorationLine: 'line-through' },
});
