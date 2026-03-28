import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNotificationInbox } from '@/hooks/useNotificationInbox';
import NotificationCard from '@/components/NotificationCard';
import { NotificationCardSkeleton } from '@/components/SkeletonLoader';
import type { NotificationLogEntry } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';

export default function NotificationsInboxScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    notifications,
    readIds,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    refresh,
    loadMore,
    markAsRead,
  } = useNotificationInbox();

  const handleNotificationPress = (notification: NotificationLogEntry) => {
    markAsRead(notification.id);
  };

  const renderItem = ({ item }: { item: NotificationLogEntry }) => (
    <NotificationCard
      notification={item}
      isRead={readIds.has(item.id)}
      onPress={handleNotificationPress}
    />
  );

  const renderHeader = () => (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Benachrichtigungen</Text>
      <Pressable
        onPress={() => router.push('/notifications/settings' as any)}
        style={styles.settingsButton}
      >
        <NotificationIcon width={20} height={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={styles.flex1}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <NotificationCardSkeleton key={i} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Keine Benachrichtigungen</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Neue Benachrichtigungen erscheinen hier
            </Text>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
        contentContainerStyle={notifications.length === 0 ? { flex: 1 } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-Medium' },
  settingsButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Medium', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center' },
  loader: { padding: 20 },
  footerSpacer: { height: 100 },
});
