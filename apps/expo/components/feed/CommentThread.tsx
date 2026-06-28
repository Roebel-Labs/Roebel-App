import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import CommentItem from '@/components/feed/CommentItem';
import type { PostCommentRecord } from '@/lib/types/feed';

type Props = {
  comment: PostCommentRecord;
  viewerWallet?: string;
  expanded: boolean;
  loadingReplies: boolean;
  onToggleReplies: (comment: PostCommentRecord) => void;
  onReply: (comment: PostCommentRecord) => void;
  onEdit: (comment: PostCommentRecord) => void;
  onDelete: (comment: PostCommentRecord) => void;
  onToggleLike: (comment: PostCommentRecord) => void;
};

export default function CommentThread({
  comment,
  viewerWallet,
  expanded,
  loadingReplies,
  onToggleReplies,
  onReply,
  onEdit,
  onDelete,
  onToggleLike,
}: Props) {
  const { colors } = useTheme();

  const isOwner = (c: PostCommentRecord) =>
    !!viewerWallet && c.wallet_address?.toLowerCase() === viewerWallet.toLowerCase();

  const replies = comment.replies ?? [];
  const replyCount = comment.reply_count ?? 0;

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.border }]}>
      <CommentItem
        comment={comment}
        isOwner={isOwner(comment)}
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onToggleLike={onToggleLike}
      />

      {replyCount > 0 && (
        <Pressable
          onPress={() => onToggleReplies(comment)}
          style={styles.expander}
          hitSlop={8}
          accessibilityRole="button"
        >
          <View style={[styles.connector, { backgroundColor: colors.border }]} />
          <Text style={[styles.expanderText, { color: colors.textSecondary }]}>
            {expanded
              ? 'Antworten ausblenden'
              : `Antworten anzeigen (${replyCount})`}
          </Text>
        </Pressable>
      )}

      {expanded && loadingReplies && replies.length === 0 && (
        <ActivityIndicator style={styles.loader} size="small" color={colors.primary} />
      )}

      {expanded &&
        replies.map((reply) => (
          <CommentItem
            key={reply.id}
            comment={reply}
            isReply
            isOwner={isOwner(reply)}
            onEdit={onEdit}
            onDelete={onDelete}
            onReply={onReply}
            onToggleLike={onToggleLike}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  expander: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 58,
    paddingVertical: 6,
  },
  connector: {
    width: 24,
    height: StyleSheet.hairlineWidth,
  },
  expanderText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  loader: {
    paddingVertical: 8,
    paddingLeft: 58,
    alignSelf: 'flex-start',
  },
});
