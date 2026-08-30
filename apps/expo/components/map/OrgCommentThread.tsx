/**
 * "Was denkst du?" — the comment rail in the org sheet.
 *
 * A user holds exactly one comment per org (see supabase-account-comments),
 * so the composer says "bearbeiten" once they have written one. Replies and
 * likes hang off that comment.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatRelativeTimestamp } from '@/lib/utils';
import type { AccountComment } from '@/lib/types';

type Props = {
  comments: AccountComment[];
  myWallet: string | null;
  myAvatarUrl?: string | null;
  onSubmit: (text: string) => Promise<boolean>;
  onReply: (ratingId: string, text: string) => Promise<boolean>;
  onLike: (ratingId: string) => void;
};

export default function OrgCommentThread({
  comments,
  myWallet,
  myAvatarUrl,
  onSubmit,
  onReply,
  onLike,
}: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const myComment = myWallet
    ? comments.find((c) => c.wallet_address.toLowerCase() === myWallet.toLowerCase())
    : undefined;

  const submit = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = await onSubmit(draft);
    setSending(false);
    if (ok) setDraft('');
  };

  return (
    <View style={styles.wrap}>
      {/* Composer */}
      <View style={styles.composerRow}>
        {myAvatarUrl ? (
          <Image source={{ uri: myAvatarUrl }} style={styles.composerAvatar} contentFit="cover" />
        ) : (
          <View
            style={[styles.composerAvatar, { backgroundColor: colors.surfaceSecondary }]}
          />
        )}
        <View
          style={[
            styles.composerBox,
            { borderColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={myComment ? 'Deinen Beitrag bearbeiten…' : 'Was denkst du?'}
            placeholderTextColor={colors.textTertiary}
            style={[styles.composerInput, { color: colors.textPrimary }]}
            multiline
            editable={!!myWallet && !sending}
            onSubmitEditing={submit}
            accessibilityLabel="Kommentar schreiben"
          />
          {draft.trim() ? (
            <Pressable onPress={submit} disabled={sending} hitSlop={8}>
              <Text style={[styles.sendLabel, { color: colors.primary }]}>
                {sending ? '…' : 'Senden'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!myWallet ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Melde dich an, um mitzureden.
        </Text>
      ) : null}

      {/* Thread */}
      {comments.map((comment) => (
        <View
          key={comment.id}
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.author, { color: colors.textPrimary }]}>
              {comment.author?.username || 'Anonym'}
            </Text>
            {comment.stars != null ? (
              <Text style={[styles.stars, { color: colors.textTertiary }]}>
                {'★'.repeat(comment.stars)}
              </Text>
            ) : null}
            <Text style={[styles.age, { color: colors.textTertiary }]}>
              {formatRelativeTimestamp(comment.created_at)}
            </Text>
          </View>

          {comment.comment ? (
            <Text style={[styles.body, { color: colors.textPrimary }]}>{comment.comment}</Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              style={[styles.actionButton, { borderColor: colors.border }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Antworten"
            >
              <Text style={[styles.actionIcon, { color: colors.textSecondary }]}>💬</Text>
            </Pressable>
            <Pressable
              onPress={() => onLike(comment.id)}
              style={[styles.actionButton, { borderColor: colors.border }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ selected: comment.liked_by_me }}
              accessibilityLabel={comment.liked_by_me ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
            >
              <Text style={styles.actionIcon}>{comment.liked_by_me ? '❤️' : '🤍'}</Text>
              {comment.like_count > 0 ? (
                <Text style={[styles.likeCount, { color: colors.textSecondary }]}>
                  {comment.like_count}
                </Text>
              ) : null}
            </Pressable>
          </View>

          {comment.replies.map((reply) => (
            <View key={reply.id} style={[styles.reply, { borderLeftColor: colors.border }]}>
              <Text style={[styles.replyAuthor, { color: colors.textSecondary }]}>
                {reply.author?.username || 'Anonym'}
              </Text>
              <Text style={[styles.replyBody, { color: colors.textPrimary }]}>{reply.content}</Text>
            </View>
          ))}

          {replyingTo === comment.id && myWallet ? (
            <ReplyComposer
              onSend={async (text) => {
                const ok = await onReply(comment.id, text);
                if (ok) setReplyingTo(null);
                return ok;
              }}
            />
          ) : null}
        </View>
      ))}

      {comments.length === 0 ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Noch keine Beiträge. Sag als Erste:r etwas dazu.
        </Text>
      ) : null}
    </View>
  );
}

function ReplyComposer({ onSend }: { onSend: (text: string) => Promise<boolean> }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text);
    setSending(false);
    if (ok) setText('');
  };

  return (
    <View style={[styles.replyComposer, { borderColor: colors.border }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Antworten…"
        placeholderTextColor={colors.textTertiary}
        style={[styles.composerInput, { color: colors.textPrimary }]}
        editable={!sending}
        autoFocus
        onSubmitEditing={send}
        accessibilityLabel="Antwort schreiben"
      />
      {text.trim() ? (
        <Pressable onPress={send} disabled={sending} hitSlop={8}>
          <Text style={[styles.sendLabel, { color: colors.primary }]}>
            {sending ? '…' : 'Senden'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingHorizontal: 16 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  composerAvatar: { width: 40, height: 40, borderRadius: 20 },
  composerBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  composerInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 15, maxHeight: 96 },
  sendLabel: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  hint: { fontFamily: fontFamily.regular, fontSize: 14, paddingVertical: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  author: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  stars: { fontFamily: fontFamily.regular, fontSize: 13 },
  age: { fontFamily: fontFamily.regular, fontSize: 13 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionIcon: { fontSize: 13 },
  likeCount: { fontFamily: fontFamily.medium, fontSize: 12 },
  reply: { borderLeftWidth: 2, paddingLeft: 10, gap: 2 },
  replyAuthor: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  replyBody: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 19 },
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
