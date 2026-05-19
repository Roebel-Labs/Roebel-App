"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { ContactList } from "./ContactList";
import { ChatView } from "./ChatView";
import { useConversations } from "@/hooks/useConversations";
import { useMessagingContext } from "./MessagingProvider";

type Tab = "chats" | "contacts";

interface ChatSheetPanelProps {
  /** Called when the user presses back from chat-mode back to list-mode. */
  open: boolean;
}

/**
 * The contents of the chat drawer. Manages two internal modes:
 *  - "list": conversation previews + contacts tab
 *  - "chat": single ChatView with back arrow
 *
 * Resets to list-mode whenever the drawer closes or the active account
 * changes (handed in via MessagingContext).
 */
export function ChatSheetPanel({ open }: ChatSheetPanelProps) {
  const { activeAccountId } = useMessagingContext();
  const { conversations, isLoading } = useConversations();
  const [activeTab, setActiveTab] = useState<Tab>("chats");
  const [selected, setSelected] = useState<{
    id: string;
    peerAccountId: string;
  } | null>(null);

  // Reset to list-mode when the drawer closes — next open should start fresh.
  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  // Switching account in the header always returns the panel to its list.
  useEffect(() => {
    setSelected(null);
  }, [activeAccountId]);

  if (selected) {
    return (
      <div className="flex flex-col h-full">
        <ChatView
          conversationId={selected.id}
          peerAccountId={selected.peerAccountId}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "chats", label: "Chats" },
    { key: "contacts", label: "Kontakte" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2 pr-12">
        <h2 className="text-base font-semibold text-foreground">Chats</h2>
      </div>

      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
              activeTab === tab.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "chats" && (
          <ConversationList
            conversations={conversations}
            isLoading={isLoading}
            onSelectConversation={(id, peerAccountId) =>
              setSelected({ id, peerAccountId })
            }
            selectedConversationId={null}
          />
        )}
        {activeTab === "contacts" && (
          <ContactList
            onSelectConversation={(id, peerAccountId) =>
              setSelected({ id, peerAccountId })
            }
          />
        )}
      </div>
    </div>
  );
}

// Re-export the back arrow icon for any external trigger that wants it.
export { ArrowLeft };
