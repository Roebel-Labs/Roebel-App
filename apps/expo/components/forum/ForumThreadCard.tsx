import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import type { ForumThreadRecord } from '@/lib/types/feed';

type Props = {
  thread: ForumThreadRecord;
};

export default function ForumThreadCard({ thread }: Props) {
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
        {thread.category?.name ? (
          <View style={[styles.categoryChip, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.categoryText, { color: colors.primary }]}>{thread.category.name}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {thread.title}
      </Text>
      {thread.body ? (
        <Text style={[styles.snippet, { color: colors.textSecondary }]} numberOfLines={2}>
          {thread.body}
        </Text>
      ) : null}

      <PostAuthorRow author={thread.author} createdAt={thread.created_at} />

      <Text style={[styles.replies, { color: colors.textSecondary }]}>
        {thread.reply_count === 1 ? '1 Antwort' : `${thread.reply_count} Antworten`}
      </Text>
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
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
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
  replies: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
  },
});
