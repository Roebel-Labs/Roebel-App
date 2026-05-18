import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/context/AccountContext';
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
  const { activeAccount } = useAccount();
  const activeAccountId = activeAccount?.id ?? null;

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const accountIdRef = useRef<string | null>(null);

  const loadConversations = useCallback(async (accountId: string) => {
    setIsLoading(true);
    try {
      const convos = await fetchConvos(accountId);
      // Guard against stale loads after an account switch.
      if (accountIdRef.current === accountId) {
        setConversations(convos);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      if (accountIdRef.current === accountId) {
        setIsLoading(false);
      }
    }
  }, []);

  const loadUnreadCount = useCallback(async (accountId: string) => {
    try {
      const count = await fetchUnread(accountId);
      if (accountIdRef.current === accountId) {
        setUnreadCount(count);
      }
    } catch (err) {
      console.error('Failed to load unread count:', err);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const id = accountIdRef.current;
    if (!id) return;
    await Promise.all([loadConversations(id), loadUnreadCount(id)]);
  }, [loadConversations, loadUnreadCount]);

  const handleMarkRead = useCallback((conversationId: string) => {
    const id = accountIdRef.current;
    if (!id) return;
    markRead(conversationId, id);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, hasUnread: false, lastReadAt: new Date().toISOString() } : c
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Load whenever the active account changes (incl. switching between
  // personal and an owned org). Strict scoping: switching the account
  // swaps the inbox entirely.
  useEffect(() => {
    if (!activeAccountId) {
      accountIdRef.current = null;
      setConversations([]);
      setUnreadCount(0);
      return;
    }
    accountIdRef.current = activeAccountId;
    loadConversations(activeAccountId);
    loadUnreadCount(activeAccountId);
  }, [activeAccountId, loadConversations, loadUnreadCount]);

  // Realtime: any new direct_messages insert triggers a refetch scoped to
  // the active account. fetchConversations does the per-account filtering.
  useEffect(() => {
    if (!activeAccountId) return;

    const channel = supabase
      .channel(`messaging-realtime-${activeAccountId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        () => {
          const current = accountIdRef.current;
          if (current) {
            loadConversations(current);
            loadUnreadCount(current);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAccountId, loadConversations, loadUnreadCount]);

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
