"use client";

import { useEffect } from "react";
import { useMessagingContext } from "@/components/messages/MessagingProvider";
import { getUnreadCount as fetchUnreadCount } from "@/lib/messaging/api";
import { emitUnreadUpdate } from "@/lib/messaging/unread";
import { supabase } from "@/lib/supabase";

/**
 * Background listener mounted at AppShell level.
 * Fetches initial unread count and subscribes to Realtime
 * for new incoming messages to keep the badge updated.
 */
export function MessageNotificationListener() {
  const { walletAddress } = useMessagingContext();

  useEffect(() => {
    if (!walletAddress) return;

    // Fetch initial unread count
    fetchUnreadCount(walletAddress).then((count) => {
      emitUnreadUpdate(count);
    });

    // Subscribe to new messages via Realtime
    const channel = supabase
      .channel("notification-listener")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const msg = payload.new as { sender_address: string };
          // Only increment for messages from others
          if (msg.sender_address !== walletAddress) {
            // Re-fetch accurate count from DB
            fetchUnreadCount(walletAddress).then((count) => {
              emitUnreadUpdate(count);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [walletAddress]);

  return null;
}
