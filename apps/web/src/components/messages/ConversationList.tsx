"use client";

import { ContactCard } from "./ContactCard";
import { EmptyState } from "./EmptyState";
import { getUserByWalletAddress } from "@/lib/supabase-users";
import { useState, useEffect } from "react";
import type { ConversationWithMeta } from "@/lib/messaging/types";

interface ConversationListProps {
  conversations: ConversationWithMeta[];
  isLoading: boolean;
  onSelectConversation: (conversationId: string, peerAddress: string) => void;
  selectedConversationId: string | null;
}

export function ConversationList({
  conversations,
  isLoading,
  onSelectConversation,
  selectedConversationId,
}: ConversationListProps) {
  const [peerNames, setPeerNames] = useState<
    Record<string, { name: string; picture: string | null }>
  >({});

  // Resolve peer addresses to names from Supabase
  useEffect(() => {
    async function resolvePeerNames() {
      const newNames: Record<
        string,
        { name: string; picture: string | null }
      > = {};

      for (const convo of conversations) {
        if (convo.peerAddress && !peerNames[convo.peerAddress]) {
          try {
            const result = await getUserByWalletAddress(convo.peerAddress);
            if (result.success && result.data) {
              newNames[convo.peerAddress] = {
                name: result.data.username || "",
                picture: result.data.profile_picture_url,
              };
            }
          } catch {
            // Ignore
          }
        }
      }

      if (Object.keys(newNames).length > 0) {
        setPeerNames((prev) => ({ ...prev, ...newNames }));
      }
    }

    if (conversations.length > 0) {
      resolvePeerNames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex items-center gap-3 p-3">
            <div className="w-10 h-10 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-2.5 bg-muted rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="Noch keine Unterhaltungen"
        description="Starten Sie eine Unterhaltung über den Kontakte-Tab"
        icon="chat"
      />
    );
  }

  return (
    <div className="divide-y divide-border">
      {conversations.map((convo) => {
        const peer = peerNames[convo.peerAddress];
        // Format product inquiry messages for preview
        let previewMessage = convo.lastMessage;
        if (previewMessage) {
          try {
            const parsed = JSON.parse(previewMessage);
            if (parsed?.type === "product_inquiry" && parsed.title) {
              previewMessage = `📦 ${parsed.title}`;
            }
          } catch {
            // Not JSON, use as-is
          }
        }
        return (
          <ContactCard
            key={convo.conversation.id}
            name={peer?.name || ""}
            address={convo.peerAddress}
            profilePictureUrl={peer?.picture || null}
            lastMessage={previewMessage}
            lastMessageTime={convo.lastMessageTime}
            unreadCount={convo.unreadCount}
            onClick={() =>
              onSelectConversation(convo.conversation.id, convo.peerAddress)
            }
            isSelected={selectedConversationId === convo.conversation.id}
          />
        );
      })}
    </div>
  );
}
