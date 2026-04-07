import React, { createContext, useContext } from 'react';
import useNotifications, { UseNotificationsReturn } from '@/hooks/useNotifications';
import { useNotificationInbox } from '@/hooks/useNotificationInbox';
import useUserNotifications from '@/hooks/useUserNotifications';

type NotificationsContextValue = UseNotificationsReturn & {
  unreadCount: number;
  userUnreadCount: number;
  totalUnreadCount: number;
  refreshInbox: () => Promise<void>;
  refreshUserNotifications: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const notifications = useNotifications();
  const inbox = useNotificationInbox();
  const userNotifs = useUserNotifications();

  return (
    <NotificationsContext.Provider
      value={{
        ...notifications,
        unreadCount: inbox.unreadCount,
        userUnreadCount: userNotifs.unreadCount,
        totalUnreadCount: inbox.unreadCount + userNotifs.unreadCount,
        refreshInbox: inbox.refresh,
        refreshUserNotifications: userNotifs.refresh,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotificationsContext must be used within NotificationsProvider');
  }
  return context;
}
