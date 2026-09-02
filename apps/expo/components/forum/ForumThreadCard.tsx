import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import DebateStrip from '@/components/forum/DebateStrip';
import ForumVoteCluster from '@/components/forum/ForumVoteCluster';
import { shareForumThread } from '@/lib/forum-share';
import CommentIcon from '@/assets/icons/comment-02.svg';
import ShareIcon from '@/assets/icons/share-02.svg';
import type { ForumThreadRecord } from '@/lib/types/feed';

type Props = {
  thread: ForumThreadRecord;
  myVote?: 1 | -1 | null;
  onVoted?: (next: 1 | -1 | null) => void;
};

export default function ForumThreadCard({ thread, myVote, onVoted }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/forum/thread/${thread.id}` as any)}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.primary }]}>DISKUSSION</Text>
        <View style={styles.headerRight}>
          {thread.category?.name ? (
            <View style={[styles.categoryChip, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>{thread.category.name}</Text>
            </View>
          ) : null}
          {thread.edited_at ? (
            <Text style={[styles.editedText, { color: colors.textTertiary }]}>Bearbeitet</Text>
          ) : null}
        </View>
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {thread.title}
      </Text>
      {thread.body ? (
        <Text style={[styles.snippet, { color: colors.textSecondary }]} numberOfLines={2}>
          {thread.body}
        </Text>
      ) : null}

      {thread.debate_id != null ? <DebateStrip debateId={thread.debate_id} /> : null}

      <PostAuthorRow author={thread.author} createdAt={thread.created_at} />

      <View style={styles.actions}>
        <ForumVoteCluster
          targetType="thread"
          targetId={thread.id}
          upvotes={thread.upvotes_count ?? 0}
          downvotes={thread.downvotes_count ?? 0}
          myVote={myVote ?? null}
          onVoted={onVoted}
          compact
        />
        <View style={styles.actionItem}>
          <CommentIcon width={18} height={18} color={colors.textSecondary} />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>{thread.reply_count}</Text>
        </View>
        <Pressable
          onPress={() => void shareForumThread(thread.title, thread.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Teilen"
        >
          <ShareIcon width={18} height={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 0.6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },
  editedText: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
  },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    lineHeight: 22,
  },
  snippet: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    lineHeight: 18,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 2 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 12, fontFamily: fontFamily.regular },
});
