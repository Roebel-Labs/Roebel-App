import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatRelativeTimestamp } from '@/lib/utils';
import { openAuthorProfile, canOpenProfile } from '@/lib/profile-navigation';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import VerifiedBadge from '@/components/VerifiedBadge';
import ForumVoteCluster from '@/components/forum/ForumVoteCluster';
import ForumReplyAttachments from '@/components/forum/ForumReplyAttachments';
import { replyDisplayName, type ReplyMention } from '@/lib/forum-replies';
import ReplyIcon from '@/assets/icons/reply.svg';
import type { ForumAttachmentRecord, ForumReplyRecord } from '@/lib/types/feed';

type Props = {
  reply: ForumReplyRecord;
  /** Compact, inset rendering under a top-level reply. */
  isChild?: boolean;
  /** The reply's author is the thread author → "Autor" badge. */
  isThreadAuthor: boolean;
  /** "@Name" prefix for a targeted reply; null for none. */
  mention: ReplyMention | null;
  myVote: 1 | -1 | null;
  onVoted: (next: 1 | -1 | null) => void;
  onReply: (reply: ForumReplyRecord) => void;
  onOptions: (reply: ForumReplyRecord) => void;
  attachments?: ForumAttachmentRecord[];
  onOpenImage?: (url: string) => void;
};

/**
 * One reply row in the Facebook-group idiom: avatar rail, name + badges,
 * body with an optional @-mention, "Antworten" and the vote cluster.
 * Long-press (or the "…" button) opens the options sheet.
 */
export default function ForumReplyItem({
  reply,
  isChild = false,
  isThreadAuthor,
  mention,
  myVote,
  onVoted,
  onReply,
  onOptions,
  attachments = [],
  onOpenImage,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const author = reply.author;
  const isOrg = author?.account?.account_type === 'organisation';
  const isAgent = reply.author_kind === 'agent';
  const displayName = replyDisplayName(reply);
  const avatarUri = isOrg ? author?.account?.avatar_url : author?.profile_picture_url;
  const isVerified = author?.is_verified_citizen ?? false;
  const canOpen = canOpenProfile({ author, account: author?.account });
  const openProfile = canOpen
    ? () => openAuthorProfile(router, { author, account: author?.account })
    : undefined;
  const mentionAuthor = mention?.author;
  const canOpenMention = !!mentionAuthor && canOpenProfile({ author: mentionAuthor, account: mentionAuthor.account });
  const openMention = canOpenMention
    ? () => openAuthorProfile(router, { author: mentionAuthor, account: mentionAuthor?.account })
    : undefined;

  return (
    <Pressable
      onLongPress={() => onOptions(reply)}
      delayLongPress={350}
      style={[styles.row, isChild && styles.rowChild]}
    >
      <Pressable onPress={openProfile} disabled={!openProfile} hitSlop={4}>
        <UserAvatarWithFrame
          size={isChild ? 28 : 32}
          uri={avatarUri ?? null}
          fallbackInitial={displayName.charAt(0).toUpperCase()}
          frameAssetUrl={isOrg ? null : (author?.equipped_frame_asset_url ?? null)}
          disabled={isOrg || isAgent}
        />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Pressable onPress={openProfile} disabled={!openProfile} hitSlop={4} style={styles.nameWrap}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </Text>
          </Pressable>
          {isVerified && <VerifiedBadge size={14} />}
          {isThreadAuthor && (
            <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>Autor</Text>
            </View>
          )}
          {isAgent && (
            <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>KI</Text>
            </View>
          )}
          <Text style={[styles.time, { color: colors.textTertiary }]} numberOfLines={1}>
            · {formatRelativeTimestamp(reply.created_at)}
            {reply.edited_at ? ' · Bearbeitet' : ''}
          </Text>
          <Pressable
            onPress={() => onOptions(reply)}
            hitSlop={8}
            style={styles.more}
            accessibilityRole="button"
            accessibilityLabel="Optionen"
          >
            <Ionicons name="ellipsis-horizontal" size={14} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Text style={[styles.body, { color: colors.textPrimary }]}>
          {mention ? (
            <Text style={[styles.mention, { color: colors.primary }]} onPress={openMention}>
              @{mention.name}{' '}
            </Text>
          ) : null}
          {reply.body}
        </Text>
        <ForumReplyAttachments attachments={attachments} onOpenImage={onOpenImage ?? (() => {})} />

        <View style={styles.actions}>
          <Pressable
            onPress={() => onReply(reply)}
            hitSlop={8}
            style={styles.replyBtn}
            accessibilityRole="button"
            accessibilityLabel="Antworten"
          >
            <ReplyIcon width={16} height={16} color={colors.textSecondary} />
            <Text style={[styles.replyText, { color: colors.textSecondary }]}>Antworten</Text>
          </Pressable>
          <View style={styles.spacer} />
          <ForumVoteCluster
            targetType="reply"
            targetId={reply.id}
            upvotes={reply.upvotes_count ?? 0}
            downvotes={reply.downvotes_count ?? 0}
            myVote={myVote}
            onVoted={onVoted}
            compact
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  rowChild: {
    paddingLeft: 10,
    paddingTop: 10,
  },
  content: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameWrap: { flexShrink: 1 },
  name: { fontSize: 13, fontFamily: fontFamily.semiBold },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  badgeText: { fontSize: 10, fontFamily: fontFamily.semiBold, letterSpacing: 0.3 },
  time: { fontSize: 12, fontFamily: fontFamily.regular, flexShrink: 1 },
  more: { marginLeft: 'auto', padding: 4 },
  body: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  mention: { fontFamily: fontFamily.semiBold },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  replyText: { fontSize: 12, fontFamily: fontFamily.semiBold },
  spacer: { flex: 1 },
});
