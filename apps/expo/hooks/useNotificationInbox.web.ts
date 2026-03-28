/**
 * Web stub for useNotificationInbox hook.
 * Push notifications are not available on web.
 */
export function useNotificationInbox() {
  return {
    notifications: [],
    readIds: new Set<string>(),
    isLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    hasMore: false,
    unreadCount: 0,
    refresh: async () => {},
    loadMore: async () => {},
    markAsRead: async () => {},
    markAllAsRead: async () => {},
  };
}
