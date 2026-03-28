/**
 * Web stub for useNotifications hook.
 * Push notifications are not available on web.
 */
import type { NotificationPreferences } from '@/lib/supabase-notifications';
import type { EventCategory } from '@/lib/categories';

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

export interface UseNotificationsReturn {
  expoPushToken: string | null;
  permissionStatus: PermissionStatus;
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  error: string | null;
  deviceId: string | null;
  hasSeenPrompt: boolean;
  hasDismissedPrompt: boolean;
  requestPermission: () => Promise<boolean>;
  refreshPreferences: () => Promise<void>;
  updatePreference: <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => Promise<void>;
  toggleCategory: (category: EventCategory) => Promise<void>;
  disableNotifications: () => Promise<void>;
  markPromptAsSeen: () => Promise<void>;
  markPromptAsDismissed: () => Promise<void>;
  enableAllNotifications: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  return {
    expoPushToken: null,
    permissionStatus: 'denied',
    preferences: null,
    isLoading: false,
    error: null,
    deviceId: null,
    hasSeenPrompt: true,
    hasDismissedPrompt: true,
    requestPermission: async () => false,
    refreshPreferences: async () => {},
    updatePreference: async () => {},
    toggleCategory: async () => {},
    disableNotifications: async () => {},
    markPromptAsSeen: async () => {},
    markPromptAsDismissed: async () => {},
    enableAllNotifications: async () => {},
  };
}

export default useNotifications;
