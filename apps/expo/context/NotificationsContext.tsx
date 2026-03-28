import React, { createContext, useContext } from 'react';
import useNotifications, { UseNotificationsReturn } from '@/hooks/useNotifications';
import { useNotificationInbox } from '@/hooks/useNotificationInbox';

type NotificationsContextValue = UseNotificationsReturn & {
  unreadCount: number;
  refreshInbox: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const notifications = useNotifications();
  const inbox = useNotificationInbox();

  return (
    <NotificationsContext.Provider value={{ ...notifications, unreadCount: inbox.unreadCount, refreshInbox: inbox.refresh }}>
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
