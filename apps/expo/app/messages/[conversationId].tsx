import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Modal,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useConversation } from '@/hooks/useConversation';
import { useMessaging } from '@/context/MessagingContext';
import { useTheme } from '@/context/ThemeContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import { useSnackbar } from '@/context/SnackbarContext';
import MessageBubble from '@/components/messages/MessageBubble';
import ChatInput from '@/components/messages/ChatInput';
import MuenzenSendSheet from '@/components/messages/MuenzenSendSheet';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { Skeleton } from '@/components/SkeletonLoader';
import { ChatLoadingSkeletons } from '@/components/messages/MessageBubbleSkeleton';
import { safeDisplayName, type Message } from '@/lib/supabase-messages';
import { resetDecrypted } from '@/components/DecryptText';
import { setActiveConversationId } from '@/lib/active-conversation';
import { openAuthorProfile, canOpenProfile } from '@/lib/profile-navigation';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import LockIcon from '@/assets/icons/square-lock-02.svg';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function ChatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { markConversationRead } = useMessaging();
  const requireAuth = useRequireAuth();
  const { showSnackbar } = useSnackbar();

  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // Keep the input bar riding just above the keyboard (and above the home
  // indicator when it's closed). Tracking the keyboard height ourselves is
  // more reliable across iOS/Android than KeyboardAvoidingView, which left a
  // residual gap after dismissal on Android.
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      // Don't trust endCoordinates.height: on Android with edge-to-edge it
      // under-reports by the nav-bar inset, leaving the input bar slightly
      // under the keyboard. screenY is the keyboard's absolute top edge, so
      // screen height minus screenY is the exact overlap on both platforms.
      const screenY = e.endCoordinates?.screenY;
      const overlap =
        typeof screenY === 'number'
          ? Math.max(0, Dimensions.get('screen').height - screenY)
          : e.endCoordinates?.height ?? 0;
      setKeyboardHeight(overlap);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const inputBottomPad = keyboardHeight > 0 ? keyboardHeight : insets.bottom;

  // Mark conversation as read when opened
  useEffect(() => {
    if (conversationId) {
      markConversationRead(conversationId);
    }
  }, [conversationId, markConversationRead]);

  // Replay the "decrypt" reveal for every message each time a chat is opened,
  // so the load reads as if the messages are being decrypted.
  useEffect(() => {
    resetDecrypted();
  }, [conversationId]);

  // Tell the push handler this conversation is on screen so it suppresses
  // foreground DM banners for it. Cleared when the screen loses focus.
  useFocusEffect(
    React.useCallback(() => {
      setActiveConversationId(conversationId ?? null);
      return () => setActiveConversationId(null);
    }, [conversationId])
  );

  const {
    messages,
    isLoadingMessages,
    isLoadingPeer,
    isSending,
    sendMessage,
    sendPayment,
    sendReaction,
    blockPeer,
    unblockPeer,
    consent,
    rail,
    sendBlocked,
    paymentError,
    clearPaymentError,
    peerReadAt,
    loadMore,
    peerAccount,
    myAccountId,
  } = useConversation(conversationId || '');

  // Background payment failures surface as a snackbar (the optimistic
  // bubble has already been removed by the hook).
  useEffect(() => {
    if (paymentError) {
      showSnackbar({ message: paymentError });
      clearPaymentError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentError]);

  const peerDisplayName = peerAccount
    ? safeDisplayName(peerAccount.name, peerAccount.username)
    : '';

  // Personal peers live at /user/[username]; orgs at /account/[id]. Route via
  // the shared helper instead of always pushing /account/[id] (which is the
  // org-only page and renders nothing for a person).
  const profileRef = peerAccount
    ? {
        account: { id: peerAccount.id, account_type: peerAccount.accountType },
        author: { username: peerAccount.username },
      }
    : null;

  // "Gelesen": the newest own message covered by the peer's read receipt.
  const readMessageId = useMemo(() => {
    if (!peerReadAt || !myAccountId) return null;
    const readTs = Date.parse(peerReadAt);
    const newestOwn = messages.find((m) => m.sender_account_id === myAccountId);
    if (!newestOwn || newestOwn.source !== 'xmtp') return null;
    return Date.parse(newestOwn.created_at) <= readTs ? newestOwn.id : null;
  }, [messages, peerReadAt, myAccountId]);

  const isBlocked = consent === 'denied';
  const xmtpActive = rail === 'xmtp';

  const handleToggleReaction = (message: Message, emoji: string, add: boolean) => {
    sendReaction(message.id, emoji, add);
  };

  const handlePickReaction = (emoji: string) => {
    const target = reactionTarget;
    setReactionTarget(null);
    if (!target) return;
    const already = target.reactions?.some((r) => r.emoji === emoji && r.reactedByMe);
    sendReaction(target.id, emoji, !already);
  };

  // Tap a Röbel-Münzen payment bubble → the shared transaction-detail screen
  // (same one the Belohnungen "Verlauf" opens). Counterparty is the resolved
  // peer name; amount keeps 2 decimals since chat payments are often < 1.
  const handleOpenPaymentDetails = (message: Message) => {
    const payment = message.payment;
    if (!payment) return;
    const sent = !!myAccountId && message.sender_account_id === myAccountId;
    const amountText = `${sent ? '− ' : '+ '}${payment.amount.toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    router.push({
      pathname: '/transaction',
      params: {
        direction: sent ? 'out' : 'in',
        title: peerDisplayName || (sent ? 'Gesendet' : 'Erhalten'),
        amountText,
        currency: 'muenzen',
        timestamp: String(Date.parse(message.created_at)),
        ...(payment.txHash ? { txHash: payment.txHash } : {}),
        ...(peerDisplayName ? { name: peerDisplayName } : {}),
      },
    } as any);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <MessageBubble
      message={item}
      isOwn={!!myAccountId && item.sender_account_id === myAccountId}
      peerAvatar={peerAccount?.avatarUrl ?? null}
      peerFrameUrl={peerAccount?.equippedFrameUrl ?? null}
      onLongPress={xmtpActive && item.source === 'xmtp' ? setReactionTarget : undefined}
      onToggleReaction={xmtpActive ? handleToggleReaction : undefined}
      onPressPayment={handleOpenPaymentDetails}
      showRead={item.id === readMessageId}
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
          onPress={() => profileRef && openAuthorProfile(router, profileRef)}
          disabled={!profileRef || !canOpenProfile(profileRef)}
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
        {xmtpActive ? (
          <Pressable style={styles.headerRight} onPress={() => setShowMenu(true)} hitSlop={8}>
            <Text style={[styles.menuDots, { color: colors.textSecondary }]}>⋯</Text>
          </Pressable>
        ) : (
          <View style={styles.headerRight} />
        )}
      </View>

      {/* Encryption notice — XMTP-rail chats are end-to-end encrypted */}
      {xmtpActive && (
        <View style={styles.encryptionNotice}>
          <LockIcon width={12} height={12} color={colors.textTertiary} />
          <Text style={[styles.encryptionNoticeText, { color: colors.textTertiary }]}>
            Nachrichten sind mit XMTP verschlüsselt
          </Text>
        </View>
      )}

      {/* Blocked banner */}
      {isBlocked && (
        <View style={[styles.blockedBanner, { backgroundColor: colors.errorBackground }]}>
          <Text style={[styles.blockedText, { color: colors.error }]}>
            Blockiert — du erhältst keine Nachrichten mehr
          </Text>
          <Pressable
            onPress={() => {
              unblockPeer().catch(() => {});
            }}
          >
            <Text style={[styles.blockedAction, { color: colors.primary }]}>Aufheben</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.flex}>
        {isLoadingMessages && messages.length === 0 ? (
          <ChatLoadingSkeletons />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            inverted
            style={styles.flex}
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

        {sendBlocked ? (
          <View style={[styles.inputSafe, { paddingBottom: inputBottomPad, backgroundColor: colors.background }]}>
            <View style={[styles.sendBlockedNotice, { borderTopColor: colors.border }]}>
              <Text style={[styles.sendBlockedText, { color: colors.textSecondary }]}>
                {sendBlocked === 'self'
                  ? 'Aktiviere private Nachrichten in deinem Posteingang, um hier zu schreiben.'
                  : `${peerDisplayName || 'Dieser Kontakt'} hat private Nachrichten noch nicht aktiviert.`}
              </Text>
            </View>
          </View>
        ) : !isBlocked && (
          <View style={[styles.inputSafe, { paddingBottom: inputBottomPad, backgroundColor: colors.background }]}>
            <ChatInput
              onSend={(text, stickerRewardId) => {
                if (!myAccountId) {
                  requireAuth(() => {});
                  return;
                }
                sendMessage(text, stickerRewardId);
              }}
              isSending={isSending}
              onOpenPayment={xmtpActive ? () => setShowPaymentSheet(true) : undefined}
            />
          </View>
        )}
      </View>

      {/* Röbel Münzen senden */}
      <MuenzenSendSheet
        visible={showPaymentSheet}
        onClose={() => setShowPaymentSheet(false)}
        peerName={peerDisplayName}
        onSend={async (amountRaw, amountDecimal) => {
          await sendPayment(amountRaw, amountDecimal);
          showSnackbar({
            message: `${amountDecimal.toLocaleString('de-DE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} Röbel Münzen gesendet`,
          });
        }}
      />

      {/* Reaction picker */}
      <Modal
        visible={!!reactionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionTarget(null)}
      >
        <Pressable style={styles.reactionBackdrop} onPress={() => setReactionTarget(null)}>
          <View style={[styles.reactionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.reactionOption}
                onPress={() => handlePickReaction(emoji)}
              >
                <Text style={styles.reactionOptionText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Chat menu (block/unblock) */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                (isBlocked ? unblockPeer() : blockPeer()).catch(() => {});
              }}
            >
              <Text style={[styles.menuItemText, { color: isBlocked ? colors.textPrimary : colors.error }]}>
                {isBlocked ? 'Blockierung aufheben' : 'Blockieren'}
              </Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => setShowMenu(false)}>
              <Text style={[styles.menuItemText, { color: colors.textSecondary }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  menuDots: {
    fontSize: 24,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 26,
  },
  encryptionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  encryptionNoticeText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  blockedText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    flexShrink: 1,
  },
  blockedAction: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    marginLeft: 12,
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
  sendBlockedNotice: {
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  sendBlockedText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  reactionBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionBar: {
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  reactionOption: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionOptionText: {
    fontSize: 26,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  menuCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  menuItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
});
