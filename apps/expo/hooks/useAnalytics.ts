/**
 * Analytics Hook
 *
 * Provides easy-to-use analytics tracking within components.
 * Integrates with Expo Router for automatic screen tracking.
 */

import { useEffect, useCallback } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import {
  logScreenView,
  logEvent,
  setUserProperty,
  setUserId,
  setAnalyticsCollectionEnabled,
} from '@/lib/firebase';

/**
 * Hook for automatic screen tracking with Expo Router
 *
 * Place this in your root layout to automatically track all screen views
 */
export function useScreenTracking(): void {
  const pathname = usePathname();
  const segments = useSegments();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname) {
      const screenName = getScreenNameFromPath(pathname, segments);
      logScreenView(screenName, getScreenClass(segments));
      posthog?.screen(screenName, { path: pathname });
    }
  }, [pathname, segments, posthog]);
}

/**
 * Convert route path to a readable screen name
 */
function getScreenNameFromPath(pathname: string, segments: string[]): string {
  if (pathname === '/') return 'Home';

  const cleanPath = pathname.slice(1);

  const routeNames: Record<string, string> = {
    index: 'Home',
    location: 'Location',
    profile: 'Profile',
    governance: 'Governance',
    login: 'Login',
    submit: 'Submit Event',
    'submit-event': 'Submit Event Form',
    feedback: 'Feedback',
    notifications: 'Notifications',
    news: 'News List',
    restaurant: 'Restaurants',
    movies: 'Movies',
  };

  if (routeNames[cleanPath]) {
    return routeNames[cleanPath];
  }

  // Handle dynamic routes like /event/[id], /news/[slug]
  if (segments.length >= 2) {
    const [section, param] = segments;

    switch (section) {
      case 'event':
        return 'Event Detail';
      case 'news':
        return param === 'index' ? 'News List' : 'News Article';
      case 'restaurant':
        return param === 'index' ? 'Restaurants' : 'Restaurant Detail';
      case 'category':
        return `Category: ${param}`;
      case 'proposal':
        return 'Proposal Detail';
      case 'movies':
        return param === 'index' ? 'Movies' : 'Movie Detail';
      case 'verification':
        return `Verification: ${param}`;
    }
  }

  // Fallback: capitalize and clean up the path
  return cleanPath
    .split('/')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' - ');
}

/**
 * Get screen class from segments (used for grouping in Firebase)
 */
function getScreenClass(segments: string[]): string {
  if (segments.length === 0) return 'HomeScreen';

  const firstSegment = segments[0];
  return `${firstSegment.charAt(0).toUpperCase()}${firstSegment.slice(1)}Screen`;
}

/**
 * Hook for manual analytics tracking in components
 */
export function useAnalytics() {
  const trackEvent = useCallback(
    async (eventName: string, params?: Record<string, string | number | boolean>) => {
      await logEvent(eventName, params);
    },
    []
  );

  const trackScreenView = useCallback(
    async (screenName: string, screenClass?: string) => {
      await logScreenView(screenName, screenClass);
    },
    []
  );

  const setProperty = useCallback(async (name: string, value: string | null) => {
    await setUserProperty(name, value);
  }, []);

  const setUser = useCallback(async (userId: string | null) => {
    await setUserId(userId);
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    await setAnalyticsCollectionEnabled(enabled);
  }, []);

  return {
    trackEvent,
    trackScreenView,
    setProperty,
    setUser,
    setEnabled,
  };
}

export default useAnalytics;
