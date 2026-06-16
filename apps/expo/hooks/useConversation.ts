/**
 * Hook for a single Supabase conversation.
 * Account-keyed: identity is the user's currently active account, not the
 * underlying wallet — so an owned org can hold its own chats and replies.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/context/AccountContext';
import {
  fetchMessages,
  sendMessage as sendMsg,
  hydrateMessageSticker,
  type Message,
} from '@/lib/supabase-messages';
import type { OrgSubType } from '@/lib/types';

export type PeerAccount = {
  id: string;
  accountType: 'personal' | 'organisation';
  subType: OrgSubType | null;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  equippedFrameUrl: string | null;
  isVerified: boolean;
};

export function useConversation(conversationId: string) {
  const { activeAccount } = useAccount();
  const myAccountId = activeAccount?.id ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoadingPeer, setIsLoadingPeer] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [peerAccount, setPeerAccount] = useState<PeerAccount | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Two parallel chains: messages and peer hydration. Either can complete
  // first — the chat screen shows real bubbles as soon as messages land and
  // a header skeleton until peer data lands. Cuts perceived load time roughly
  // in half compared to the previous sequential chain.
  useEffect(() => {
    if (!conversationId || !myAccountId) return;
    let cancelled = false;

    // Reset per-conversation state so stale data from the previous chat
    // doesn't flash in.
    setMessages([]);
    setPeerAccount(null);
    setIsLoadingMessages(true);
    setIsLoadingPeer(true);

    // Chain A — messages
    (async () => {
      try {
        const msgs = await fetchMessages(conversationId, 50);
        if (!cancelled) setMessages(msgs);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!cancelled) setIsLoadingMessages(false);
      }
    })();

    // Chain B — peer hydration
    (async () => {
      try {
        const { data: convoRow } = await supabase
          .from('conversations' as any)
          .select('participant_one_account_id, participant_two_account_id')
          .eq('id', conversationId)
          .single();

        const convo = convoRow as {
          participant_one_account_id: string | null;
          participant_two_account_id: string | null;
        } | null;

        const peerId =
          convo?.participant_one_account_id === myAccountId
            ? convo?.participant_two_account_id
            : convo?.participant_one_account_id;

        if (!peerId || cancelled) return;

        // Fetch the peer account row and (for personal peers) the owner's
        // users row in a single joined query. Cuts a round trip.
        const { data: acc } = await supabase
          .from('accounts' as any)
          .select(
            'id, account_type, sub_type, name, avatar_url, is_verified, account_owners(wallet_address, users:wallet_address(username, profile_picture_url, equipped_frame_asset_url))'
          )
          .eq('id', peerId)
          .single();

        if (!acc || cancelled) return;

        const row = acc as any;
        const owner = Array.isArray(row.account_owners) ? row.account_owners[0] : row.account_owners;
        const ownerUser = owner?.users
          ? Array.isArray(owner.users)
            ? owner.users[0]
            : owner.users
          : null;

        const isPersonal = row.account_type === 'personal';
        setPeerAccount({
          id: row.id,
          accountType: row.account_type,
          subType: row.sub_type,
          name: row.name,
          username: isPersonal ? ownerUser?.username ?? null : null,
          // Personal peers: photo lives on the owner's `users` row, not the
          // (stale) accounts.avatar_url. Orgs use the account avatar.
          avatarUrl: isPersonal
            ? ownerUser?.profile_picture_url ?? row.avatar_url
            : row.avatar_url,
          equippedFrameUrl: isPersonal ? ownerUser?.equipped_frame_asset_url ?? null : null,
          isVerified: row.is_verified,
        });
      } catch (err) {
        console.error('Failed to hydrate peer:', err);
      } finally {
        if (!cancelled) setIsLoadingPeer(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, myAccountId]);

  // Realtime subscription for this conversation
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          const enriched = await hydrateMessageSticker(newMsg);
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev;
            return [enriched, ...prev];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    async (text: string, stickerRewardId: string | null = null) => {
      if (!conversationId || !myAccountId) return;
      if (!text.trim() && !stickerRewardId) return;
      setIsSending(true);
      try {
        await sendMsg(conversationId, myAccountId, text.trim(), stickerRewardId);
      } catch (err) {
        console.error('Failed to send message:', err);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, myAccountId]
  );

  const loadMore = useCallback(async () => {
    if (!conversationId || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    try {
      const older = await fetchMessages(conversationId, 30, oldest.created_at);
      if (older.length > 0) {
        setMessages((prev) => [...prev, ...older]);
      }
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  }, [conversationId, messages]);

  return {
    messages,
    isLoadingMessages,
    isLoadingPeer,
    // Back-compat for callers that still read `isLoading`.
    isLoading: isLoadingMessages,
    isSending,
    sendMessage,
    loadMore,
    peerAccount,
    myAccountId,
  };
}
