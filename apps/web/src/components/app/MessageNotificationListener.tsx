"use client";

import { useEffect } from "react";
import { useMessagingContext } from "@/components/messages/MessagingProvider";
import { getUnreadCount as fetchUnreadCount } from "@/lib/messaging/api";
import { emitUnreadUpdate } from "@/lib/messaging/unread";
import { supabase } from "@/lib/supabase";

/**
 * Background listener mounted at AppShell level. Fetches initial unread count
 * for the ACTIVE account and subscribes to Realtime for new incoming messages
 * to keep the badge updated. Re-subscribes when the user switches account.
 */
export function MessageNotificationListener() {
  const { activeAccountId } = useMessagingContext();

  useEffect(() => {
    if (!activeAccountId) {
      emitUnreadUpdate(0);
      return;
    }

    fetchUnreadCount(activeAccountId).then((count) => {
      emitUnreadUpdate(count);
    });

    const channel = supabase
      .channel(`notification-listener:${activeAccountId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const msg = payload.new as { sender_account_id: string };
          if (msg.sender_account_id !== activeAccountId) {
            fetchUnreadCount(activeAccountId).then((count) => {
              emitUnreadUpdate(count);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAccountId]);

  return null;
}
