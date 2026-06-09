import { supabase } from './supabase';
import { EVENT_CATEGORIES, EventCategory } from './categories';
import type { NotificationLogEntry } from './types';

// Types for push notification data
export interface PushToken {
  id?: string;
  device_id: string;
  expo_push_token: string;
  platform: 'ios' | 'android';
  app_version?: string;
  is_active: boolean;
  last_used_at?: string;
  created_at?: string;
}

export interface NotificationPreferences {
  id?: string;
  device_id: string;
  events_enabled: boolean;
  event_categories: EventCategory[];
  news_enabled: boolean;
  news_breaking: boolean;
  news_featured: boolean;
  feed_posts_enabled: boolean;
  dms_enabled: boolean;
  likes_enabled: boolean;
  comments_enabled: boolean;
  org_invites_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

const NOTIFICATION_PAGE_SIZE = 20;

// notification_log is a GLOBAL audit log of every push sent to anyone — it has
// no recipient column. Personal notification types are already delivered to the
// correct user via the per-recipient `notifications` table (see
// useUserNotifications), so surfacing them from the global log would leak other
// people's likes/comments/DMs/invites into everyone's inbox. Only broadcast
// types (feed posts, news, events) legitimately belong to every user, so we
// exclude the personal types here.
const PERSONAL_LOG_TYPES = ['direct_message', 'post_like', 'post_comment', 'org_invite'];

/**
 * Fetch notification log entries for the inbox
 */
export async function fetchNotificationLog(
  page: number = 0
): Promise<{ data: NotificationLogEntry[]; hasMore: boolean }> {
  try {
    const from = page * NOTIFICATION_PAGE_SIZE;
    const to = from + NOTIFICATION_PAGE_SIZE;

    const { data, error } = await (supabase
      .from('notification_log') as any)
      .select('id, notification_type, title, body, data, status, created_at')
      .in('status', ['sent', 'partial'])
      .not('notification_type', 'in', `(${PERSONAL_LOG_TYPES.join(',')})`)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching notification log:', error);
      return { data: [], hasMore: false };
    }

    const entries = (data || []) as NotificationLogEntry[];
    return {
      data: entries.slice(0, NOTIFICATION_PAGE_SIZE),
      hasMore: entries.length > NOTIFICATION_PAGE_SIZE,
    };
  } catch (err) {
    console.error('Exception fetching notification log:', err);
    return { data: [], hasMore: false };
  }
}

export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'device_id'> = {
  events_enabled: true,
  event_categories: [...EVENT_CATEGORIES],
  news_enabled: true,
  news_breaking: true,
  news_featured: false,
  feed_posts_enabled: true,
  dms_enabled: true,
  likes_enabled: true,
  comments_enabled: true,
  org_invites_enabled: true,
};

/**
 * Register or update a push token for a device
 */
export async function registerPushToken(
  deviceId: string,
  expoPushToken: string,
  platform: 'ios' | 'android',
  appVersion?: string,
  walletAddress?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Using 'as any' because push_tokens table types are not yet in the generated schema
    const { error } = await (supabase.from('push_tokens') as any).upsert(
      {
        device_id: deviceId,
        expo_push_token: expoPushToken,
        platform,
        app_version: appVersion,
        is_active: true,
        last_used_at: new Date().toISOString(),
        // Link the device to the logged-in wallet so it can receive targeted
        // pushes (e.g. direct messages). Omitted when no wallet is known yet.
        ...(walletAddress !== undefined
          ? { wallet_address: walletAddress ? walletAddress.toLowerCase() : null }
          : {}),
      },
      {
        onConflict: 'device_id',
      }
    );

    if (error) {
      console.error('Error registering push token:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception registering push token:', err);
    return { success: false, error: 'Failed to register push token' };
  }
}

/**
 * Link (or unlink) a device's push token to the currently logged-in wallet.
 * Called when the wallet becomes available, changes (account switch), or on
 * logout (walletAddress = null). Enables targeting pushes at a specific user.
 */
export async function linkPushTokenWallet(
  deviceId: string,
  walletAddress: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (supabase.from('push_tokens') as any)
      .update({ wallet_address: walletAddress ? walletAddress.toLowerCase() : null })
      .eq('device_id', deviceId);

    if (error) {
      console.error('Error linking push token wallet:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception linking push token wallet:', err);
    return { success: false, error: 'Failed to link push token wallet' };
  }
}

/**
 * Deactivate a push token (e.g., when permission is revoked)
 */
export async function deactivatePushToken(
  deviceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (supabase
      .from('push_tokens') as any)
      .update({ is_active: false })
      .eq('device_id', deviceId);

    if (error) {
      console.error('Error deactivating push token:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception deactivating push token:', err);
    return { success: false, error: 'Failed to deactivate push token' };
  }
}

/**
 * Get notification preferences for a device
 */
export async function getNotificationPreferences(
  deviceId: string
): Promise<NotificationPreferences | null> {
  try {
    const { data, error } = await (supabase
      .from('notification_preferences') as any)
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error) {
      // PGRST116 = not found, which is OK for new users
      if (error.code !== 'PGRST116') {
        console.error('Error fetching notification preferences:', error);
      }
      return null;
    }

    return data as NotificationPreferences;
  } catch (err) {
    console.error('Exception fetching notification preferences:', err);
    return null;
  }
}

/**
 * Save or update notification preferences for a device
 */
export async function saveNotificationPreferences(
  deviceId: string,
  preferences: Partial<Omit<NotificationPreferences, 'device_id' | 'id' | 'created_at' | 'updated_at'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (supabase.from('notification_preferences') as any).upsert(
      {
        device_id: deviceId,
        ...preferences,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'device_id',
      }
    );

    if (error) {
      console.error('Error saving notification preferences:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception saving notification preferences:', err);
    return { success: false, error: 'Failed to save preferences' };
  }
}

/**
 * Initialize default preferences for a new device
 */
export async function initializePreferences(
  deviceId: string
): Promise<NotificationPreferences> {
  const existingPrefs = await getNotificationPreferences(deviceId);

  if (existingPrefs) {
    return existingPrefs;
  }

  // Create default preferences
  await saveNotificationPreferences(deviceId, DEFAULT_PREFERENCES);

  return {
    device_id: deviceId,
    ...DEFAULT_PREFERENCES,
  };
}

/**
 * Update specific preference fields
 */
export async function updatePreference<K extends keyof Omit<NotificationPreferences, 'device_id' | 'id' | 'created_at' | 'updated_at'>>(
  deviceId: string,
  key: K,
  value: NotificationPreferences[K]
): Promise<{ success: boolean; error?: string }> {
  return saveNotificationPreferences(deviceId, { [key]: value });
}

/**
 * Toggle a category in the event_categories array
 */
export async function toggleEventCategory(
  deviceId: string,
  category: EventCategory,
  currentCategories: EventCategory[]
): Promise<{ success: boolean; newCategories: EventCategory[]; error?: string }> {
  const newCategories = currentCategories.includes(category)
    ? currentCategories.filter((c) => c !== category)
    : [...currentCategories, category];

  const result = await saveNotificationPreferences(deviceId, {
    event_categories: newCategories,
  });

  return {
    ...result,
    newCategories,
  };
}
