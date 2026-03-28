import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO, addMonths, isBefore, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { generateRecurringDates, sortDates } from '@/lib/utils';
import type { RecurrencePattern } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  selectedDates: string[];
  onDatesChange: (dates: string[]) => void;
  minDate?: string;
};

export default function MultiDatePicker({ selectedDates, onDatesChange, minDate }: Props) {
  const { colors } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<RecurrencePattern | null>(null);

  const today = startOfDay(new Date());
  const minDateParsed = minDate ? parseISO(minDate) : today;

  // Convert selected dates to a Set for O(1) lookup
  const selectedDatesSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  // Calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Padding days to start from Monday
  const startDayOfWeek = monthStart.getDay();
  const paddingDays = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
  const paddingDaysArray = Array.from({ length: paddingDays }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(date.getDate() - (paddingDays - i));
    return date;
  });

  const allDays = [...paddingDaysArray, ...calendarDays];

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const handleDatePress = (date: Date) => {
    if (!isSameMonth(date, currentDate)) return;
    if (isBefore(date, minDateParsed)) return;

    const dateKey = format(date, 'yyyy-MM-dd');

    if (selectedDatesSet.has(dateKey)) {
      // Remove date
      onDatesChange(selectedDates.filter(d => d !== dateKey));
    } else {
      // Add date
      onDatesChange(sortDates([...selectedDates, dateKey]));
    }
  };

  const applyPattern = (pattern: RecurrencePattern) => {
    if (selectedDates.length === 0) {
      // If no date selected, use today as start
      const startDate = format(today, 'yyyy-MM-dd');
      const endDate = format(addMonths(today, 3), 'yyyy-MM-dd');
      const newDates = generateRecurringDates(startDate, pattern, endDate);
      onDatesChange(newDates);
    } else {
      // Use first selected date as start
      const startDate = selectedDates[0];
      const endDate = format(addMonths(parseISO(startDate), 3), 'yyyy-MM-dd');
      const newDates = generateRecurringDates(startDate, pattern, endDate);
      onDatesChange(newDates);
    }
    setShowPatternModal(false);
  };

  const clearAllDates = () => {
    onDatesChange([]);
  };

  const renderDay = (date: Date, index: number) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const isSelected = selectedDatesSet.has(dateKey);
    const isCurrentMonth = isSameMonth(date, currentDate);
    const isTodayDate = isToday(date);
    const isDisabled = isBefore(date, minDateParsed);

    return (
      <Pressable
        key={index}
        style={{ width: `${100/7}%`, aspectRatio: 1, padding: 2 }}
        onPress={() => handleDatePress(date)}
        disabled={!isCurrentMonth || isDisabled}
      >
        <View style={[
          { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
          isTodayDate && { backgroundColor: colors.borderSecondary },
          isSelected && { backgroundColor: colors.primary },
          isDisabled && { opacity: 0.4 },
        ]}>
          <Text style={[
            { fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary },
            !isCurrentMonth && { color: colors.disabled },
            isTodayDate && !isSelected && { color: colors.textPrimary },
            isSelected && { color: colors.textInverted },
            isDisabled && { color: colors.textTertiary },
          ]}>
            {format(date, 'd')}
          </Text>
        </View>
      </Pressable>
    );
  };

  const patternButtons: { label: string; pattern: RecurrencePattern }[] = [
    { label: 'Wöchentlich', pattern: 'weekly' },
    { label: 'Zweiwöchentlich', pattern: 'biweekly' },
    { label: 'Monatlich', pattern: 'monthly' },
    { label: 'Jährlich', pattern: 'yearly' },
  ];

  return (
    <View style={styles.wrapper}>
      {/* Pattern Helpers */}
      <View style={styles.patternSection}>
        <Text style={[styles.patternLabel, { color: colors.tabIconActive }]}>Wiederholungsmuster:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.patternScroll}>
          {patternButtons.map(({ label, pattern }) => (
            <Pressable
              key={pattern}
              style={styles.patternButton}
              onPress={() => applyPattern(pattern)}
            >
              <Text style={styles.patternButtonText}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={[styles.patternHint, { color: colors.textTertiary }]}>
          Wähle ein Muster oder tippe auf einzelne Tage
        </Text>
      </View>

      {/* Calendar */}
      <View style={[styles.calendar, { backgroundColor: colors.surface }]}>
        {/* Month navigation */}
        <View style={styles.monthNav}>
          <Pressable onPress={() => navigateMonth('prev')} style={[styles.navButton, { backgroundColor: colors.background }]}>
            <ChevronLeft size={20} color={colors.tabIconActive} />
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
            {format(currentDate, 'MMMM yyyy', { locale: de })}
          </Text>
          <Pressable onPress={() => navigateMonth('next')} style={[styles.navButton, { backgroundColor: colors.background }]}>
            <ChevronRight size={20} color={colors.tabIconActive} />
          </Pressable>
        </View>

        {/* Weekday headers */}
        <View style={styles.weekdayRow}>
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
            <View key={day} style={styles.weekdayCell}>
              <Text style={[styles.weekdayText, { color: colors.textTertiary }]}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.calendarGrid}>
          {allDays.map((date, index) => renderDay(date, index))}
        </View>
      </View>

      {/* Selected Dates Summary */}
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryText, { color: colors.tabIconActive }]}>
          {selectedDates.length === 0
            ? 'Keine Termine ausgewählt'
            : selectedDates.length === 1
            ? '1 Termin ausgewählt'
            : `${selectedDates.length} Termine ausgewählt`}
        </Text>
        {selectedDates.length > 0 && (
          <Pressable onPress={clearAllDates}>
            <Text style={[styles.clearText, { color: colors.error }]}>Alle entfernen</Text>
          </Pressable>
        )}
      </View>

      {/* Selected Dates Chips */}
      {selectedDates.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {selectedDates.slice(0, 8).map(date => (
            <View key={date} style={[styles.chip, { backgroundColor: colors.primary }]}>
              <Text style={[styles.chipText, { color: colors.textInverted }]}>
                {format(parseISO(date), 'dd.MM.yy', { locale: de })}
              </Text>
              <Pressable
                onPress={() => onDatesChange(selectedDates.filter(d => d !== date))}
                hitSlop={8}
              >
                <Text style={[styles.chipClose, { color: colors.textInverted }]}>×</Text>
              </Pressable>
            </View>
          ))}
          {selectedDates.length > 8 && (
            <View style={[styles.chipOverflow, { backgroundColor: colors.textSecondary }]}>
              <Text style={[styles.chipText, { color: colors.textInverted }]}>+{selectedDates.length - 8}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 8,
  },
  patternSection: {
    marginBottom: 16,
  },
  patternLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  patternScroll: {
    marginBottom: 4,
  },
  patternButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  patternButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#0c4a6e',
  },
  patternHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
  },
  calendar: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
    borderRadius: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    textTransform: 'capitalize',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  clearText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  chipsScroll: {
    marginTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  chipClose: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginLeft: 2,
  },
  chipOverflow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
});
