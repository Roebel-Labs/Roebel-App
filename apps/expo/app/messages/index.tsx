import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { Feather } from '@expo/vector-icons';
import { useMessaging } from '@/context/MessagingContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import ConversationListItem, {
  AVATAR_SIZE,
  AVATAR_RADIUS,
} from '@/components/messages/ConversationListItem';
import ConversationRowSkeleton from '@/components/messages/ConversationRowSkeleton';
import MessagingContactsRow from '@/components/messages/MessagingContactsRow';
import { BlackPillButton } from '@/components/chat/BlackPillButton';
import { GlassCircleButton } from '@/components/chat/GlassCircleButton';
import { chatFont, haloShadow, useChatTokens } from '@/components/chat/tokens';
import { useXmtp } from '@/context/XmtpContext';
import { useAccount } from '@/context/AccountContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { XMTP_PASSKEY_LINK_HINT } from '@/lib/xmtp/passkey-link';
import { useNotificationsContext } from '@/context/NotificationsContext';
import {
  fetchPersonalAccountIdByWallet,
  findOrCreateConversation,
  type ConversationWithLastMessage,
  type MessagingContact,
} from '@/lib/supabase-messages';

function MeckyRow() {
  const router = useRouter();
  const t = useChatTokens();

  return (
    <Pressable
      style={({ pressed }) => [styles.meckyRow, pressed && { backgroundColor: t.chipBackground }]}
      onPress={() => router.push('/messages/mecky' as any)}
      accessibilityRole="button"
      accessibilityLabel="Mecky, dein KI-Assistent"
    >
      <Image
        source={require('@/assets/illustration/mecky/welcome.png')}
        style={[styles.meckyAvatar, { backgroundColor: t.chipBackground }]}
        contentFit="cover"
      />
      <View style={styles.meckyContent}>
        <Text style={[styles.meckyName, { color: t.textPrimary }]}>Mecky</Text>
        <Text style={[styles.meckySubtitle, { color: t.textSecondary }]}>
          Dein KI-Assistent
        </Text>
      </View>
      <View style={[styles.meckyBadge, { backgroundColor: t.chipBackground }]}>
        <Text style={[styles.meckyBadgeText, { color: t.chipText }]}>KI</Text>
      </View>
    </Pressable>
  );
}

/** Floating white card with the soft halo — replaces the old full-width strips. */
function InboxBanner({
  text,
  action,
  busy,
  onPress,
  label,
}: {
  text: string;
  action?: string;
  busy?: boolean;
  onPress: () => void;
  label: string;
}) {
  const t = useChatTokens();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: t.surface, transform: [{ scale: pressed ? 0.98 : 1 }] },
        haloShadow(t),
      ]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.bannerText, { color: t.textPrimary }]}>{text}</Text>
      {busy ? (
        <ActivityIndicator size="small" color={t.textPrimary} />
      ) : action ? (
        <Text style={[styles.bannerAction, { color: t.link }]}>{action}</Text>
      ) : null}
    </Pressable>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const account = useActiveAccount();
  const requireAuth = useRequireAuth();
  const {
    conversations,
    isLoading,
    refreshConversations,
  } = useMessaging();

  const isConnected = !!account;

  // While this device hasn't registered its XMTP inbox yet, a banner offers
  // the one-time "Private Nachrichten aktivieren" — the inbox itself (Supabase
  // rail) works regardless.
  const { activationAvailable, activating, activate, passkeyLinkNeeded } = useXmtp();
  const { activeAccount } = useAccount();
  const { showSnackbar } = useSnackbar();
  const [openingWallet, setOpeningWallet] = useState<string | null>(null);

  const handleActivate = async () => {
    const ok = await activate();
    showSnackbar({
      message: ok ? 'Private Nachrichten aktiviert' : 'Aktivierung derzeit nicht möglich',
    });
  };

  const handleOpenContact = async (contact: MessagingContact) => {
    if (!activeAccount?.id || openingWallet) return;
    setOpeningWallet(contact.wallet);
    try {
      const peerId = await fetchPersonalAccountIdByWallet(contact.wallet);
      if (!peerId || peerId === activeAccount.id) return;
      const convo = await findOrCreateConversation(activeAccount.id, peerId);
      if (convo) router.push(`/messages/${convo.id}` as any);
    } catch (err) {
      console.error('Failed to open contact chat:', err);
      showSnackbar({ message: 'Chat konnte nicht geöffnet werden' });
    } finally {
      setOpeningWallet(null);
    }
  };

  // DM pushes die silently when the OS permission is missing (e.g. a fresh
  // install leaves a stale token linked to the wallet). Opening the inbox is
  // the natural moment to (re-)ask — one OS prompt per visit at most, plus a
  // persistent banner that falls back to the system settings.
  const { permissionStatus, requestPermission } = useNotificationsContext();
  const askedRef = useRef(false);
  useEffect(() => {
    if (!isConnected || permissionStatus === 'granted' || askedRef.current) return;
    askedRef.current = true;
    void requestPermission();
  }, [isConnected, permissionStatus, requestPermission]);

  const handleEnablePush = async () => {
    const ok = await requestPermission();
    if (!ok) Linking.openSettings().catch(() => {});
  };

  const renderConversation = ({ item }: { item: ConversationWithLastMessage }) => (
    <ConversationListItem
      conversation={item}
      onPress={() => router.push(`/messages/${item.id}` as any)}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      {/* Floating controls (Mecky-chat style) */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <GlassCircleButton accessibilityLabel="Zurück" onPress={() => router.back()}>
          <Feather name="chevron-left" size={26} color={t.icon} />
        </GlassCircleButton>
        {isConnected ? (
          <GlassCircleButton
            accessibilityLabel="Neue Nachricht"
            onPress={() => router.push('/messages/new' as any)}
          >
            <Feather name="edit-2" size={20} color={t.icon} />
          </GlassCircleButton>
        ) : null}
      </View>

      {!isConnected ? (
        <View style={styles.flex}>
          <Text style={[styles.largeTitle, { color: t.textPrimary }]}>Nachrichten</Text>
          <MeckyRow />
          <View style={styles.notConnected}>
            <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Bitte anmelden</Text>
            <Text style={[styles.emptySubtext, { color: t.textSecondary }]}>
              Melde dich an, um Nachrichten zu senden und zu empfangen.
            </Text>
            <BlackPillButton
              label="Anmelden"
              onPress={() => requireAuth(() => {})}
              style={styles.loginButton}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          ListHeaderComponent={
            <>
              <Text style={[styles.largeTitle, { color: t.textPrimary }]}>Nachrichten</Text>
              {activationAvailable && (
                <InboxBanner
                  text="Ende-zu-Ende-verschlüsselte Nachrichten"
                  action="Aktivieren"
                  busy={activating}
                  onPress={handleActivate}
                  label="Private Nachrichten aktivieren"
                />
              )}
              {passkeyLinkNeeded && (
                // Passkey session on a migrated account: the E2E rail waits for the Safe
                // link; the Supabase rail keeps working.
                <InboxBanner
                  text={XMTP_PASSKEY_LINK_HINT}
                  onPress={() => router.push('/settings/passkey' as any)}
                  label="Nachrichten auf Passkey übertragen"
                />
              )}
              {permissionStatus !== 'granted' && (
                <InboxBanner
                  text="Push-Benachrichtigungen sind aus"
                  action="Aktivieren"
                  onPress={handleEnablePush}
                  label="Push-Benachrichtigungen aktivieren"
                />
              )}
              <MessagingContactsRow onPress={handleOpenContact} openingWallet={openingWallet} />
              <MeckyRow />
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading && conversations.length > 0}
              onRefresh={refreshConversations}
              tintColor={t.textSecondary}
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <View>
                {Array.from({ length: 5 }).map((_, i) => (
                  <ConversationRowSkeleton key={i} />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Keine Nachrichten</Text>
                <Text style={[styles.emptySubtext, { color: t.textSecondary }]}>
                  Tippe oben rechts auf den Stift, um zu starten.
                </Text>
              </View>
            )
          }
          contentContainerStyle={{
            paddingTop: insets.top + 8 + 44 + 4,
            paddingBottom: insets.bottom + 32,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
    paddingTop: 64,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  largeTitle: {
    fontSize: 30,
    fontFamily: chatFont.bold,
    letterSpacing: -0.6,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  meckyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 15,
  },
  meckyAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_RADIUS,
    borderCurve: 'continuous',
  },
  meckyContent: {
    flex: 1,
    gap: 4,
  },
  meckyName: {
    fontSize: 17,
    fontFamily: chatFont.medium,
    letterSpacing: -0.2,
  },
  meckySubtitle: {
    fontSize: 16,
    fontFamily: chatFont.regular,
  },
  meckyBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  meckyBadgeText: {
    fontSize: 12,
    fontFamily: chatFont.semiBold,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 18,
    marginVertical: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    gap: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: chatFont.regular,
  },
  bannerAction: {
    fontSize: 15,
    fontFamily: chatFont.semiBold,
  },
  notConnected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loginButton: {
    marginTop: 24,
    alignSelf: 'stretch',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: chatFont.medium,
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 15,
    fontFamily: chatFont.regular,
    textAlign: 'center',
  },
});
