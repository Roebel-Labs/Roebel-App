/**
 * Firebase Analytics Service (Stub Implementation)
 *
 * This is a stub implementation that logs to console in development.
 * To enable real Firebase Analytics:
 * 1. npm install @react-native-firebase/app @react-native-firebase/analytics
 * 2. Add plugins to app.config.ts
 * 3. Use npx expo run:ios (development build required)
 */

const LOG_PREFIX = '[Analytics]';

function devLog(message: string, params?: Record<string, unknown>): void {
  if (__DEV__) {
    if (params) {
      console.log(LOG_PREFIX, message, params);
    } else {
      console.log(LOG_PREFIX, message);
    }
  }
}

/**
 * Log a custom event to Firebase Analytics
 */
export async function logEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): Promise<void> {
  devLog(`Event: ${eventName}`, params);
}

/**
 * Log a screen view event
 */
export async function logScreenView(
  screenName: string,
  screenClass?: string
): Promise<void> {
  devLog(`Screen: ${screenName}`, { screenClass });
}

/**
 * Set a user property for segmentation
 */
export async function setUserProperty(
  name: string,
  value: string | null
): Promise<void> {
  devLog(`User Property: ${name}`, { value });
}

/**
 * Set the user ID for analytics
 */
export async function setUserId(userId: string | null): Promise<void> {
  devLog('Set User ID', { userId });
}

/**
 * Enable or disable analytics collection (useful for GDPR compliance)
 */
export async function setAnalyticsCollectionEnabled(enabled: boolean): Promise<void> {
  devLog('Analytics Collection', { enabled });
}

/**
 * Reset analytics data (useful for user logout)
 */
export async function resetAnalyticsData(): Promise<void> {
  devLog('Reset Analytics Data');
}

// ============================================
// Pre-defined Event Helpers for Common Actions
// ============================================

/**
 * Log when user views an event
 */
export async function logEventView(
  eventId: string,
  eventTitle: string,
  category?: string
): Promise<void> {
  await logEvent('view_event', {
    event_id: eventId,
    event_title: eventTitle,
    category: category || 'unknown',
  });
}

/**
 * Log when user views a news article
 */
export async function logNewsView(slug: string, title: string): Promise<void> {
  await logEvent('view_news', {
    news_slug: slug,
    news_title: title,
  });
}

/**
 * Log when user bookmarks an event
 */
export async function logBookmarkEvent(
  eventId: string,
  action: 'add' | 'remove'
): Promise<void> {
  await logEvent('bookmark_event', {
    event_id: eventId,
    action: action,
  });
}

/**
 * Log when user saves an event to their calendar
 */
export async function logCalendarSave(
  eventId: string,
  eventTitle: string
): Promise<void> {
  await logEvent('save_to_calendar', {
    event_id: eventId,
    event_title: eventTitle,
  });
}

/**
 * Log when user submits an event
 */
export async function logEventSubmission(
  success: boolean,
  method?: string
): Promise<void> {
  await logEvent('submit_event', {
    success: success ? 'true' : 'false',
    method: method || 'manual',
  });
}

/**
 * Log when user views a restaurant
 */
export async function logRestaurantView(slug: string, name: string): Promise<void> {
  await logEvent('view_restaurant', {
    restaurant_slug: slug,
    restaurant_name: name,
  });
}

/**
 * Log search actions
 */
export async function logSearch(query: string, resultCount: number): Promise<void> {
  await logEvent('search_performed', {
    query: query,
    result_count: resultCount,
  });
}

/**
 * Log filter usage
 */
export async function logFilterUsed(
  filterType: string,
  filterValue: string
): Promise<void> {
  await logEvent('filter_used', {
    filter_type: filterType,
    filter_value: filterValue,
  });
}

/**
 * Log notification interaction
 */
export async function logNotificationInteraction(
  action: 'received' | 'opened' | 'dismissed',
  notificationType?: string
): Promise<void> {
  await logEvent('notification_interaction', {
    action: action,
    notification_type: notificationType || 'general',
  });
}
