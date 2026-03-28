import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '@/lib/supabase';
import {
  fetchConversations as fetchConvos,
  getUnreadCount as fetchUnread,
  markConversationRead as markRead,
  type ConversationWithLastMessage,
} from '@/lib/supabase-messages';

interface MessagingContextValue {
  conversations: ConversationWithLastMessage[];
  unreadCount: number;
  isLoading: boolean;
  refreshConversations: () => Promise<void>;
  markConversationRead: (conversationId: string) => void;
}

const MessagingContext = createContext<MessagingContextValue>({
  conversations: [],
  unreadCount: 0,
  isLoading: false,
  refreshConversations: async () => {},
  markConversationRead: () => {},
});

export function useMessaging() {
  return useContext(MessagingContext);
}

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const addressRef = useRef<string | null>(null);

  const loadConversations = useCallback(async (address: string) => {
    setIsLoading(true);
    try {
      const convos = await fetchConvos(address);
      setConversations(convos);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadUnreadCount = useCallback(async (address: string) => {
    try {
      const count = await fetchUnread(address);
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to load unread count:', err);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const addr = addressRef.current;
    if (!addr) return;
    await Promise.all([loadConversations(addr), loadUnreadCount(addr)]);
  }, [loadConversations, loadUnreadCount]);

  const handleMarkRead = useCallback((conversationId: string) => {
    const addr = addressRef.current;
    if (!addr) return;
    markRead(conversationId, addr);
    // Optimistically update local state
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, hasUnread: false, lastReadAt: new Date().toISOString() } : c
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Load data when wallet connects
  useEffect(() => {
    if (!account?.address) {
      addressRef.current = null;
      setConversations([]);
      setUnreadCount(0);
      return;
    }

    const addr = account.address.toLowerCase();
    addressRef.current = addr;
    loadConversations(addr);
    loadUnreadCount(addr);
  }, [account?.address, loadConversations, loadUnreadCount]);

  // Supabase Realtime: listen for new messages
  useEffect(() => {
    if (!account?.address) return;
    const addr = account.address.toLowerCase();

    const channel = supabase
      .channel('messaging-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        () => {
          // Refresh conversations and unread count on any new message
          loadConversations(addr);
          loadUnreadCount(addr);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account?.address, loadConversations, loadUnreadCount]);

  return (
    <MessagingContext.Provider
      value={{
        conversations,
        unreadCount,
        isLoading,
        refreshConversations,
        markConversationRead: handleMarkRead,
      }}
    >
      {children}
    </MessagingContext.Provider>
  );
}
