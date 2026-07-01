"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useMessagingContext } from "./MessagingProvider";
import { ChatBubble } from "./ChatBubble";
import { MessageInput } from "./MessageInput";
import { ProductContextBanner } from "./ProductContextBanner";
import { supabase } from "@/lib/supabase";
import { safeDisplayName, parseListingInquiry } from "@/lib/messaging/display";

interface ChatViewProps {
  conversationId: string;
  peerAccountId?: string | null;
  onBack?: () => void;
  initialMessage?: string | null;
}

interface PeerAccountInfo {
  name: string;
  avatarUrl: string | null;
  username: string | null;
}

export function ChatView({
  conversationId,
  peerAccountId,
  onBack,
  initialMessage,
}: ChatViewProps) {
  const { activeAccountId } = useMessagingContext();
  const { messages, isLoading, sendMessage } = useMessages(conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [peerInfo, setPeerInfo] = useState<PeerAccountInfo | null>(null);

  // Resolve peer info from the accounts table (+users for username/picture).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!peerAccountId) return;
      try {
        const { data: account } = await supabase
          .from("accounts")
          .select("id, name, avatar_url, account_type")
          .eq("id", peerAccountId)
          .single();

        if (!account) {
          if (!cancelled) {
            setPeerInfo({ name: "Unbekannt", avatarUrl: null, username: null });
          }
          return;
        }

        let username: string | null = null;
        let profilePicture: string | null = null;

        if (account.account_type === "personal") {
          const { data: owners } = await supabase
            .from("account_owners")
            .select("wallet_address")
            .eq("account_id", peerAccountId)
            .limit(1);
          const wallet = owners?.[0]?.wallet_address;
          if (wallet) {
            const { data: user } = await supabase
              .from("users")
              .select("username, profile_picture_url")
              .eq("wallet_address", wallet)
              .single();
            username = user?.username ?? null;
            profilePicture = user?.profile_picture_url ?? null;
          }
        }

        if (cancelled) return;
        setPeerInfo({
          name: safeDisplayName(account.name, username),
          avatarUrl: profilePicture ?? account.avatar_url,
          username,
        });
      } catch {
        if (!cancelled) {
          setPeerInfo({ name: "Unbekannt", avatarUrl: null, username: null });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [peerAccountId]);

  const [showProductBanner, setShowProductBanner] = useState(true);
  const productContext = useMemo(() => {
    for (const msg of messages) {
      const listing = parseListingInquiry(msg.content);
      if (listing) return listing;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const displayName = peerInfo?.name || "Chat";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">
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
        {peerInfo?.avatarUrl ? (
          <img
            src={peerInfo.avatarUrl}
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
          {peerInfo?.username && (
            <p className="text-[11px] text-muted-foreground truncate">
              @{peerInfo.username}
            </p>
          )}
        </div>
      </div>

      {productContext && showProductBanner && (
        <ProductContextBanner
          listingId={productContext.listingId}
          title={productContext.title}
          price={productContext.price}
          priceType={productContext.priceType}
          imageUrl={productContext.imageUrl}
          condition={productContext.condition ?? undefined}
          onDismiss={() => setShowProductBanner(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
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
              const isOwn = msg.sender_account_id === activeAccountId;
              // Pass the raw content — ChatBubble renders a marketplace card for
              // listing/product inquiries and plain text otherwise.
              return (
                <ChatBubble
                  key={msg.id}
                  content={msg.content}
                  isOwn={isOwn}
                  timestamp={new Date(msg.created_at)}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <MessageInput onSend={sendMessage} initialValue={initialMessage} />
    </div>
  );
}
