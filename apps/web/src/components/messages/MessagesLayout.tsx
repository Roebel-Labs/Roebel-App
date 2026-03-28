"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useMessagingContext } from "./MessagingProvider";
import { ConversationList } from "./ConversationList";
import { ContactList } from "./ContactList";
import { ChatView } from "./ChatView";
import { useConversations } from "@/hooks/useConversations";
import { getOrCreateConversation, sendMessage } from "@/lib/messaging/api";
import { getListingById } from "@/app/actions/marketplace";
import { getConditionLabel } from "@/types/marketplace";
import Link from "next/link";

type Tab = "chats" | "contacts";

interface MessagesLayoutProps {
  initialTo?: string | null;
  initialSubject?: string | null;
  initialListingId?: string | null;
}

export function MessagesLayout({ initialTo, initialSubject, initialListingId }: MessagesLayoutProps = {}) {
  const account = useActiveAccount();
  const { walletAddress } = useMessagingContext();
  const { conversations, isLoading: convosLoading, refetch } = useConversations();
  const [activeTab, setActiveTab] = useState<Tab>("chats");
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    peerAddress: string;
  } | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);
  const initiatedRef = useRef(false);

  // Auto-initiate DM when ?to= is provided
  const initiateDm = useCallback(async () => {
    if (!initialTo || !walletAddress || initiatedRef.current) return;
    initiatedRef.current = true;

    try {
      const conversation = await getOrCreateConversation(walletAddress, initialTo);
      setSelectedConversation({ id: conversation.id, peerAddress: initialTo });

      // If coming from marketplace, send structured product inquiry
      if (initialListingId) {
        try {
          const result = await getListingById(initialListingId);
          if (result.success && result.data) {
            const listing = result.data;
            const productMsg = JSON.stringify({
              type: "product_inquiry",
              listingId: listing.id,
              title: listing.title,
              price: listing.price,
              priceType: listing.price_type,
              imageUrl: listing.media_urls?.[0] || null,
              condition: listing.condition ? getConditionLabel(listing.condition) : null,
            });
            await sendMessage(conversation.id, walletAddress, productMsg);
          }
        } catch (err) {
          console.error("Error sending product inquiry:", err);
        }
      } else if (initialSubject) {
        setInitialMessage(`Hallo, ich interessiere mich für: ${initialSubject}`);
      }
    } catch (err) {
      console.error("Error initiating DM:", err);
    }
  }, [initialTo, initialSubject, initialListingId, walletAddress]);

  useEffect(() => {
    if (walletAddress && initialTo) {
      initiateDm();
    }
  }, [walletAddress, initialTo, initiateDm]);

  // Not connected
  if (!account) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-sm w-full text-center">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex justify-center mb-4">
              <svg
                className="w-10 h-10 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium mb-3 text-foreground">
              Anmeldung erforderlich
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Bitte melden Sie sich an, um Nachrichten zu senden.
            </p>
            <Link
              href="/"
              className="inline-block bg-foreground hover:bg-foreground text-white px-5 py-2 rounded-md font-medium transition-colors text-sm"
            >
              Zur Startseite
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSelectConversation = (id: string, peerAddress: string) => {
    setSelectedConversation({ id, peerAddress });
  };

  const handleBack = () => {
    setSelectedConversation(null);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "chats", label: "Chats" },
    { key: "contacts", label: "Kontakte" },
  ];

  return (
    <div className="h-full flex flex-col bg-card">
      {selectedConversation ? (
        /* Chat View — replaces the list */
        <ChatView
          conversationId={selectedConversation.id}
          peerAddress={selectedConversation.peerAddress}
          onBack={handleBack}
          initialMessage={initialMessage}
        />
      ) : (
        /* Conversation List */
        <>
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <h1 className="text-lg font-medium text-foreground">Nachrichten</h1>
          </div>

          {/* Tabs */}
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
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "chats" && (
              <ConversationList
                conversations={conversations}
                isLoading={convosLoading}
                onSelectConversation={handleSelectConversation}
                selectedConversationId={null}
              />
            )}
            {activeTab === "contacts" && (
              <ContactList onSelectConversation={handleSelectConversation} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
