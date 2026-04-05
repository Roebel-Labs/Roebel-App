import React from 'react';
import { View, Text, Pressable } from 'react-native';
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

const STATUS_CONFIG: Record<string, { label: string; bgClass: string; textClass: string }> = {
  pending: { label: 'In Prüfung', bgClass: 'bg-amber-50 dark:bg-amber-950', textClass: 'text-amber-700 dark:text-amber-300' },
  approved: { label: 'Freigegeben', bgClass: 'bg-green-50 dark:bg-green-950', textClass: 'text-green-700 dark:text-green-300' },
  rejected: { label: 'Abgelehnt', bgClass: 'bg-red-50 dark:bg-red-950', textClass: 'text-red-700 dark:text-red-300' },
};

type Props = {
  business: BusinessRecord;
  onPress?: () => void;
};

export default function BusinessStatusBanner({ business, onPress }: Props) {
  const emoji = ORG_TYPE_EMOJI[business.category || ''] || '🏢';
  const status = STATUS_CONFIG[business.status] || STATUS_CONFIG.pending;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between border border-border rounded-2xl p-4 mx-4 mb-4"
    >
      <View className="flex-row items-center gap-3 flex-1">
        <View className="w-11 h-11 rounded-xl bg-surface items-center justify-center">
          <Text className="text-xl">{emoji}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-inter-semibold text-text-primary" numberOfLines={1}>{business.name}</Text>
          <Text className="text-xs font-inter-regular text-text-secondary">{business.category || 'Organisation'}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <View className={`px-2.5 py-1 rounded-full ${status.bgClass}`}>
          <Text className={`text-xs font-inter-medium ${status.textClass}`}>{status.label}</Text>
        </View>
        <Text className="text-text-tertiary text-base">›</Text>
      </View>
    </Pressable>
  );
}
