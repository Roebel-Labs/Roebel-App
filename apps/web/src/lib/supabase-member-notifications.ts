/**
 * User notification queries — mirrors apps/expo/lib/supabase-member-notifications.ts
 */

import { supabase } from "./supabase";
import type { UserNotification } from "@/types/account";

const PAGE_SIZE = 20;

/** Fetch user notifications (paginated, newest first). */
export async function fetchUserNotifications(
  walletAddress: string,
  page = 0
): Promise<{ data: UserNotification[]; hasMore: boolean }> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_wallet", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return { data: [], hasMore: false };

  const results = data as UserNotification[];
  return {
    data: results.slice(0, PAGE_SIZE),
    hasMore: results.length > PAGE_SIZE,
  };
}

/** Mark a single notification as read. */
export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
}

/** Mark all notifications as read for a user. */
export async function markAllNotificationsRead(
  walletAddress: string
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_wallet", walletAddress.toLowerCase())
    .eq("is_read", false);
}

/** Get the count of unread notifications. */
export async function getUnreadNotificationCount(
  walletAddress: string
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_wallet", walletAddress.toLowerCase())
    .eq("is_read", false);

  if (error) return 0;
  return count ?? 0;
}

/** Delete a notification. */
export async function deleteNotification(
  notificationId: string
): Promise<void> {
  await supabase.from("notifications").delete().eq("id", notificationId);
}
