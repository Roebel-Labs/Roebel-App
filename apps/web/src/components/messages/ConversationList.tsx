"use client";

import { ContactCard } from "./ContactCard";
import { EmptyState } from "./EmptyState";
import type { ConversationWithMeta } from "@/lib/messaging/types";
import { parseListingInquiry, safeDisplayName } from "@/lib/messaging/display";

interface ConversationListProps {
  conversations: ConversationWithMeta[];
  isLoading: boolean;
  onSelectConversation: (conversationId: string, peerAccountId: string) => void;
  selectedConversationId: string | null;
}

function previewFor(message: string | null): string | null {
  if (!message) return null;
  const listing = parseListingInquiry(message);
  if (listing) return `📦 ${listing.title}`;
  return message;
}

export function ConversationList({
  conversations,
  isLoading,
  onSelectConversation,
  selectedConversationId,
}: ConversationListProps) {
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
      {conversations.map((convo) => (
        <ContactCard
          key={convo.conversation.id}
          name={safeDisplayName(convo.peer?.name, convo.peer?.username)}
          profilePictureUrl={convo.peer?.avatarUrl ?? null}
          fallbackLabel={
            convo.peer?.username ? `@${convo.peer.username}` : null
          }
          lastMessage={previewFor(convo.lastMessage)}
          lastMessageTime={convo.lastMessageTime}
          unreadCount={convo.unreadCount}
          isCitizen={convo.peer?.isVerified}
          onClick={() =>
            onSelectConversation(convo.conversation.id, convo.peerAccountId)
          }
          isSelected={selectedConversationId === convo.conversation.id}
        />
      ))}
    </div>
  );
}
