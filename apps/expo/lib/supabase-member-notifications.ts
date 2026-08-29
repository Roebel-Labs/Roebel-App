import { supabase } from './supabase';
import type { UserNotification } from './types';

const PAGE_SIZE = 20;

/** Fetch user notifications (paginated, newest first). */
export async function fetchUserNotifications(
  walletAddress: string,
  page: number = 0
): Promise<{ data: UserNotification[]; hasMore: boolean }> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const { data, error } = await (supabase.from('notifications') as any)
    .select('*')
    .eq('recipient_wallet', walletAddress.toLowerCase())
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('fetchUserNotifications error:', error);
    return { data: [], hasMore: false };
  }

  const results = data as UserNotification[];
  return {
    data: results.slice(0, PAGE_SIZE),
    hasMore: results.length > PAGE_SIZE,
  };
}

/** Mark a single notification as read. */
export async function markNotificationRead(notificationId: string): Promise<void> {
  await (supabase.from('notifications') as any)
    .update({ is_read: true })
    .eq('id', notificationId);
}

/** Mark all notifications as read for a user.
 *  org_invite notifications are excluded: they only flip to is_read=true when
 *  the user explicitly accepts or declines the invitation. */
export async function markAllNotificationsRead(walletAddress: string): Promise<void> {
  await (supabase.from('notifications') as any)
    .update({ is_read: true })
    .eq('recipient_wallet', walletAddress.toLowerCase())
    .eq('is_read', false)
    .neq('type', 'org_invite');
}

/** Get the count of unread notifications. */
export async function getUnreadNotificationCount(walletAddress: string): Promise<number> {
  const { count, error } = await (supabase.from('notifications') as any)
    .select('*', { count: 'exact', head: true })
    .eq('recipient_wallet', walletAddress.toLowerCase())
    .eq('is_read', false);

  if (error) {
    console.error('getUnreadNotificationCount error:', error);
    return 0;
  }

  return count ?? 0;
}

/** An actor (liker/commenter) resolved to a display profile — never a raw wallet. */
export type ActorProfile = {
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  profile_picture_url: string | null;
};

/**
 * Batch-resolve actor wallets (from notification metadata) to display
 * profiles, keyed by lowercased wallet. Missing users are simply absent.
 */
export async function fetchActorProfiles(
  wallets: string[]
): Promise<Map<string, ActorProfile>> {
  const unique = [...new Set(wallets.map((w) => w.toLowerCase()))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('users')
    .select('wallet_address, username, display_name, profile_picture_url')
    .in('wallet_address', unique);

  if (error) {
    console.error('fetchActorProfiles error:', error);
    return new Map();
  }

  return new Map(
    (data ?? []).map((u) => [
      u.wallet_address.toLowerCase(),
      {
        wallet_address: u.wallet_address,
        username: u.username ?? null,
        // display_name → username, mirroring the notification-trigger fallback.
        display_name: u.display_name?.trim() || u.username?.trim() || null,
        profile_picture_url: u.profile_picture_url ?? null,
      },
    ])
  );
}

/** Delete a notification. */
export async function deleteNotification(notificationId: string): Promise<void> {
  await (supabase.from('notifications') as any)
    .delete()
    .eq('id', notificationId);
}
