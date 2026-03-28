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
  created_at?: string;
  updated_at?: string;
}

const NOTIFICATION_PAGE_SIZE = 20;

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
};

/**
 * Register or update a push token for a device
 */
export async function registerPushToken(
  deviceId: string,
  expoPushToken: string,
  platform: 'ios' | 'android',
  appVersion?: string
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
