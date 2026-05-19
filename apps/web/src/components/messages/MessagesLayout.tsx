"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useMessagingContext } from "./MessagingProvider";
import { ConversationList } from "./ConversationList";
import { ContactList } from "./ContactList";
import { ChatView } from "./ChatView";
import { useConversations } from "@/hooks/useConversations";
import {
  findPersonalAccountIdByWallet,
  getOrCreateConversation,
  sendMessage,
} from "@/lib/messaging/api";
import { getListingById } from "@/app/actions/marketplace";
import { getConditionLabel } from "@/types/marketplace";
import Link from "next/link";

type Tab = "chats" | "contacts";

interface MessagesLayoutProps {
  /**
   * Deep-link target. Accepts either an account_id (uuid) or a wallet address.
   * If a wallet is provided, we resolve it to the user's personal account id.
   */
  initialTo?: string | null;
  initialSubject?: string | null;
  initialListingId?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePeerAccountId(value: string): Promise<string | null> {
  if (UUID_RE.test(value)) return value;
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return await findPersonalAccountIdByWallet(value);
  }
  return null;
}

export function MessagesLayout({
  initialTo,
  initialSubject,
  initialListingId,
}: MessagesLayoutProps = {}) {
  const account = useActiveAccount();
  const { activeAccountId } = useMessagingContext();
  const { conversations, isLoading: convosLoading } = useConversations();
  const [activeTab, setActiveTab] = useState<Tab>("chats");
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    peerAccountId: string;
  } | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);
  const initiatedRef = useRef(false);

  const initiateDm = useCallback(async () => {
    if (!initialTo || !activeAccountId || initiatedRef.current) return;
    initiatedRef.current = true;

    try {
      const peerAccountId = await resolvePeerAccountId(initialTo);
      if (!peerAccountId) {
        console.warn("Could not resolve peer account for", initialTo);
        return;
      }

      const conversation = await getOrCreateConversation(
        activeAccountId,
        peerAccountId
      );
      setSelectedConversation({ id: conversation.id, peerAccountId });

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
              condition: listing.condition
                ? getConditionLabel(listing.condition)
                : null,
            });
            await sendMessage(conversation.id, activeAccountId, productMsg);
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
  }, [initialTo, initialSubject, initialListingId, activeAccountId]);

  useEffect(() => {
    if (activeAccountId && initialTo) {
      initiateDm();
    }
  }, [activeAccountId, initialTo, initiateDm]);

  // Reset any open conversation when the active account changes — viewing an
  // org's chats and then switching to citizen must not leave the org's open
  // chat visible.
  useEffect(() => {
    setSelectedConversation(null);
    initiatedRef.current = false;
  }, [activeAccountId]);

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

  const handleSelectConversation = (id: string, peerAccountId: string) => {
    setSelectedConversation({ id, peerAccountId });
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
        <ChatView
          conversationId={selectedConversation.id}
          peerAccountId={selectedConversation.peerAccountId}
          onBack={handleBack}
          initialMessage={initialMessage}
        />
      ) : (
        <>
          <div className="px-4 py-3 border-b border-border">
            <h1 className="text-lg font-medium text-foreground">Nachrichten</h1>
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
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                )}
              </button>
            ))}
          </div>

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
