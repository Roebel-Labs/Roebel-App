"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useMessagingContext } from "./MessagingProvider";
import { ChatBubble } from "./ChatBubble";
import { MessageInput } from "./MessageInput";
import { ProductContextBanner } from "./ProductContextBanner";
import { getUserByWalletAddress } from "@/lib/supabase-users";
import { formatWalletAddress } from "@/lib/user-types";

interface ChatViewProps {
  conversationId: string;
  peerAddress?: string;
  onBack?: () => void;
  initialMessage?: string | null;
}

export function ChatView({
  conversationId,
  peerAddress,
  onBack,
  initialMessage,
}: ChatViewProps) {
  const { walletAddress } = useMessagingContext();
  const { messages, isLoading, sendMessage } = useMessages(conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [peerInfo, setPeerInfo] = useState<{
    name: string;
    picture: string | null;
  } | null>(null);

  // Resolve peer info
  useEffect(() => {
    async function loadPeerInfo() {
      if (!peerAddress) return;
      try {
        const result = await getUserByWalletAddress(peerAddress);
        if (result.success && result.data) {
          setPeerInfo({
            name: result.data.username || formatWalletAddress(peerAddress),
            picture: result.data.profile_picture_url,
          });
        } else {
          setPeerInfo({
            name: formatWalletAddress(peerAddress),
            picture: null,
          });
        }
      } catch {
        setPeerInfo({
          name: formatWalletAddress(peerAddress),
          picture: null,
        });
      }
    }
    loadPeerInfo();
  }, [peerAddress]);

  // Detect product context from messages
  const [showProductBanner, setShowProductBanner] = useState(true);
  const productContext = useMemo(() => {
    for (const msg of messages) {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed?.type === "product_inquiry" && parsed.listingId) {
          return parsed;
        }
      } catch {
        // Not JSON
      }
    }
    return null;
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const displayName =
    peerInfo?.name || (peerAddress ? formatWalletAddress(peerAddress) : "Chat");
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="border-b border-border bg-card px-3 py-2.5 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground rounded-md transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}
        {peerInfo?.picture ? (
          <img
            src={peerInfo.picture}
            alt={displayName}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs font-medium text-muted-foreground">
              {initials}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {displayName}
          </p>
          {peerAddress && (
            <p className="text-[11px] text-muted-foreground truncate">
              {formatWalletAddress(peerAddress)}
            </p>
          )}
        </div>
      </div>

      {/* Product Context Banner */}
      {productContext && showProductBanner && (
        <ProductContextBanner
          listingId={productContext.listingId}
          title={productContext.title}
          price={productContext.price}
          priceType={productContext.priceType}
          imageUrl={productContext.imageUrl}
          condition={productContext.condition}
          onDismiss={() => setShowProductBanner(false)}
        />
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
              <svg
                className="w-6 h-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground">
              Noch keine Nachrichten. Schreiben Sie die erste!
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isOwn = msg.sender_address === walletAddress;
              let displayContent = msg.content;

              // Convert product inquiry to compact text
              try {
                const parsed = JSON.parse(msg.content);
                if (parsed?.type === "product_inquiry" && parsed.title) {
                  displayContent = `Anfrage zu: ${parsed.title}`;
                }
              } catch {
                // Not JSON — regular text message
              }

              return (
                <ChatBubble
                  key={msg.id}
                  content={displayContent}
                  isOwn={isOwn}
                  timestamp={new Date(msg.created_at)}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <MessageInput onSend={sendMessage} initialValue={initialMessage} />
    </div>
  );
}
