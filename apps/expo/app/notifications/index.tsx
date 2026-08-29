import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useNotificationsContext } from '@/context/NotificationsContext';
import InviteNotificationCard from '@/components/InviteNotificationCard';
import ActivityRow from '@/components/ActivityRow';
import { NotificationCardSkeleton } from '@/components/SkeletonLoader';
import { BookIcon, CalendarIcon } from '@/components/Icons';
import {
  activityKindForType,
  cleanNotificationTitle,
  notificationActionLabel,
  notificationPreview,
} from '@/lib/notification-display';
import { fetchActorProfiles, type ActorProfile } from '@/lib/supabase-member-notifications';
import type { NotificationLogEntry, UserNotification } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';

type MergedItem =
  | { kind: 'push'; data: NotificationLogEntry }
  | { kind: 'user'; data: UserNotification };

type ActivityFilter = 'all' | 'likes' | 'comments' | 'invites' | 'news';

const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'likes', label: 'Gefällt mir' },
  { key: 'comments', label: 'Kommentare' },
  { key: 'invites', label: 'Einladungen' },
  { key: 'news', label: 'News' },
];

const EMPTY_COPY: Record<ActivityFilter, { title: string; subtitle: string }> = {
  all: {
    title: 'Keine Aktivität',
    subtitle: 'Likes, Kommentare und Einladungen erscheinen hier',
  },
  likes: {
    title: 'Noch keine Likes',
    subtitle: 'Wenn jemandem deine Beiträge oder Kommentare gefallen, siehst du es hier',
  },
  comments: {
    title: 'Noch keine Kommentare',
    subtitle: 'Kommentare und Antworten auf deine Beiträge erscheinen hier',
  },
  invites: {
    title: 'Keine Einladungen',
    subtitle: 'Einladungen von Organisationen erscheinen hier',
  },
  news: {
    title: 'Keine Mitteilungen',
    subtitle: 'Neuigkeiten und Veranstaltungen aus Röbel erscheinen hier',
  },
};

function matchesFilter(item: MergedItem, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  if (item.kind === 'push') return filter === 'news';
  const kind = activityKindForType(item.data.type);
  if (filter === 'likes') return kind === 'like';
  if (filter === 'comments') return kind === 'comment';
  if (filter === 'invites') return kind === 'invite';
  return false;
}

export default function NotificationsInboxScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { inbox: pushInbox, userNotifs, markAllAsRead } = useNotificationsContext();
  const [filter, setFilter] = useState<ActivityFilter>('all');

  // Clear the header badge whenever the inbox is focused. Both server-side
  // (user notifications) and local (push log readIds) state are flipped to
  // read; new notifications arriving after this point will re-show the count.
  useFocusEffect(
    useCallback(() => {
      markAllAsRead();
    }, [markAllAsRead])
  );

  const isLoading = pushInbox.isLoading || userNotifs.isLoading;
  const isRefreshing = pushInbox.isRefreshing || userNotifs.isRefreshing;

  // Resolve actor wallets (metadata.actor_wallet) to avatars + display names.
  // Fetched wallets are tracked so newly loaded pages only query the delta.
  const [actorProfiles, setActorProfiles] = useState<Map<string, ActorProfile>>(new Map());
  const fetchedWalletsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending = userNotifs.notifications
      .map((n) => (n.metadata as { actor_wallet?: string } | undefined)?.actor_wallet)
      .filter((w): w is string => typeof w === 'string' && w.length > 0)
      .map((w) => w.toLowerCase())
      .filter((w) => !fetchedWalletsRef.current.has(w));
    if (pending.length === 0) return;
    pending.forEach((w) => fetchedWalletsRef.current.add(w));
    fetchActorProfiles(pending).then((profiles) => {
      if (profiles.size === 0) return;
      setActorProfiles((prev) => new Map([...prev, ...profiles]));
    });
  }, [userNotifs.notifications]);

  // Merge both notification sources chronologically
  const merged = useMemo<MergedItem[]>(() => {
    const pushItems: MergedItem[] = pushInbox.notifications.map((n) => ({ kind: 'push', data: n }));
    const userItems: MergedItem[] = userNotifs.notifications.map((n) => ({ kind: 'user', data: n }));
    return [...pushItems, ...userItems].sort(
      (a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime()
    );
  }, [pushInbox.notifications, userNotifs.notifications]);

  const filtered = useMemo(
    () => merged.filter((item) => matchesFilter(item, filter)),
    [merged, filter]
  );

  const handleRefresh = async () => {
    await Promise.all([pushInbox.refresh(), userNotifs.refresh()]);
  };

  const handleLoadMore = () => {
    if (pushInbox.hasMore) pushInbox.loadMore();
    if (userNotifs.hasMore) userNotifs.loadMore();
  };

  const handlePushPress = (notification: NotificationLogEntry) => {
    pushInbox.markAsRead(notification.id);

    const data = notification.data as
      | {
          type?: string;
          eventId?: string;
          slug?: string;
          postId?: string;
          conversationId?: string;
          [key: string]: unknown;
        }
      | null;

    switch (data?.type) {
      case 'event':
        if (data.eventId) router.push(`/event/${data.eventId}` as any);
        break;
      case 'news':
        if (data.slug) router.push(`/news/${data.slug}` as any);
        break;
      case 'post':
      case 'post_like':
      case 'post_comment':
        if (data.postId) router.push(`/post/${data.postId}` as any);
        break;
      case 'direct_message':
        if (data.conversationId) router.push(`/messages/${data.conversationId}` as any);
        break;
      // org_invite is actioned via the in-app InviteNotificationCard in the
      // same inbox; tapping the push entry has no separate destination.
      default:
        break;
    }
  };

  const handleUserNotifPress = (notification: UserNotification) => {
    if (!notification.is_read) userNotifs.markAsRead(notification.id);
    const postId = (notification.metadata as { post_id?: string } | undefined)?.post_id;
    if (postId) router.push(`/post/${postId}` as any);
    else if (notification.type === 'story_invite' || notification.type === 'foerder_invite')
      router.push('/messages/mecky' as any);
  };

  const renderItem = ({ item }: { item: MergedItem }) => {
    if (item.kind === 'push') {
      const isNews = item.data.notification_type.startsWith('news');
      return (
        <ActivityRow
          name={cleanNotificationTitle(item.data.title, item.data.notification_type)}
          timestamp={item.data.created_at}
          kind="news"
          iconAvatar={
            isNews ? (
              <BookIcon size={18} color={colors.primary} />
            ) : (
              <CalendarIcon size={18} color={colors.primary} />
            )
          }
          preview={notificationPreview(item.data.notification_type, item.data.body)}
          unread={!pushInbox.readIds.has(item.data.id)}
          onPress={() => handlePushPress(item.data)}
        />
      );
    }

    if (item.data.type === 'org_invite') {
      return (
        <InviteNotificationCard
          notification={item.data}
          onAccept={userNotifs.acceptInvite}
          onDecline={userNotifs.declineInvite}
        />
      );
    }

    const actorWallet = (
      item.data.metadata as { actor_wallet?: string } | undefined
    )?.actor_wallet?.toLowerCase();
    const profile = actorWallet ? actorProfiles.get(actorWallet) : undefined;
    // The DB trigger stores the actor's display name as the title, so it is
    // the fallback while (or if) the profile lookup hasn't resolved.
    const name = profile?.display_name ?? cleanNotificationTitle(item.data.title, item.data.type);

    return (
      <ActivityRow
        name={name}
        timestamp={item.data.created_at}
        kind={activityKindForType(item.data.type)}
        avatarUri={profile?.profile_picture_url}
        fallbackInitial={name.charAt(0).toUpperCase()}
        action={notificationActionLabel(item.data.type)}
        preview={notificationPreview(item.data.type, item.data.body)}
        unread={!item.data.is_read}
        onPress={() => handleUserNotifPress(item.data)}
        onPressAvatar={
          profile?.username
            ? () =>
                router.push({
                  pathname: '/user/[username]',
                  params: { username: profile.username! },
                })
            : undefined
        }
      />
    );
  };

  const emptyCopy = EMPTY_COPY[filter];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/notifications/settings' as any)}
          style={styles.settingsButton}
          hitSlop={8}
        >
          <NotificationIcon width={20} height={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Aktivität</Text>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {FILTERS.map(({ key, label }) => {
            const active = key === filter;
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                style={[
                  styles.chip,
                  active
                    ? { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }
                    : { borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: active ? colors.background : colors.textPrimary },
                    active && styles.chipLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.flex1}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <NotificationCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.kind}-${item.data.id}`}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{emptyCopy.title}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {emptyCopy.subtitle}
              </Text>
            </View>
          }
          ListFooterComponent={
            pushInbox.isLoadingMore || userNotifs.isLoadingMore ? (
              <ActivityIndicator style={styles.loader} color={colors.primary} />
            ) : (
              <View style={styles.footerSpacer} />
            )
          }
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  settingsButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  pageTitle: {
    fontSize: 30,
    fontFamily: fontFamily.heading,
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 14,
  },
  chipsWrap: { marginBottom: 4 },
  chipsContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  chipLabelActive: {
    fontFamily: fontFamily.semiBold,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontFamily: fontFamily.medium, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontFamily: fontFamily.regular, textAlign: 'center' },
  loader: { padding: 20 },
  footerSpacer: { height: 100 },
});
