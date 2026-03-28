import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { BusinessDealRecord } from '@/lib/types';

type Props = {
  deal: BusinessDealRecord;
  onPress?: () => void;
};

const DEAL_TYPE_LABELS: Record<string, string> = {
  discount: 'Rabatt',
  special: 'Spezial',
  event: 'Event',
  new_product: 'Neu',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  paused: 'Pausiert',
  expired: 'Abgelaufen',
};

export default function DealCard({ deal, onPress }: Props) {
  const { colors, isDark } = useTheme();

  const statusColor = deal.status === 'active'
    ? (isDark ? '#6EE7B7' : '#065F46')
    : deal.status === 'draft'
    ? (isDark ? '#9CA3AF' : '#4B5563')
    : deal.status === 'paused'
    ? (isDark ? '#FCD34D' : '#92400E')
    : (isDark ? '#FCA5A5' : '#991B1B');

  return (
    <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={onPress}>
      {deal.image_url && (
        <Image source={{ uri: deal.image_url }} style={styles.image} />
      )}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={[styles.typeBadge, { backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE' }]}>
            <Text style={[styles.typeBadgeText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
              {DEAL_TYPE_LABELS[deal.deal_type] || deal.deal_type}
            </Text>
          </View>
          {deal.is_boosted && (
            <View style={[styles.boostBadge, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
              <Text style={[styles.boostBadgeText, { color: isDark ? '#FCD34D' : '#92400E' }]}>Hervorgehoben</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{deal.title}</Text>

        {deal.deal_value && (
          <Text style={[styles.value, { color: colors.primary }]}>{deal.deal_value}</Text>
        )}

        <View style={styles.bottomRow}>
          <Text style={[styles.status, { color: statusColor }]}>
            {STATUS_LABELS[deal.status] || deal.status}
          </Text>
          <View style={styles.stats}>
            <Text style={[styles.statText, { color: colors.textTertiary }]}>{deal.views_count} Aufrufe</Text>
            <Text style={[styles.statText, { color: colors.textTertiary }]}>{deal.clicks_count} Klicks</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 140,
  },
  content: {
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  boostBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  boostBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  value: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  status: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
  },
  statText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
