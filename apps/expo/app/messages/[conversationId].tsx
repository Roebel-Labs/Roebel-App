import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useConversation } from '@/hooks/useConversation';
import { useMessaging } from '@/context/MessagingContext';
import { useTheme } from '@/context/ThemeContext';
import MessageBubble from '@/components/messages/MessageBubble';
import ChatInput from '@/components/messages/ChatInput';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import type { Message } from '@/lib/supabase-messages';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

function shortenAddress(addr: string): string {
  if (!addr) return 'Unbekannt';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const account = useActiveAccount();
  const { markConversationRead } = useMessaging();

  // Mark conversation as read when opened
  useEffect(() => {
    if (conversationId) {
      markConversationRead(conversationId);
    }
  }, [conversationId, markConversationRead]);

  const {
    messages,
    isLoading,
    isSending,
    sendMessage,
    loadMore,
    peerAddress,
    peerUser,
  } = useConversation(conversationId || '');

  const myAddress = account?.address?.toLowerCase() || '';
  const peerDisplayName = peerUser?.username || shortenAddress(peerAddress);

  const renderMessage = ({ item }: { item: Message }) => (
    <MessageBubble
      message={item}
      isOwn={item.sender_address.toLowerCase() === myAddress}
      peerAvatar={peerUser?.profilePictureUrl}
      peerFrameUrl={peerUser?.equippedFrameUrl ?? null}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable style={styles.headerCenter} onPress={() => peerAddress && router.push(`/user/${peerAddress}` as any)}>
          <UserAvatarWithFrame
            size={32}
            uri={peerUser?.profilePictureUrl ?? null}
            fallbackInitial={(peerDisplayName[0] || '?').toUpperCase()}
            frameAssetUrl={peerUser?.equippedFrameUrl ?? null}
          />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {peerDisplayName}
          </Text>
        </Pressable>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Messages */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
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

        {/* Input */}
        <SafeAreaView edges={['bottom']} style={[styles.inputSafe, { backgroundColor: colors.background }]}>
          <ChatInput onSend={sendMessage} isSending={isSending} />
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
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
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
  inputSafe: {
  },
});
