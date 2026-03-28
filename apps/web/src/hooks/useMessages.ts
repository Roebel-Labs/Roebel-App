"use client";

import { useState, useEffect, useCallback } from "react";
import { useMessagingContext } from "@/components/messages/MessagingProvider";
import {
  getMessages,
  sendMessage as apiSendMessage,
  markConversationRead,
} from "@/lib/messaging/api";
import { supabase } from "@/lib/supabase";
import type { Message } from "@/lib/messaging/types";

export function useMessages(conversationId: string | null) {
  const { walletAddress } = useMessagingContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load messages
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const msgs = await getMessages(conversationId!);
        if (!cancelled) setMessages(msgs);
      } catch (err) {
        console.error("Error loading messages:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Subscribe to Realtime for new messages in this conversation
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Mark as read when messages change
  useEffect(() => {
    if (messages.length > 0 && conversationId && walletAddress) {
      markConversationRead(conversationId, walletAddress);
    }
  }, [messages, conversationId, walletAddress]);

  // Send a text message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversationId || !walletAddress || !text.trim()) return;
      await apiSendMessage(conversationId, walletAddress, text.trim());
    },
    [conversationId, walletAddress]
  );

  return { messages, isLoading, sendMessage };
}
