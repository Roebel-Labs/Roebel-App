import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';
import type { DailyCheckin } from '@/lib/supabase-rewards';

interface CheckinStreakStripProps {
  streak: number;
  recentCheckins: DailyCheckin[];
  hasCheckedInToday: boolean;
}

// One full day of personal mint = ~24 Röbel Münzen (1 per hour), so every day
// in the streak is worth 24.
const DAILY_AMOUNT = 24;
const STACK_COIN = require('../../assets/illustration/gamification/stack.png');

/**
 * Visualises the user's 7-day Röbel Münzen streak window centred on "today".
 * Past days show a check mark if collected; today is highlighted in primary;
 * every day is worth 24 and uses the stack-coin illustration.
 */
export default function CheckinStreakStrip({
  streak,
  recentCheckins,
  hasCheckedInToday,
}: CheckinStreakStripProps) {
  const { colors, isDark } = useTheme();
  const primary = colors.primary;

  const items = useMemo(() => {
    const todayStreak = hasCheckedInToday ? streak : streak + 1;
    const start = Math.max(1, todayStreak - 2);
    return Array.from({ length: 7 }, (_, i) => {
      const streakDay = start + i;
      const state: 'past' | 'today' | 'future' =
        streakDay < todayStreak ? 'past' : streakDay === todayStreak ? 'today' : 'future';
      return { streakDay, amount: DAILY_AMOUNT, state };
    });
  }, [streak, hasCheckedInToday]);

  const completedDays = useMemo(
    () => new Set(recentCheckins.map((c) => c.streak_day)),
    [recentCheckins]
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.surface : '#FFFFFF' },
        softShadow(2, isDark),
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
          const wasCompleted = completedDays.has(item.streakDay) || item.state === 'past';
          const isToday = item.state === 'today';
          return (
            <View
              key={item.streakDay}
              style={[
                styles.cell,
                isToday && {
                  backgroundColor: isDark ? '#22324c' : '#EEF4FB',
                  borderColor: primary,
                  borderWidth: 2,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayLabel,
                  { color: isToday ? primary : colors.textSecondary },
                  isToday && styles.dayLabelToday,
                ]}
              >
                {isToday ? 'Heute' : `Tag ${item.streakDay}`}
              </Text>
              <View style={styles.coinWrap}>
                {wasCompleted ? (
                  <Text style={[styles.check, { color: primary }]}>✓</Text>
                ) : (
                  <Image source={STACK_COIN} style={styles.coinImg} resizeMode="contain" />
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
    fontFamily: 'Inter-SemiBold',
  },
  amount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
});
