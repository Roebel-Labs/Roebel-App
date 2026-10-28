import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

type Props = {
  /** Selected day as yyyy-MM-dd. */
  selectedDate: string;
  onSelectDate: (dateISO: string) => void;
  /** Days (yyyy-MM-dd) that carry a dot — the days with listed events. */
  markedDates: Set<string>;
};

/**
 * Month grid at the top of the events page. Monday-first, padding days from
 * the neighbouring months are shown dimmed and are not selectable.
 */
export default function EventMonthCalendar({ selectedDate, onSelectDate, markedDates }: Props) {
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // Integer cell size so 7 columns never overflow and wrap (percentage widths
  // round to > 100% on some devices, pushing Sunday to the next row).
  const [gridAreaWidth, setGridAreaWidth] = useState(0);
  const daySize = Math.floor(gridAreaWidth / 7);
  const gridWidth = daySize * 7;

  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
  const weekday = monthStart.getDay();
  const paddingCount = weekday === 0 ? 6 : weekday - 1;
  const padding = Array.from({ length: paddingCount }, (_, i) => {
    const d = new Date(monthStart);
    d.setDate(d.getDate() - (paddingCount - i));
    return d;
  });

  return (
    <View style={styles.container} onLayout={(e) => setGridAreaWidth(e.nativeEvent.layout.width)}>
      <View style={styles.monthHeader}>
        <Pressable
          onPress={() => setMonth((m) => addMonths(m, -1))}
          style={({ pressed }) => [
            styles.navButton,
            { backgroundColor: colors.surfaceSecondary },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Vorheriger Monat"
          hitSlop={6}
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
          {format(month, 'MMMM yyyy', { locale: de })}
        </Text>
        <Pressable
          onPress={() => setMonth((m) => addMonths(m, 1))}
          style={({ pressed }) => [
            styles.navButton,
            { backgroundColor: colors.surfaceSecondary },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Nächster Monat"
          hitSlop={6}
        >
          <ChevronRight size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {daySize > 0 && (
        <>
          <View style={[styles.row, { width: gridWidth }]}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={[styles.weekday, { width: daySize }]}>
                <Text style={[styles.weekdayText, { color: colors.textTertiary }]}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.grid, { width: gridWidth }]}>
            {[...padding, ...days].map((date) => {
              const iso = format(date, 'yyyy-MM-dd');
              const inMonth = isSameMonth(date, month);
              const selected = inMonth && iso === selectedDate;
              const today = isToday(date);
              return (
                <Pressable
                  key={iso}
                  disabled={!inMonth}
                  onPress={() => onSelectDate(iso)}
                  style={[styles.dayCell, { width: daySize, height: daySize }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={format(date, 'EEEE, d. MMMM', { locale: de })}
                >
                  <View
                    style={[
                      styles.dayInner,
                      selected && { backgroundColor: colors.surfaceSecondary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        { color: inMonth ? colors.textPrimary : colors.disabled },
                        (selected || today) && styles.dayTextStrong,
                      ]}
                    >
                      {format(date, 'd')}
                    </Text>
                    {inMonth && markedDates.has(iso) && (
                      <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  monthTitle: {
    fontSize: 18,
    fontFamily: fontFamily.medium,
    textTransform: 'capitalize',
  },
  row: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginBottom: 4,
  },
  weekday: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
  },
  dayCell: {
    padding: 3,
  },
  dayInner: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
  },
  dayTextStrong: {
    fontFamily: fontFamily.semiBold,
  },
  dot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
