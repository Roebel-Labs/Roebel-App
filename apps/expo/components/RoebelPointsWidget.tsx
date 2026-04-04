import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

interface RoebelPointsWidgetProps {
  balance: number;
  tier: string;
  streak: number;
}

const TIER_LABELS: Record<string, string> = {
  besucher: 'Besucher',
  burger: 'Bürger',
  supporter: 'Supporter',
};

const TIER_COLORS: Record<string, string> = {
  besucher: '#6b7280',
  burger: '#194383',
  supporter: '#7c3aed',
};

export default function RoebelPointsWidget({ balance, tier, streak }: RoebelPointsWidgetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const tierLabel = TIER_LABELS[tier] || tier;
  const tierColor = TIER_COLORS[tier] || colors.primary;

  return (
    <Pressable
      onPress={() => router.push('/wallet' as any)}
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
    >
      <View style={styles.row}>
        <View style={styles.pointsSection}>
          <Text style={[styles.pointsValue, { color: colors.textPrimary }]}>{balance}</Text>
          <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>Röbel Punkte</Text>
        </View>

        <View style={styles.infoSection}>
          <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
            <Text style={styles.tierText}>{tierLabel}</Text>
          </View>
          {streak > 0 && (
            <Text style={[styles.streak, { color: colors.textSecondary }]}>
              🔥 {streak} Tage Streak
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointsSection: {
    gap: 2,
  },
  pointsValue: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
  },
  pointsLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  infoSection: {
    alignItems: 'flex-end',
    gap: 6,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  streak: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
