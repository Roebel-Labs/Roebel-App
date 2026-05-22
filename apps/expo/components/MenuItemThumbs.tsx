import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { ThumbsUpIcon, ThumbsUpFilledIcon, ThumbsDownIcon } from '@/components/Icons';
import type { MenuItemVoteSummary } from '@/lib/types';

type Props = {
  summary: MenuItemVoteSummary | null;
  size?: 'sm' | 'md';
  interactive?: boolean;
  userVote?: 1 | -1 | null;
  onVote?: (v: 1 | -1) => void;
};

export default function MenuItemThumbs({
  summary,
  size = 'sm',
  interactive,
  userVote,
  onVote,
}: Props) {
  const { colors } = useTheme();
  const percent = summary?.percent_liked ?? null;
  const count = summary?.vote_count ?? 0;
  const fontSize = size === 'sm' ? 12 : 14;
  const iconSize = size === 'sm' ? 12 : 14;

  if (!interactive) {
    if (percent == null || count === 0) return null;
    return (
      <View style={styles.row}>
        <ThumbsUpIcon size={iconSize} color={colors.textSecondary} />
        <Text style={[styles.text, { color: colors.textSecondary, fontSize }]}>
          {percent}% ({count})
        </Text>
      </View>
    );
  }

  const upActive = userVote === 1;
  const downActive = userVote === -1;
  return (
    <View style={styles.rowGap}>
      <Pressable
        onPress={() => onVote?.(1)}
        accessibilityLabel="Daumen hoch"
        style={[
          styles.pill,
          {
            borderColor: upActive ? colors.success : colors.borderSecondary,
            backgroundColor: upActive ? colors.successBackground : 'transparent',
          },
        ]}
      >
        {upActive ? (
          <ThumbsUpFilledIcon size={18} color={colors.success} />
        ) : (
          <ThumbsUpIcon size={18} color={colors.textSecondary} />
        )}
        {percent != null && count > 0 && (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 13 }}>
            {percent}% ({count})
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => onVote?.(-1)}
        accessibilityLabel="Daumen runter"
        style={[
          styles.pill,
          {
            borderColor: downActive ? colors.error : colors.borderSecondary,
            backgroundColor: downActive ? colors.errorBackground : 'transparent',
          },
        ]}
      >
        <ThumbsDownIcon size={18} color={downActive ? colors.error : colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: 'Inter-Regular' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
