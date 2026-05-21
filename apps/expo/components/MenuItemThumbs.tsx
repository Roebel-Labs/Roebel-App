import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
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

  if (!interactive) {
    if (percent == null || count === 0) return null;
    return (
      <View style={styles.row}>
        <Text style={[styles.thumb, { fontSize }]}>👍</Text>
        <Text style={[styles.text, { color: colors.textSecondary, fontSize }]}>
          {percent}% ({count})
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.rowGap}>
      <Pressable
        onPress={() => onVote?.(1)}
        style={[
          styles.pill,
          { borderColor: userVote === 1 ? colors.success : colors.borderSecondary, backgroundColor: userVote === 1 ? colors.successBackground : 'transparent' },
        ]}
      >
        <Text style={{ fontSize: 18 }}>👍</Text>
        {percent != null && count > 0 && (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 13 }}>
            {percent}% ({count})
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => onVote?.(-1)}
        style={[
          styles.pill,
          { borderColor: userVote === -1 ? colors.error : colors.borderSecondary, backgroundColor: userVote === -1 ? colors.errorBackground : 'transparent' },
        ]}
      >
        <Text style={{ fontSize: 18 }}>👎</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: {},
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
