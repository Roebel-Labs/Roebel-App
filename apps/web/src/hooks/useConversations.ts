"use client";

import { useState, useEffect, useCallback } from "react";
import { useMessagingContext } from "@/components/messages/MessagingProvider";
import { getConversationsForUser } from "@/lib/messaging/api";
import { supabase } from "@/lib/supabase";
import type { ConversationWithMeta } from "@/lib/messaging/types";
import { UNREAD_EVENT, emitUnreadUpdate } from "@/lib/messaging/unread";

export function useConversations() {
  const { walletAddress } = useMessagingContext();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const convos = await getConversationsForUser(walletAddress);
      setConversations(convos);

      // Update global unread count
      const totalUnread = convos.reduce((sum, c) => sum + c.unreadCount, 0);
      emitUnreadUpdate(totalUnread);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Subscribe to Realtime for new messages
  useEffect(() => {
    if (!walletAddress) return;

    const channel = supabase
      .channel("conversations-listener")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        () => {
          // Refetch conversations when any new message arrives
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [walletAddress, fetchConversations]);

  return { conversations, isLoading, refetch: fetchConversations };
}
