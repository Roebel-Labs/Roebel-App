import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
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
import ForumVoteCluster from '@/components/forum/ForumVoteCluster';
import ForumOptionsDrawer from '@/components/forum/ForumOptionsDrawer';
import ForumReplyThread from '@/components/forum/ForumReplyThread';
import ForumStageStepper from '@/components/forum/ForumStageStepper';
import ForumThreadSkeleton from '@/components/forum/ForumThreadSkeleton';
import ForumAttachmentsCarousel from '@/components/forum/ForumAttachmentsCarousel';
import ImageZoomModal from '@/components/ImageZoomModal';
import { FORUM_ATTACHMENTS_BUCKET } from '@/lib/forum-attachments';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useForumVotes } from '@/hooks/useForumVotes';
import { useActiveProfileImage } from '@/hooks/useActiveProfileImage';
import { supabase } from '@/lib/supabase';
import { shareForumThread, shareForumReply } from '@/lib/forum-share';
import { groupReplies, replyDisplayName, type GroupedReply } from '@/lib/forum-replies';
import { STAGE_LABELS } from '@/lib/forum-stages';
import { BUERGERRAT_TOTAL } from '@/lib/buergerrat';
import {
  createForumReply,
  deleteForumReply,
  deleteForumThread,
  fetchForumAttachments,
  fetchForumReplies,
  fetchForumThread,
  fetchThreadSubscription,
  toggleThreadSubscription,
  reportForumContent,
  updateForumReply,
  type ForumVoteTarget,
} from '@/lib/supabase-forum';
import type { ForumAttachmentRecord, ForumReplyRecord, PendingAttachment } from '@/lib/types/feed';

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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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

  const { data: attachments = [] } = useQuery({
    queryKey: ['forum', 'attachments', id],
    queryFn: () => fetchForumAttachments(id!),
    enabled: !!id,
  });
  const attachmentsByReply = useMemo(() => {
    const map = new Map<string, ForumAttachmentRecord[]>();
    for (const a of attachments) {
      if (!a.reply_id) continue;
      map.set(a.reply_id, [...(map.get(a.reply_id) ?? []), a]);
    }
    return map;
  }, [attachments]);
  const imageUrls = useMemo(
    () => attachments.filter((a) => a.kind === 'image').map((a) => a.url),
    [attachments],
  );
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const groupedReplies = useMemo(() => groupReplies(replies), [replies]);
  const repliesById = useMemo(() => new Map(replies.map((r) => [r.id, r])), [replies]);

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
          queryClient.invalidateQueries({ queryKey: ['forum', 'attachments', id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const toggleExpanded = useCallback((topLevelId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topLevelId)) next.delete(topLevelId);
      else next.add(topLevelId);
      return next;
    });
  }, []);

  const handleSubmit = async (content: string, attachments: PendingAttachment[] = []) => {
    // A reply may be just a file: the body then carries the file name.
    const body = content.trim() || attachments[0]?.file_name || '';
    if (!body || sending || !user?.wallet_address || !id) return;
    setSending(true);
    setSendError(null);
    const parentId = replyTo?.parentId ?? null;
    const result = editingReply
      ? await updateForumReply(editingReply.id, user.wallet_address, body)
      : await createForumReply({
          thread_id: id,
          wallet_address: user.wallet_address,
          account_id: activeAccount?.id,
          body,
          parent_reply_id: parentId,
          reply_to_reply_id: replyTo?.id ?? null,
          attachments,
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
    // Show the reply the user just wrote even when its parent was collapsed.
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setDraft('');
    setReplyTo(null);
    setEditingReply(null);
    await queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
    await queryClient.invalidateQueries({ queryKey: ['forum', 'thread', id] });
    await queryClient.invalidateQueries({ queryKey: ['forum', 'attachments', id] });
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

  const findReply = (replyId: string) => repliesById.get(replyId);

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

  const startReply = useCallback((reply: ForumReplyRecord) => {
    setEditingReply(null);
    setReplyTo({
      id: reply.id,
      parentId: reply.parent_reply_id ?? reply.id,
      name: replyDisplayName(reply),
    });
  }, []);

  const openReplyOptions = useCallback((reply: ForumReplyRecord) => {
    setOptionsFor({ type: 'reply', id: reply.id });
  }, []);

  const renderGroup = ({ item }: { item: GroupedReply }) => (
    <ForumReplyThread
      group={item}
      byId={repliesById}
      // The thread is read INSIDE the callback body, never as `thread!.x` in
      // an argument list: React Compiler hoists such reads into the memo
      // check, which runs on the first render while the query is pending.
      threadAuthorWallet={thread ? thread.wallet_address : ''}
      expanded={expanded.has(item.id)}
      onToggleExpanded={toggleExpanded}
      myVote={(replyId) => myVote('reply', replyId)}
      onVoted={(replyId, next) => setLocal('reply', replyId, next)}
      onReply={startReply}
      onOptions={openReplyOptions}
      attachmentsByReply={attachmentsByReply}
      onOpenImage={setLightboxUrl}
    />
  );

  const isOfficial = thread?.source === 'buergerrat';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 'height' on Android (same as the post detail screen): the reply bar
          must stay above the keyboard, also when answering a comment. */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
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

        {isPending ? (
          <ForumThreadSkeleton />
        ) : !thread ? (
          <View style={styles.loading}>
            <Text style={[styles.notFound, { color: colors.textSecondary }]}>
              Thema nicht gefunden.
            </Text>
          </View>
        ) : (
          <FlatList
            data={groupedReplies}
            keyExtractor={(r) => r.id}
            renderItem={renderGroup}
            extraData={expanded}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={[styles.threadHead, { borderColor: colors.borderTertiary }]}>
                {isOfficial ? (
                  <View style={styles.officialRow}>
                    <Text style={[styles.category, { color: colors.primary }]}>
                      BÜRGERRAT · EMPFEHLUNG {thread.source_rank ?? '–'} VON {BUERGERRAT_TOTAL}
                    </Text>
                    {thread.source_score != null && (
                      <View style={[styles.scoreChip, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.scoreText, { color: colors.primary }]}>
                          {thread.source_score} Punkte
                        </Text>
                      </View>
                    )}
                  </View>
                ) : thread.category?.name ? (
                  <Text style={[styles.category, { color: colors.primary }]}>
                    {thread.category.name.toUpperCase()}
                  </Text>
                ) : null}

                <Text style={[styles.title, { color: colors.textPrimary }]}>{thread.title}</Text>

                {isOfficial && (
                  <ForumStageStepper stage={thread.stage} events={thread.stage_events ?? []} />
                )}

                <PostAuthorRow
                  author={thread.author}
                  createdAt={thread.created_at}
                  badge={isOfficial ? 'Eingestellt' : undefined}
                  onMore={() => setOptionsFor({ type: 'thread', id: thread.id })}
                />
                {thread.edited_at ? (
                  <Text style={[styles.editedText, { color: colors.textTertiary }]}>Bearbeitet</Text>
                ) : null}

                {/* Thread bodies are markdown (headings, lists, links) for readability. */}
                <MarkdownRenderer content={thread.body} />

                {isOfficial && thread.official_comment ? (
                  <View
                    style={[
                      styles.quote,
                      { borderLeftColor: colors.border, backgroundColor: colors.surfaceSecondary },
                    ]}
                  >
                    <Text style={[styles.quoteHeading, { color: colors.textSecondary }]}>
                      Kommentar des Bürgermeisters (aus der Broschüre)
                    </Text>
                    <Text style={[styles.quoteBody, { color: colors.textPrimary }]}>
                      {thread.official_comment}
                    </Text>
                  </View>
                ) : null}

                {isOfficial && thread.source_citation ? (
                  <Text style={[styles.citation, { color: colors.textSecondary }]}>
                    Quelle: {thread.source_citation}
                    {thread.source_url ? (
                      <Text
                        style={[styles.citationLink, { color: colors.primary }]}
                        onPress={() => {
                          if (thread.source_url) void Linking.openURL(thread.source_url);
                        }}
                      >
                        {' '}· NDR-Bericht
                      </Text>
                    ) : null}
                  </Text>
                ) : null}

                {thread.stage && !isOfficial ? (
                  <Text style={[styles.stageLine, { color: colors.textSecondary }]}>
                    Stand: {STAGE_LABELS[thread.stage]}
                  </Text>
                ) : null}

                <ForumAttachmentsCarousel attachments={attachments} onOpenImage={setLightboxUrl} />

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
              disableStickers
              enableFiles
              uploadTarget={{ bucket: FORUM_ATTACHMENTS_BUCKET, folder: 'replies' }}
              replyingToName={editingReply ? null : (replyTo?.name ?? null)}
              onCancelReply={() => {
                setReplyTo(null);
                setEditingReply(null);
                setDraft('');
              }}
              walletAddress={user?.wallet_address}
              avatarUrl={activeProfileImage.url}
              avatarFallbackInitial={activeProfileImage.fallbackInitial}
              onSubmit={async (content, _sticker, imageUrl, file) => {
                const items: PendingAttachment[] = [];
                if (imageUrl) {
                  items.push({ kind: 'image', url: imageUrl, mime_type: 'image/jpeg', file_name: 'bild.jpg' });
                }
                if (file) items.push(file);
                await handleSubmit(content, items);
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

      <ImageZoomModal
        visible={!!lightboxUrl}
        imageUrl={lightboxUrl ?? ''}
        images={imageUrls.length > 1 ? imageUrls : undefined}
        onClose={() => setLightboxUrl(null)}
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
  officialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  category: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.6, flexShrink: 1 },
  scoreChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  scoreText: { fontSize: 11, fontFamily: fontFamily.semiBold },
  title: { fontSize: 24, fontFamily: fontFamily.heading, lineHeight: 30 },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  quoteHeading: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.4 },
  quoteBody: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  citation: { fontSize: 12, fontFamily: fontFamily.regular, lineHeight: 17 },
  citationLink: { fontFamily: fontFamily.semiBold },
  stageLine: { fontSize: 12, fontFamily: fontFamily.medium },
  replyCount: { fontSize: 12, fontFamily: fontFamily.regular },
  threadHeadActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  editedText: { fontSize: 12, fontFamily: fontFamily.regular },
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
