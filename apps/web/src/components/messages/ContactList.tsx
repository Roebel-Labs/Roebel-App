"use client";

import { useContacts } from "@/hooks/useContacts";
import { useMessagingContext } from "./MessagingProvider";
import { ContactCard } from "./ContactCard";
import { EmptyState } from "./EmptyState";
import { getOrCreateConversation } from "@/lib/messaging/api";
import { useState, useEffect, useRef } from "react";

interface ContactListProps {
  onSelectConversation: (conversationId: string, peerAddress: string) => void;
}

export function ContactList({ onSelectConversation }: ContactListProps) {
  const { contacts, isLoading } = useContacts();
  const { walletAddress } = useMessagingContext();
  const [startingChat, setStartingChat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear error after 4 seconds
  useEffect(() => {
    if (!error) return;
    errorTimerRef.current = setTimeout(() => setError(null), 4000);
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [error]);

  const handleStartChat = async (contactAddress: string) => {
    if (!walletAddress || startingChat) return;

    setStartingChat(contactAddress);
    setError(null);
    try {
      const conversation = await getOrCreateConversation(walletAddress, contactAddress);
      onSelectConversation(conversation.id, contactAddress);
    } catch (err) {
      console.error("Error starting chat:", err);
      setError("Chat konnte nicht gestartet werden");
    } finally {
      setStartingChat(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse flex items-center gap-3 p-3">
            <div className="w-10 h-10 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-2.5 bg-muted rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <EmptyState
        title="Keine Kontakte gefunden"
        description="Andere Mitglieder werden hier angezeigt, sobald sie sich registriert haben"
        icon="contacts"
      />
    );
  }

  return (
    <div>
      {error && (
        <div className="mx-3 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="divide-y divide-border">
      {contacts.map((contact) => (
        <div key={contact.walletAddress} className="relative">
          <ContactCard
            name={contact.username || ""}
            address={contact.walletAddress}
            profilePictureUrl={contact.profilePictureUrl}
            isCitizen={contact.isCitizen}
            onClick={() => handleStartChat(contact.walletAddress)}
          />
          {startingChat === contact.walletAddress && (
            <div className="absolute inset-0 bg-card/80 flex items-center justify-center rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900" />
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
