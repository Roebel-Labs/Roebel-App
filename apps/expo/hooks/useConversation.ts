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
import { fetchAccountById } from '@/lib/supabase-accounts';
import { supabase as sb } from '@/lib/supabase';
import type { Account, OrgSubType } from '@/lib/types';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [peerAccount, setPeerAccount] = useState<PeerAccount | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load conversation peer + initial messages
  useEffect(() => {
    if (!conversationId || !myAccountId) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('conversations' as any)
          .select('participant_one_account_id, participant_two_account_id')
          .eq('id', conversationId)
          .single();

        const convo = data as {
          participant_one_account_id: string | null;
          participant_two_account_id: string | null;
        } | null;

        let peerId: string | null = null;
        if (convo) {
          peerId =
            convo.participant_one_account_id === myAccountId
              ? convo.participant_two_account_id
              : convo.participant_one_account_id;
        }

        if (peerId && !cancelled) {
          const acc: Account | null = await fetchAccountById(peerId);
          if (acc && !cancelled) {
            // Pull personal-account frame + username from the owner wallet's `users` row.
            let username: string | null = null;
            let equippedFrameUrl: string | null = null;
            if (acc.account_type === 'personal') {
              const { data: ownerRow } = await sb
                .from('account_owners' as any)
                .select('wallet_address')
                .eq('account_id', acc.id)
                .limit(1)
                .maybeSingle();
              const wallet = (ownerRow as any)?.wallet_address as string | undefined;
              if (wallet) {
                const { data: userRow } = await sb
                  .from('users')
                  .select('username, equipped_frame_asset_url')
                  .eq('wallet_address', wallet)
                  .maybeSingle();
                username = (userRow as any)?.username ?? null;
                equippedFrameUrl = (userRow as any)?.equipped_frame_asset_url ?? null;
              }
            }
            if (!cancelled) {
              setPeerAccount({
                id: acc.id,
                accountType: acc.account_type,
                subType: acc.sub_type,
                name: acc.name,
                username,
                avatarUrl: acc.avatar_url,
                equippedFrameUrl,
                isVerified: acc.is_verified,
              });
            }
          }
        }

        const msgs = await fetchMessages(conversationId, 50);
        if (!cancelled) setMessages(msgs);
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
    isLoading,
    isSending,
    sendMessage,
    loadMore,
    peerAccount,
    myAccountId,
  };
}
