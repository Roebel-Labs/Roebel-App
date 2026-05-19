import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useMessaging } from '@/context/MessagingContext';
import { useTheme } from '@/context/ThemeContext';
import ConversationListItem from '@/components/messages/ConversationListItem';
import ConversationRowSkeleton from '@/components/messages/ConversationRowSkeleton';
import type { ConversationWithLastMessage } from '@/lib/supabase-messages';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PencilIcon from '@/assets/icons/pencil.svg';

function MeckyRow() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.meckyRow,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
      onPress={() => router.push('/messages/mecky' as any)}
    >
      <Image
        source={require('@/assets/illustration/mecky/welcome.png')}
        style={styles.meckyAvatar}
        contentFit="cover"
      />
      <View style={styles.meckyContent}>
        <Text style={[styles.meckyName, { color: colors.textPrimary }]}>Mecky</Text>
        <Text style={[styles.meckySubtitle, { color: colors.textSecondary }]}>
          Dein KI-Assistent
        </Text>
      </View>
      <View style={[styles.meckyBadge, { backgroundColor: colors.primary }]}>
        <Text style={[styles.meckyBadgeText, { color: colors.onPrimary }]}>KI</Text>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const {
    conversations,
    isLoading,
    refreshConversations,
  } = useMessaging();

  const isConnected = !!account;

  const renderConversation = ({ item }: { item: ConversationWithLastMessage }) => (
    <ConversationListItem
      conversation={item}
      onPress={() => router.push(`/messages/${item.id}` as any)}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nachrichten</Text>
        {isConnected ? (
          <Pressable
            onPress={() => router.push('/messages/new' as any)}
            style={styles.actionButton}
          >
            <PencilIcon width={20} height={20} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.actionButton} />
        )}
      </View>

      {/* Content */}
      {!isConnected ? (
        <View style={styles.notConnectedContent}>
          <MeckyRow />
          <View style={styles.notConnected}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Bitte anmelden
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Melden Sie sich an, um Nachrichten zu senden und zu empfangen
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.loginButton,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => router.push('/profile' as any)}
            >
              <Text style={[styles.loginButtonText, { color: colors.onPrimary }]}>Anmelden</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          ListHeaderComponent={<MeckyRow />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && conversations.length > 0}
              onRefresh={refreshConversations}
              tintColor={colors.primary}
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
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  Keine Nachrichten
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  Starten Sie eine neue Unterhaltung
                </Text>
              </View>
            )
          }
          contentContainerStyle={
            conversations.length === 0 && !isLoading ? styles.emptyContainer : undefined
          }
          ListFooterComponent={<View style={styles.bottomPadding} />}
        />
      )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  actionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  meckyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  meckyAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  meckyContent: {
    flex: 1,
    gap: 2,
  },
  meckyName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  meckySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  meckyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  meckyBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
  },
  notConnectedContent: {
    flex: 1,
  },
  notConnected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loginButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 20,
  },
  loginButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  bottomPadding: {
    height: 100,
  },
});
