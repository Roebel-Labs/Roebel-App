import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useConversation } from '@/hooks/useConversation';
import { useMessaging } from '@/context/MessagingContext';
import { useTheme } from '@/context/ThemeContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import MessageBubble from '@/components/messages/MessageBubble';
import ChatInput from '@/components/messages/ChatInput';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { Skeleton } from '@/components/SkeletonLoader';
import { ChatLoadingSkeletons } from '@/components/messages/MessageBubbleSkeleton';
import { safeDisplayName, type Message } from '@/lib/supabase-messages';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function ChatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { markConversationRead } = useMessaging();
  const requireAuth = useRequireAuth();

  // Mark conversation as read when opened
  useEffect(() => {
    if (conversationId) {
      markConversationRead(conversationId);
    }
  }, [conversationId, markConversationRead]);

  const {
    messages,
    isLoadingMessages,
    isLoadingPeer,
    isSending,
    sendMessage,
    loadMore,
    peerAccount,
    myAccountId,
  } = useConversation(conversationId || '');

  const peerDisplayName = peerAccount
    ? safeDisplayName(peerAccount.name, peerAccount.username)
    : '';

  const renderMessage = ({ item }: { item: Message }) => (
    <MessageBubble
      message={item}
      isOwn={!!myAccountId && item.sender_account_id === myAccountId}
      peerAvatar={peerAccount?.avatarUrl ?? null}
      peerFrameUrl={peerAccount?.equippedFrameUrl ?? null}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          style={styles.headerCenter}
          onPress={() =>
            peerAccount?.id && router.push(`/account/${peerAccount.id}` as any)
          }
          disabled={!peerAccount?.id}
        >
          {isLoadingPeer && !peerAccount ? (
            <View style={styles.headerCenterSkeleton}>
              <Skeleton width={32} height={32} borderRadius={16} />
              <Skeleton width={120} height={14} borderRadius={4} />
            </View>
          ) : (
            <>
              <UserAvatarWithFrame
                size={32}
                uri={peerAccount?.avatarUrl ?? null}
                fallbackInitial={(peerDisplayName[0] || '?').toUpperCase()}
                frameAssetUrl={peerAccount?.equippedFrameUrl ?? null}
              />
              <Text
                style={[styles.headerTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {peerDisplayName}
              </Text>
            </>
          )}
        </Pressable>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {isLoadingMessages && messages.length === 0 ? (
          <ChatLoadingSkeletons />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={[styles.emptyChatText, { color: colors.textTertiary }]}>
                  Schreiben Sie die erste Nachricht
                </Text>
              </View>
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
          />
        )}

        <SafeAreaView edges={['bottom']} style={styles.inputSafe}>
          <ChatInput
            onSend={(text, stickerRewardId) => {
              if (!myAccountId) {
                requireAuth(() => {});
                return;
              }
              sendMessage(text, stickerRewardId);
            }}
            isSending={isSending}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerCenterSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChatText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  flex: {
    flex: 1,
  },
  inputSafe: {},
});
