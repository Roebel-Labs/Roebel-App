import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ShareIcon from '@/assets/icons/share-02.svg';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import CommentInput from '@/components/feed/CommentInput';
import ReportDrawer from '@/components/feed/ReportDrawer';
import DebateStrip from '@/components/forum/DebateStrip';
import ForumVoteCluster from '@/components/forum/ForumVoteCluster';
import ForumOptionsDrawer from '@/components/forum/ForumOptionsDrawer';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useForumVotes } from '@/hooks/useForumVotes';
import { useActiveProfileImage } from '@/hooks/useActiveProfileImage';
import { supabase } from '@/lib/supabase';
import { isDeliberateDebatesEnabled } from '@/lib/supabase-app-settings';
import { shareForumThread, shareForumReply } from '@/lib/forum-share';
import {
  createForumReply,
  deleteForumReply,
  deleteForumThread,
  fetchForumReplies,
  fetchForumThread,
  fetchThreadSubscription,
  toggleThreadSubscription,
  reportForumContent,
  updateForumReply,
  type ForumVoteTarget,
} from '@/lib/supabase-forum';
import type { ForumReplyRecord } from '@/lib/types/feed';

type GroupedReply = ForumReplyRecord & { children: ForumReplyRecord[] };

/** Replies are single-level nested (spec §A2.4): a reply's parent_reply_id
 *  always points directly at a top-level reply, never at another nested
 *  reply. Group into top-level + their direct children for rendering. */
function groupReplies(replies: ForumReplyRecord[]): GroupedReply[] {
  const byId = new Map<string, GroupedReply>();
  replies.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const topLevel: GroupedReply[] = [];
  replies.forEach((r) => {
    const node = byId.get(r.id)!;
    if (r.parent_reply_id && byId.has(r.parent_reply_id)) {
      byId.get(r.parent_reply_id)!.children.push(r);
    } else {
      topLevel.push(node);
    }
  });
  return topLevel;
}

type ReplyTarget = { id: string; parentId: string; name: string };
type OptionsTarget = { type: ForumVoteTarget; id: string };

export default function ForumThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isCitizen } = useUser();
  const { activeAccount } = useAccount();
  const activeProfileImage = useActiveProfileImage();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editingReply, setEditingReply] = useState<ForumReplyRecord | null>(null);
  const [optionsFor, setOptionsFor] = useState<OptionsTarget | null>(null);
  const [reportFor, setReportFor] = useState<OptionsTarget | null>(null);

  const { data: thread, isPending } = useQuery({
    queryKey: ['forum', 'thread', id],
    queryFn: () => fetchForumThread(id!),
    enabled: !!id,
  });
  const { data: replies = [] } = useQuery({
    queryKey: ['forum', 'replies', id],
    queryFn: () => fetchForumReplies(id!),
    enabled: !!id,
  });

  const { data: isSubscribed = false } = useQuery({
    queryKey: ['forum', 'subscription', id, user?.wallet_address],
    queryFn: () => fetchThreadSubscription(id!, user!.wallet_address!),
    enabled: !!id && !!user?.wallet_address,
  });

  const { data: debatesEnabled = false } = useQuery({
    queryKey: ['flags', 'deliberate', isCitizen, user?.wallet_address],
    queryFn: () =>
      isDeliberateDebatesEnabled({ isCitizen, walletAddress: user?.wallet_address }),
    staleTime: 5 * 60 * 1000,
  });
  const isThreadOwner =
    !!user?.wallet_address &&
    !!thread?.wallet_address &&
    user.wallet_address.toLowerCase() === thread.wallet_address.toLowerCase();

  const groupedReplies = useMemo(() => groupReplies(replies), [replies]);

  const voteTargets = useMemo(() => {
    if (!id) return [];
    return [{ type: 'thread' as const, id }, ...replies.map((r) => ({ type: 'reply' as const, id: r.id }))];
  }, [id, replies]);
  const { myVote, setLocal } = useForumVotes(voteTargets);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`forum-replies-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'forum_replies', filter: `thread_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
          queryClient.invalidateQueries({ queryKey: ['forum', 'thread', id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const handleSubmit = async (content: string) => {
    const body = content.trim();
    if (!body || sending || !user?.wallet_address || !id) return;
    setSending(true);
    setSendError(null);
    const result = editingReply
      ? await updateForumReply(editingReply.id, user.wallet_address, body)
      : await createForumReply({
          thread_id: id,
          wallet_address: user.wallet_address,
          account_id: activeAccount?.id,
          body,
          parent_reply_id: replyTo?.parentId ?? null,
        });
    setSending(false);
    if (!result) {
      // CommentInput already cleared the parent draft optimistically before
      // this await resolved — restore it so a failed send doesn't lose the
      // user's typed text.
      setDraft(content);
      setSendError('Antwort konnte nicht gesendet werden.');
      return;
    }
    setDraft('');
    setReplyTo(null);
    setEditingReply(null);
    await queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
    await queryClient.invalidateQueries({ queryKey: ['forum', 'thread', id] });
  };

  const handleToggleSubscription = async () => {
    if (!id || !user?.wallet_address) return;
    try {
      await toggleThreadSubscription(id, user.wallet_address, !isSubscribed);
      await queryClient.invalidateQueries({
        queryKey: ['forum', 'subscription', id, user.wallet_address],
      });
    } catch {
      Alert.alert('Fehler', 'Benachrichtigungen konnten nicht geändert werden.');
    }
  };

  const isOwn = (walletAddress: string) =>
    !!user?.wallet_address && walletAddress.toLowerCase() === user.wallet_address.toLowerCase();

  const findReply = (replyId: string) => replies.find((r) => r.id === replyId);

  const handleDeleteThread = () => {
    if (!thread || !user?.wallet_address) return;
    Alert.alert('Thema löschen?', 'Das Thema wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteForumThread(thread.id, user.wallet_address);
            await queryClient.invalidateQueries({ queryKey: ['forum', 'threads'] });
            await queryClient.invalidateQueries({ queryKey: ['feed', 'sections', 'rathaus'] });
            router.back();
          } catch {
            Alert.alert('Fehler', 'Thema konnte nicht gelöscht werden.');
          }
        },
      },
    ]);
  };

  const handleDeleteReply = (reply: ForumReplyRecord) => {
    if (!user?.wallet_address) return;
    Alert.alert('Antwort löschen?', 'Die Antwort wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteForumReply(reply.id, user.wallet_address);
            await queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
          } catch {
            Alert.alert('Fehler', 'Antwort konnte nicht gelöscht werden.');
          }
        },
      },
    ]);
  };

  // ─── Options drawer target resolution ────────────────────────────────────
  const isOwnerOfTarget = (target: OptionsTarget | null): boolean => {
    if (!target || !thread) return false;
    if (target.type === 'thread') return isOwn(thread.wallet_address);
    const reply = findReply(target.id);
    return reply ? isOwn(reply.wallet_address) : false;
  };

  const handleShareTarget = (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    if (target.type === 'thread') {
      void shareForumThread(thread.title, thread.id);
      return;
    }
    const reply = findReply(target.id);
    if (reply) void shareForumReply(reply.body, thread.id);
  };

  const handleCopyTarget = async (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    const body = target.type === 'thread' ? thread.body : findReply(target.id)?.body;
    if (body) await Clipboard.setStringAsync(body);
  };

  const handleEditTarget = (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    if (target.type === 'thread') {
      router.push(`/forum/new?edit=${thread.id}` as any);
      return;
    }
    const reply = findReply(target.id);
    if (reply) {
      setReplyTo(null);
      setEditingReply(reply);
      setDraft(reply.body);
    }
  };

  const handleDeleteTarget = (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    if (target.type === 'thread') {
      handleDeleteThread();
      return;
    }
    const reply = findReply(target.id);
    if (reply) handleDeleteReply(reply);
  };

  const handleReport = async (reason: string) => {
    if (!reportFor || !user?.wallet_address) return;
    await reportForumContent(reportFor.type, reportFor.id, user.wallet_address, reason);
  };

  const renderReplyRow = (reply: ForumReplyRecord, isChild: boolean) => (
    <View key={reply.id} style={isChild ? styles.replyChild : styles.reply}>
      <PostAuthorRow
        author={reply.author}
        createdAt={reply.created_at}
        onMore={() => setOptionsFor({ type: 'reply', id: reply.id })}
      />
      {reply.edited_at ? (
        <Text style={[styles.editedText, { color: colors.textTertiary }]}>Bearbeitet</Text>
      ) : null}
      <Text style={[styles.replyBody, { color: colors.textPrimary }]}>{reply.body}</Text>
      <View style={styles.replyActions}>
        <ForumVoteCluster
          targetType="reply"
          targetId={reply.id}
          upvotes={reply.upvotes_count ?? 0}
          downvotes={reply.downvotes_count ?? 0}
          myVote={myVote('reply', reply.id)}
          onVoted={(next) => setLocal('reply', reply.id, next)}
          compact
        />
        <Pressable
          onPress={() =>
            setReplyTo({
              id: reply.id,
              parentId: reply.parent_reply_id ?? reply.id,
              name: reply.author?.account?.name ?? reply.author?.username ?? 'Unbekannt',
            })
          }
          hitSlop={8}
        >
          <Text style={[styles.replyLink, { color: colors.textSecondary }]}>Antworten</Text>
        </Pressable>
        <Pressable
          // The thread must be dereferenced INSIDE the handler, never as
          // `thread!.id` in the closure's argument list: React Compiler lifts
          // such a read into this callback's memo-dependency check, which runs
          // on every render — including the first one, while the thread query
          // is still pending and `thread` is undefined.
          onPress={() => {
            if (!thread) return;
            void shareForumReply(reply.body, thread.id);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Teilen"
        >
          <ShareIcon width={16} height={16} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );

  const renderReply = ({ item }: { item: GroupedReply }) => (
    <View style={[styles.replyGroup, { borderColor: colors.borderTertiary }]}>
      {renderReplyRow(item, false)}
      {item.children.map((child) => renderReplyRow(child, true))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Diskussion</Text>
          {user?.wallet_address ? (
            <Pressable
              onPress={handleToggleSubscription}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={
                isSubscribed ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'
              }
            >
              <Ionicons
                name={isSubscribed ? 'notifications' : 'notifications-outline'}
                size={22}
                color={isSubscribed ? colors.primary : colors.textPrimary}
              />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        {isPending || !thread ? (
          <View style={styles.loading}>
            {isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.notFound, { color: colors.textSecondary }]}>
                Thema nicht gefunden.
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={groupedReplies}
            keyExtractor={(r) => r.id}
            renderItem={renderReply}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={[styles.threadHead, { borderColor: colors.borderTertiary }]}>
                {thread.category?.name ? (
                  <Text style={[styles.category, { color: colors.primary }]}>
                    {thread.category.name.toUpperCase()}
                  </Text>
                ) : null}
                <Text style={[styles.title, { color: colors.textPrimary }]}>{thread.title}</Text>
                <PostAuthorRow
                  author={thread.author}
                  createdAt={thread.created_at}
                  onMore={() => setOptionsFor({ type: 'thread', id: thread.id })}
                />
                {thread.edited_at ? (
                  <Text style={[styles.editedText, { color: colors.textTertiary }]}>Bearbeitet</Text>
                ) : null}
                <Text style={[styles.body, { color: colors.textPrimary }]}>{thread.body}</Text>
                {thread.debate_id != null ? (
                  <DebateStrip debateId={thread.debate_id} />
                ) : debatesEnabled && isThreadOwner ? (
                  <Pressable
                    onPress={() => router.push(`/forum/debate/new?thread=${thread.id}` as any)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.startDebate,
                      { borderColor: colors.primary },
                      pressed && { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Text style={[styles.startDebateText, { color: colors.primary }]}>
                      Strukturierte Debatte starten
                    </Text>
                  </Pressable>
                ) : null}
                <View style={styles.threadHeadActions}>
                  <ForumVoteCluster
                    targetType="thread"
                    targetId={thread.id}
                    upvotes={thread.upvotes_count ?? 0}
                    downvotes={thread.downvotes_count ?? 0}
                    myVote={myVote('thread', thread.id)}
                    onVoted={(next) => setLocal('thread', thread.id, next)}
                  />
                  <Pressable
                    onPress={() => void shareForumThread(thread.title, thread.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Teilen"
                  >
                    <ShareIcon width={20} height={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Text style={[styles.replyCount, { color: colors.textSecondary }]}>
                  {thread.reply_count === 1 ? '1 Antwort' : `${thread.reply_count} Antworten`}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                Noch keine Antworten. Schreib die erste!
              </Text>
            }
          />
        )}

        {isCitizen && thread && (
          <View style={styles.inputWrap}>
            {sendError ? (
              <Text style={[styles.sendError, { color: colors.error }]}>{sendError}</Text>
            ) : null}
            {editingReply && (
              <View style={[styles.editBanner, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.editBannerText, { color: colors.textSecondary }]}>
                  Antwort bearbeiten
                </Text>
                <Pressable
                  onPress={() => {
                    setEditingReply(null);
                    setDraft('');
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Bearbeiten abbrechen"
                >
                  <Text style={[styles.editBannerCancel, { color: colors.primary }]}>Abbrechen</Text>
                </Pressable>
              </View>
            )}
            <CommentInput
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                setSendError(null);
              }}
              isSubmitting={sending}
              disableAttachments
              replyingToName={editingReply ? null : (replyTo?.name ?? null)}
              onCancelReply={() => {
                setReplyTo(null);
                setEditingReply(null);
                setDraft('');
              }}
              walletAddress={user?.wallet_address}
              avatarUrl={activeProfileImage.url}
              avatarFallbackInitial={activeProfileImage.fallbackInitial}
              onSubmit={async (content) => {
                await handleSubmit(content);
              }}
            />
          </View>
        )}
      </KeyboardAvoidingView>

      <ForumOptionsDrawer
        visible={!!optionsFor}
        onClose={() => setOptionsFor(null)}
        targetType={optionsFor?.type ?? 'thread'}
        targetId={optionsFor?.id ?? ''}
        isOwner={isOwnerOfTarget(optionsFor)}
        onShare={() => handleShareTarget(optionsFor)}
        onCopy={() => void handleCopyTarget(optionsFor)}
        onReport={() => {
          if (optionsFor) setReportFor(optionsFor);
        }}
        onEdit={() => handleEditTarget(optionsFor)}
        onDelete={() => handleDeleteTarget(optionsFor)}
        isSubscribed={isSubscribed}
        onToggleSubscription={handleToggleSubscription}
      />

      <ReportDrawer
        visible={!!reportFor}
        onClose={() => setReportFor(null)}
        onReport={handleReport}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: fontFamily.semiBold },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 14, fontFamily: fontFamily.regular },
  listContent: { paddingBottom: 24 },
  threadHead: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  category: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.6 },
  title: { fontSize: 20, fontFamily: fontFamily.heading, lineHeight: 26 },
  body: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 22 },
  replyCount: { fontSize: 12, fontFamily: fontFamily.regular },
  threadHeadActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  startDebate: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  startDebateText: { fontSize: 13, fontFamily: fontFamily.medium },
  editedText: { fontSize: 12, fontFamily: fontFamily.regular },
  replyGroup: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reply: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
  },
  replyChild: {
    paddingHorizontal: 16,
    paddingTop: 10,
    marginLeft: 32,
    gap: 6,
  },
  replyBody: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  replyLink: { fontSize: 12, fontFamily: fontFamily.medium },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
  inputWrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sendError: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editBannerText: { fontSize: 13, fontFamily: fontFamily.medium },
  editBannerCancel: { fontSize: 13, fontFamily: fontFamily.medium },
});
