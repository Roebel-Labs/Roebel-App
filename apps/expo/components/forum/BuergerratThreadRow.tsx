import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { STAGE_LABELS } from '@/lib/forum-stages';
import CommentIcon from '@/assets/icons/comment-02.svg';
import type { ForumThreadRecord } from '@/lib/types/feed';

type Props = { thread: ForumThreadRecord };

/** One recommendation in the ranked Bürgerrat list: rank, title, Punkte, stage, replies. */
export default function BuergerratThreadRow({ thread }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/forum/thread/${thread.id}` as any)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.borderTertiary },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.rank, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.rankText, { color: colors.primary }]}>{thread.source_rank ?? '·'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {thread.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {thread.source_score ?? 0} Punkte
          </Text>
          {thread.stage ? (
            <View style={[styles.stageChip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.stageText, { color: colors.textSecondary }]}>
                {STAGE_LABELS[thread.stage]}
              </Text>
            </View>
          ) : null}
          <View style={styles.replies}>
            <CommentIcon width={14} height={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{thread.reply_count}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontFamily: fontFamily.bold },
  body: { flex: 1, gap: 6 },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  metaText: { fontSize: 12, fontFamily: fontFamily.regular },
  stageChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  stageText: { fontSize: 11, fontFamily: fontFamily.medium },
  replies: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
