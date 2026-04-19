import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { DailyCheckin } from '@/lib/supabase-rewards';

interface CheckinStreakStripProps {
  streak: number;
  recentCheckins: DailyCheckin[];
  hasCheckedInToday: boolean;
}

const BASE = 20;
const SINGLE_COIN = require('../../assets/illustration/gamification/single.png');
const STACK_COIN = require('../../assets/illustration/gamification/stack.png');

/**
 * Visualises the user's 7-day streak window centred on "today". Past days show
 * green checks if checked in, future days show the coin amount they'll earn,
 * every 3rd consecutive day renders as the bonus (stack) image with 2× coins.
 */
export default function CheckinStreakStrip({
  streak,
  recentCheckins,
  hasCheckedInToday,
}: CheckinStreakStripProps) {
  const { colors, isDark } = useTheme();

  // Build a 7-column strip: 2 past, today, 4 future.
  const items = useMemo(() => {
    const todayStreak = hasCheckedInToday ? streak : streak + 1;
    const start = Math.max(1, todayStreak - 2);
    return Array.from({ length: 7 }, (_, i) => {
      const streakDay = start + i;
      const isBonus = streakDay % 3 === 0;
      const amount = isBonus ? BASE * 2 : BASE;
      const state: 'past' | 'today' | 'future' =
        streakDay < todayStreak ? 'past' : streakDay === todayStreak ? 'today' : 'future';
      return { streakDay, amount, isBonus, state };
    });
  }, [streak, hasCheckedInToday]);

  const completedDates = useMemo(
    () => new Set(recentCheckins.map((c) => c.streak_day)),
    [recentCheckins]
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.surface : '#F9FAFB', borderColor: colors.border },
      ]}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {hasCheckedInToday
          ? streak > 1
            ? `Du hast ${streak} Tage am Stück eingecheckt`
            : 'Check-in erledigt'
          : streak > 0
            ? `Du hast ${streak} Tage am Stück eingecheckt`
            : 'Starte deine Serie heute'}
      </Text>
      <View style={styles.strip}>
        {items.map((item) => {
          const wasCompleted = completedDates.has(item.streakDay) || item.state === 'past';
          const isToday = item.state === 'today';
          return (
            <View
              key={item.streakDay}
              style={[
                styles.cell,
                isToday && {
                  backgroundColor: isDark ? '#1e3a1e' : '#D1FADF',
                  borderColor: '#16a34a',
                  borderWidth: 2,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayLabel,
                  { color: isToday ? '#16a34a' : colors.textSecondary },
                  isToday && styles.dayLabelToday,
                ]}
              >
                {isToday ? 'Heute' : `Tag ${item.streakDay}`}
              </Text>
              <View style={styles.coinWrap}>
                {wasCompleted ? (
                  <Text style={styles.check}>✓</Text>
                ) : (
                  <Image
                    source={item.isBonus ? STACK_COIN : SINGLE_COIN}
                    style={styles.coinImg}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Text
                style={[
                  styles.amount,
                  { color: wasCompleted ? colors.textTertiary : colors.textPrimary },
                ]}
              >
                {item.amount}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 10,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    marginHorizontal: 4,
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
  },
  dayLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
  },
  dayLabelToday: {
    fontFamily: 'Inter-SemiBold',
  },
  coinWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinImg: {
    width: 34,
    height: 34,
  },
  check: {
    fontSize: 20,
    color: '#16a34a',
    fontFamily: 'Inter-SemiBold',
  },
  amount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
});
