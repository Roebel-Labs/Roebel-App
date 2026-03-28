/**
 * Push Notifications Hook
 *
 * Manages push notification registration, permissions, and preferences
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerPushToken,
  deactivatePushToken,
  getNotificationPreferences,
  saveNotificationPreferences,
  initializePreferences,
  toggleEventCategory,
  NotificationPreferences,
  DEFAULT_PREFERENCES,
} from '@/lib/supabase-notifications';
import { EventCategory, EVENT_CATEGORIES } from '@/lib/categories';

// AsyncStorage keys for prompt tracking
const PROMPT_SEEN_KEY = '@notification_prompt_seen';
const PROMPT_DISMISSED_KEY = '@notification_prompt_dismissed';

// Configure notification handler at module level
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

export interface UseNotificationsReturn {
  // State
  expoPushToken: string | null;
  permissionStatus: PermissionStatus;
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  error: string | null;
  deviceId: string | null;
  hasSeenPrompt: boolean;
  hasDismissedPrompt: boolean;

  // Actions
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

/**
 * Generate a unique device ID
 */
function getDeviceId(): string {
  // Use a combination of device properties to create a unique ID
  const deviceName = Device.deviceName || 'unknown';
  const osName = Device.osName || Platform.OS;
  const osVersion = Device.osVersion || 'unknown';
  const modelName = Device.modelName || 'unknown';

  // Create a semi-unique identifier (not cryptographically secure, but sufficient for device identification)
  const rawId = `${deviceName}-${modelName}-${osName}-${osVersion}`;

  // Simple hash to create a consistent ID
  let hash = 0;
  for (let i = 0; i < rawId.length; i++) {
    const char = rawId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `device_${Math.abs(hash).toString(36)}`;
}

export function useNotifications(): UseNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [hasSeenPrompt, setHasSeenPrompt] = useState(false);
  const [hasDismissedPrompt, setHasDismissedPrompt] = useState(false);

  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);
  const appState = useRef(AppState.currentState);

  /**
   * Check current permission status
   */
  const checkPermissionStatus = useCallback(async (): Promise<PermissionStatus> => {
    if (!Device.isDevice) {
      return 'denied'; // Push not available on simulator
    }

    const { status } = await Notifications.getPermissionsAsync();

    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  }, []);

  /**
   * Request notification permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    console.log('=== REQUEST PERMISSION ===');
    console.log('Device.isDevice:', Device.isDevice);

    if (!Device.isDevice) {
      console.log('Not a physical device, returning false');
      setError('Push notifications require a physical device');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('Existing permission status:', existingStatus);
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        console.log('Requesting permission from system...');
        const { status } = await Notifications.requestPermissionsAsync();
        console.log('System returned status:', status);
        finalStatus = status;
      }

      const newPermissionStatus: PermissionStatus =
        finalStatus === 'granted' ? 'granted' : 'denied';

      console.log('Final permission status:', newPermissionStatus);
      setPermissionStatus(newPermissionStatus);

      if (finalStatus === 'granted') {
        console.log('Permission granted! Registering token...');
        await registerToken();
        return true;
      }

      console.log('Permission not granted');
      return false;
    } catch (err) {
      console.error('Error requesting permission:', err);
      setError('Failed to request notification permission');
      return false;
    }
  }, []);

  /**
   * Register push token with Expo and save to Supabase
   */
  const registerToken = useCallback(async () => {
    console.log('=== REGISTER TOKEN ===');

    if (!Device.isDevice) {
      console.log('Push notifications not available on simulator/emulator');
      return;
    }

    try {
      // Get project ID from config
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      console.log('EAS Project ID:', projectId);

      if (!projectId) {
        console.error('EAS Project ID not found in app.config.ts');
        setError('Push notification configuration error');
        return;
      }

      // Get Expo push token (this wraps FCM/APNs)
      console.log('Getting Expo push token...');
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const token = tokenData.data;
      console.log('=== EXPO PUSH TOKEN ===');
      console.log(token);
      console.log('========================');
      setExpoPushToken(token);

      // Also get the native device token (FCM for Android, APNs for iOS)
      try {
        const nativeToken = await Notifications.getDevicePushTokenAsync();
        console.log('=== NATIVE DEVICE TOKEN (FCM/APNs) ===');
        console.log('Type:', nativeToken.type);
        console.log('Token:', nativeToken.data);
        console.log('=======================================');
      } catch (nativeErr) {
        console.log('Could not get native token:', nativeErr);
      }

      // Configure Android notification channel
      if (Platform.OS === 'android') {
        console.log('Setting up Android notification channel...');
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#194383',
        });
      }

      // Save token to Supabase
      const id = getDeviceId();
      console.log('Device ID for Supabase:', id);
      setDeviceId(id);

      console.log('Saving token to Supabase...');
      const result = await registerPushToken(
        id,
        token,
        Platform.OS as 'ios' | 'android',
        Constants.expoConfig?.version
      );

      if (!result.success) {
        console.error('Failed to save push token to Supabase:', result.error);
        setError(result.error || 'Failed to save push token');
      } else {
        console.log('Token saved to Supabase successfully');
      }

      // Initialize preferences if needed
      console.log('Initializing preferences...');
      const prefs = await initializePreferences(id);
      console.log('Preferences:', prefs);
      setPreferences(prefs);

      console.log('=== TOKEN REGISTRATION COMPLETE ===');

    } catch (err) {
      console.error('Error registering push token:', err);
      setError('Failed to register for push notifications');
    }
  }, []);

  /**
   * Refresh preferences from Supabase
   */
  const refreshPreferences = useCallback(async () => {
    if (!deviceId) return;

    try {
      const prefs = await getNotificationPreferences(deviceId);
      if (prefs) {
        setPreferences(prefs);
      }
    } catch (err) {
      console.error('Error refreshing preferences:', err);
    }
  }, [deviceId]);

  /**
   * Update a specific preference
   */
  const updatePreference = useCallback(async <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    if (!deviceId || !preferences) return;

    // Optimistic update
    const previousPrefs = preferences;
    setPreferences({ ...preferences, [key]: value });

    const result = await saveNotificationPreferences(deviceId, { [key]: value });

    if (!result.success) {
      // Revert on error
      setPreferences(previousPrefs);
      setError(result.error || 'Failed to save preference');
    }
  }, [deviceId, preferences]);

  /**
   * Toggle an event category
   */
  const toggleCategory = useCallback(async (category: EventCategory) => {
    if (!deviceId || !preferences) return;

    const result = await toggleEventCategory(
      deviceId,
      category,
      preferences.event_categories
    );

    if (result.success) {
      setPreferences({
        ...preferences,
        event_categories: result.newCategories,
      });
    } else {
      setError(result.error || 'Failed to update category');
    }
  }, [deviceId, preferences]);

  /**
   * Disable notifications (deactivate token)
   */
  const disableNotifications = useCallback(async () => {
    if (!deviceId) return;

    const result = await deactivatePushToken(deviceId);

    if (result.success) {
      setExpoPushToken(null);
      setPermissionStatus('denied');
    } else {
      setError(result.error || 'Failed to disable notifications');
    }
  }, [deviceId]);

  /**
   * Mark the notification prompt as seen
   */
  const markPromptAsSeen = useCallback(async () => {
    try {
      await AsyncStorage.setItem(PROMPT_SEEN_KEY, 'true');
      setHasSeenPrompt(true);
    } catch (err) {
      console.error('Error saving prompt seen state:', err);
    }
  }, []);

  /**
   * Mark the notification prompt as dismissed (user clicked "Nein, Danke")
   */
  const markPromptAsDismissed = useCallback(async () => {
    try {
      await AsyncStorage.setItem(PROMPT_DISMISSED_KEY, 'true');
      await AsyncStorage.setItem(PROMPT_SEEN_KEY, 'true');
      setHasDismissedPrompt(true);
      setHasSeenPrompt(true);
    } catch (err) {
      console.error('Error saving prompt dismissed state:', err);
    }
  }, []);

  /**
   * Enable all notifications with default preferences
   */
  const enableAllNotifications = useCallback(async () => {
    if (!deviceId) return;

    try {
      // Enable all notification preferences
      const allEnabledPrefs = {
        events_enabled: true,
        event_categories: [...EVENT_CATEGORIES],
        news_enabled: true,
        news_breaking: true,
        news_featured: true,
      };

      const result = await saveNotificationPreferences(deviceId, allEnabledPrefs);

      if (result.success) {
        setPreferences(prev => prev ? { ...prev, ...allEnabledPrefs } : null);
      } else {
        setError(result.error || 'Failed to enable all notifications');
      }
    } catch (err) {
      console.error('Error enabling all notifications:', err);
      setError('Failed to enable all notifications');
    }
  }, [deviceId]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      setIsLoading(true);
      setError(null);

      // Debug logging
      console.log('=== NOTIFICATIONS DEBUG ===');
      console.log('Device.isDevice:', Device.isDevice);
      console.log('Device.modelName:', Device.modelName);
      console.log('Platform:', Platform.OS);

      try {
        // Load prompt state from AsyncStorage
        const [seenValue, dismissedValue] = await Promise.all([
          AsyncStorage.getItem(PROMPT_SEEN_KEY),
          AsyncStorage.getItem(PROMPT_DISMISSED_KEY),
        ]);

        if (mounted) {
          setHasSeenPrompt(seenValue === 'true');
          setHasDismissedPrompt(dismissedValue === 'true');
        }
        console.log('Prompt seen:', seenValue, 'Prompt dismissed:', dismissedValue);

        // Check current permission status
        const status = await checkPermissionStatus();
        console.log('Permission status:', status);

        if (mounted) {
          setPermissionStatus(status);
        }

        // If permission granted, register token
        if (status === 'granted') {
          console.log('Permission granted, registering token...');
          await registerToken();
        } else {
          console.log('Permission not granted, setting up device ID only');
          // Still set device ID for preferences
          const id = getDeviceId();
          console.log('Device ID:', id);
          if (mounted) {
            setDeviceId(id);
            const prefs = await getNotificationPreferences(id);
            console.log('Loaded preferences:', prefs);
            setPreferences(prefs || {
              device_id: id,
              ...DEFAULT_PREFERENCES,
            });
          }
        }
      } catch (err) {
        console.error('Error initializing notifications:', err);
        if (mounted) {
          setError('Failed to initialize notifications');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          console.log('=== NOTIFICATIONS INIT COMPLETE ===');
        }
      }
    }

    initialize();

    // Set up notification listeners
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification.request.content.title);
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification response:', response.notification.request.content.data);
        // Navigation handled in _layout.tsx NotificationHandler
      }
    );

    // Handle app state changes (re-check permission when app comes to foreground)
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to foreground
        const status = await checkPermissionStatus();
        if (mounted) {
          setPermissionStatus(status);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      mounted = false;

      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      subscription.remove();
    };
  }, []);

  return {
    expoPushToken,
    permissionStatus,
    preferences,
    isLoading,
    error,
    deviceId,
    hasSeenPrompt,
    hasDismissedPrompt,
    requestPermission,
    refreshPreferences,
    updatePreference,
    toggleCategory,
    disableNotifications,
    markPromptAsSeen,
    markPromptAsDismissed,
    enableAllNotifications,
  };
}

export default useNotifications;
