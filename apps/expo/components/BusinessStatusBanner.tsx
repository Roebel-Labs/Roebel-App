import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { BusinessRecord } from '@/lib/types';

const ORG_TYPE_EMOJI: Record<string, string> = {
  gastronomie: '🍽️',
  einzelhandel: '🏪',
  handwerk: '🔧',
  dienstleistung: '💼',
  gesundheit: '🏥',
  bildung: '📚',
  kultur: '🎭',
  sport: '⚽',
  tourismus: '🏖️',
  immobilien: '🏠',
  sonstiges: '🏢',
};

const getStatusColors = (status: string, colors: any) => {
  const configs: Record<string, { label: string; bg: string; text: string }> = {
    pending: { label: 'In Prüfung', bg: colors.warningBackground, text: colors.warning },
    approved: { label: 'Freigegeben', bg: colors.successBackground, text: colors.success },
    rejected: { label: 'Abgelehnt', bg: colors.errorBackground, text: colors.error },
  };
  return configs[status] || configs.pending;
};

type Props = {
  business: BusinessRecord;
  onPress?: () => void;
};

export default function BusinessStatusBanner({ business, onPress }: Props) {
  const { colors } = useTheme();
  const emoji = ORG_TYPE_EMOJI[business.category || ''] || '🏢';
  const status = getStatusColors(business.status, colors);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}
    >
      <View style={styles.leftRow}>
        <View style={[styles.iconBox, { backgroundColor: colors.surface }]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
        <View style={styles.nameCol}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{business.name}</Text>
          <Text style={[styles.category, { color: colors.textSecondary }]}>{business.category || 'Organisation'}</Text>
        </View>
      </View>
      <View style={styles.rightRow}>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeText, { color: status.text }]}>{status.label}</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 18,
  },
  nameCol: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  category: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  chevron: {
    fontSize: 14,
  },
});
