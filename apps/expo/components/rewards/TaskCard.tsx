import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { RewardTask } from '@/lib/supabase-rewards';

interface TaskCardProps {
  task: RewardTask;
  completed?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

const COIN_ICON = require('../../assets/illustration/gamification/single.png');

export default function TaskCard({ task, completed, disabled, onPress }: TaskCardProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.thumb,
          { backgroundColor: isDark ? colors.surfaceSecondary : '#F3F4F6' },
        ]}
      >
        {task.image_url ? (
          <Image source={{ uri: task.image_url }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <Text style={styles.thumbEmoji}>🎯</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {task.description}
        </Text>
        <View style={styles.footer}>
          <View style={styles.coinRow}>
            <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
            <Text style={[styles.coinAmount, { color: colors.textPrimary }]}>
              {task.coin_amount}
            </Text>
          </View>
          <Pressable
            onPress={onPress}
            disabled={disabled || completed}
            style={({ pressed }) => [
              styles.cta,
              {
                borderColor: completed ? '#16a34a' : '#E02424',
                backgroundColor: pressed ? (completed ? '#E8F5E9' : '#FEE2E2') : 'transparent',
                opacity: disabled ? 0.4 : 1,
              },
            ]}
          >
            <Text style={[styles.ctaText, { color: completed ? '#16a34a' : '#E02424' }]}>
              {completed ? 'Fertig ✓' : task.cta_label}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbEmoji: {
    fontSize: 30,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  description: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coinIcon: {
    width: 20,
    height: 20,
  },
  coinAmount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  cta: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
});
