import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { supabase } from '@/lib/supabase';
import {
  createForumReply,
  deleteForumReply,
  deleteForumThread,
  fetchForumReplies,
  fetchForumThread,
} from '@/lib/supabase-forum';
import type { ForumReplyRecord } from '@/lib/types/feed';

export default function ForumThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isCitizen } = useUser();
  const { activeAccount } = useAccount();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

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

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending || !user?.wallet_address || !id) return;
    setSending(true);
    const reply = await createForumReply({
      thread_id: id,
      wallet_address: user.wallet_address,
      account_id: activeAccount?.id,
      body,
    });
    setSending(false);
    if (reply) {
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
      await queryClient.invalidateQueries({ queryKey: ['forum', 'thread', id] });
    }
  };

  const isOwn = (walletAddress: string) =>
    !!user?.wallet_address && walletAddress.toLowerCase() === user.wallet_address.toLowerCase();

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

  const renderReply = ({ item }: { item: ForumReplyRecord }) => (
    <View style={[styles.reply, { borderColor: colors.borderTertiary }]}>
      <PostAuthorRow author={item.author} createdAt={item.created_at} />
      <Text style={[styles.replyBody, { color: colors.textPrimary }]}>{item.body}</Text>
      {isOwn(item.wallet_address) && (
        <Pressable onPress={() => handleDeleteReply(item)} hitSlop={8}>
          <Text style={[styles.deleteLink, { color: colors.textTertiary }]}>Löschen</Text>
        </Pressable>
      )}
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
          <View style={{ width: 24 }} />
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
            data={replies}
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
                <PostAuthorRow author={thread.author} createdAt={thread.created_at} />
                <Text style={[styles.body, { color: colors.textPrimary }]}>{thread.body}</Text>
                <Text style={[styles.replyCount, { color: colors.textSecondary }]}>
                  {thread.reply_count === 1 ? '1 Antwort' : `${thread.reply_count} Antworten`}
                </Text>
                {isOwn(thread.wallet_address) && (
                  <Pressable onPress={() => handleDeleteThread()} hitSlop={8}>
                    <Text style={[styles.deleteLink, { color: colors.textTertiary }]}>Löschen</Text>
                  </Pressable>
                )}
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
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Antworten …"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={10000}
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            />
            <Pressable onPress={handleSend} disabled={!draft.trim() || sending} hitSlop={8}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.send,
                    { color: draft.trim() ? colors.primary : colors.textTertiary },
                  ]}
                >
                  Senden
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
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
  reply: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  replyBody: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
  },
  send: { fontSize: 15, fontFamily: fontFamily.semiBold, paddingBottom: 8 },
  deleteLink: { fontSize: 12, fontFamily: fontFamily.regular },
});
