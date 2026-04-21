/**
 * Hook for a single Supabase conversation.
 * Handles loading messages, sending, real-time streaming, and pagination.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '@/lib/supabase';
import {
  fetchMessages,
  sendMessage as sendMsg,
  type Message,
} from '@/lib/supabase-messages';
import { fetchUserByWallet } from '@/lib/supabase-users';

export type PeerUser = {
  username: string | null;
  profilePictureUrl: string | null;
  equippedFrameUrl: string | null;
};

export function useConversation(conversationId: string) {
  const account = useActiveAccount();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [peerAddress, setPeerAddress] = useState('');
  const [peerUser, setPeerUser] = useState<PeerUser | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load conversation info + initial messages
  useEffect(() => {
    if (!conversationId || !account?.address) return;

    let cancelled = false;
    const addr = account.address.toLowerCase();

    const load = async () => {
      setIsLoading(true);
      try {
        // Get conversation to derive peer address
        const { data } = await supabase
          .from('conversations' as any)
          .select('*')
          .eq('id', conversationId)
          .single();

        const convo = data as { participant_one: string; participant_two: string } | null;
        if (convo && !cancelled) {
          const peer =
            convo.participant_one === addr
              ? convo.participant_two
              : convo.participant_one;
          setPeerAddress(peer);

          // Resolve peer user profile
          const user = await fetchUserByWallet(peer);
          if (user && !cancelled) {
            setPeerUser({
              username: user.username,
              profilePictureUrl: user.profile_picture_url,
              equippedFrameUrl: user.equipped_frame_asset_url ?? null,
            });
          }
        }

        // Load initial messages
        const msgs = await fetchMessages(conversationId, 50);
        if (!cancelled) {
          setMessages(msgs);
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [conversationId, account?.address]);

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
          // If the row has a sticker FK, hydrate the joined reward before
          // rendering so the bubble can show the sticker image immediately.
          let enriched: Message = newMsg;
          if (newMsg.sticker_reward_id) {
            const { data } = await supabase
              .from('lootbox_rewards')
              .select('id, type, name, asset_url')
              .eq('id', newMsg.sticker_reward_id)
              .maybeSingle();
            if (data) enriched = { ...newMsg, sticker: data as any };
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev;
            return [enriched, ...prev]; // Prepend for inverted FlatList
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

  // Send a message (optionally with an attached sticker reward)
  const sendMessage = useCallback(
    async (text: string, stickerRewardId: string | null = null) => {
      if (!conversationId || !account?.address) return;
      if (!text.trim() && !stickerRewardId) return;
      setIsSending(true);
      try {
        await sendMsg(conversationId, account.address, text.trim(), stickerRewardId);
      } catch (err) {
        console.error('Failed to send message:', err);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, account?.address]
  );

  // Load more (older) messages
  const loadMore = useCallback(async () => {
    if (!conversationId || messages.length === 0) return;

    const oldestMessage = messages[messages.length - 1];
    try {
      const olderMessages = await fetchMessages(
        conversationId,
        30,
        oldestMessage.created_at
      );

      if (olderMessages.length > 0) {
        setMessages((prev) => [...prev, ...olderMessages]);
      }
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  }, [conversationId, messages]);

  return {
    messages,
    isLoading,
    isSending,
    sendMessage,
    loadMore,
    peerAddress,
    peerUser,
  };
}
