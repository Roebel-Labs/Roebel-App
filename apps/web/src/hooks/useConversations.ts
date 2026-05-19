"use client";

import { useState, useEffect, useCallback } from "react";
import { useMessagingContext } from "@/components/messages/MessagingProvider";
import { getConversationsForUser } from "@/lib/messaging/api";
import { supabase } from "@/lib/supabase";
import type { ConversationWithMeta } from "@/lib/messaging/types";
import { UNREAD_EVENT, emitUnreadUpdate } from "@/lib/messaging/unread";

export function useConversations() {
  const { activeAccountId } = useMessagingContext();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!activeAccountId) {
      setConversations([]);
      emitUnreadUpdate(0);
      setIsLoading(false);
      return;
    }

    try {
      const convos = await getConversationsForUser(activeAccountId);
      setConversations(convos);

      const totalUnread = convos.reduce((sum, c) => sum + c.unreadCount, 0);
      emitUnreadUpdate(totalUnread);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeAccountId]);

  // Reset state immediately when the active account changes so the consumer
  // never sees stale conversations from the previous account.
  useEffect(() => {
    setConversations([]);
    setIsLoading(true);
    fetchConversations();
  }, [fetchConversations]);

  // Subscribe to Realtime for new messages. The channel name is keyed on the
  // account id so switching account creates a fresh subscription.
  useEffect(() => {
    if (!activeAccountId) return;

    const channel = supabase
      .channel(`conversations-listener:${activeAccountId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAccountId, fetchConversations]);

  // Drop the global unread count when there is no active account.
  useEffect(() => {
    if (!activeAccountId) emitUnreadUpdate(0);
    // Read once to silence the unused-var lint warning for the import.
    void UNREAD_EVENT;
  }, [activeAccountId]);

  return { conversations, isLoading, refetch: fetchConversations };
}
