/**
 * Hook for a single conversation — dual-rail.
 *
 * Account-keyed: identity is the user's currently active account, not the
 * underlying wallet — so an owned org can hold its own chats and replies.
 *
 * Rails: threads always RENDER the union of the legacy Supabase rows and the
 * XMTP DM for this account pair; SENDS pick exactly one rail. XMTP is used
 * for personal↔personal chats whose peer has registered (E2E, payments,
 * reactions, read receipts, blocking); everything else stays on Supabase.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Dm } from '@xmtp/react-native-sdk';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/context/AccountContext';
import { useXmtp } from '@/context/XmtpContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import {
  fetchMessages,
  sendMessage as sendMsg,
  hydrateMessageSticker,
  safeDisplayName,
  type Message,
} from '@/lib/supabase-messages';
import {
  canMessageCached,
  fetchXmtpThread,
  getDmForWallet,
  getXmtpConsentState,
  blockXmtpConversation,
  unblockXmtpConversation,
  isXmtpRailEligible,
  sendXmtpReaction,
  sendXmtpReadReceipt,
  sendXmtpSticker,
  sendXmtpText,
  sendXmtpTransactionReference,
  syncDm,
} from '@/lib/xmtp/transport';
import { CONTENT_TYPE_READ_RECEIPT } from '@/lib/xmtp/codecs';
import { notifyDmPush, pushBodyForMessage } from '@/lib/xmtp/push';
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
  /** Lowercased owner wallet (personal accounts; null for orgs). */
  ownerWallet: string | null;
  xmtpRegisteredAt: string | null;
  /** Extern shadow contact (wallet-only peer without a Röbel user). */
  isExtern: boolean;
};

export type ConversationRail = 'supabase' | 'xmtp';

export function useConversation(conversationId: string) {
  const { activeAccount } = useAccount();
  const myAccountId = activeAccount?.id ?? null;
  const myAccountType = (activeAccount as any)?.account_type as string | undefined;
  const myAccountName = (activeAccount as any)?.name as string | undefined;

  const { handle: xmtp, ready: xmtpReady, subscribeMessages } = useXmtp();
  const { send: sendTaler } = useRoebelTaler();

  const [supabaseMessages, setSupabaseMessages] = useState<Message[]>([]);
  const [xmtpMessages, setXmtpMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoadingPeer, setIsLoadingPeer] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [peerAccount, setPeerAccount] = useState<PeerAccount | null>(null);
  const [rail, setRail] = useState<ConversationRail>('supabase');
  const [peerUnreachable, setPeerUnreachable] = useState(false);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  const [consent, setConsent] = useState<'allowed' | 'denied' | 'unknown'>('allowed');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dmRef = useRef<Dm<any> | null>(null);
  const xmtpOldestNsRef = useRef<number | null>(null);
  const lastReceiptNsRef = useRef<number>(0);

  const threadIds = useMemo(
    () =>
      myAccountId && peerAccount
        ? { conversationId, myAccountId, peerAccountId: peerAccount.id }
        : null,
    [conversationId, myAccountId, peerAccount]
  );

  // ── Load: Supabase messages + peer hydration (parallel chains) ──
  useEffect(() => {
    if (!conversationId || !myAccountId) return;
    let cancelled = false;

    setSupabaseMessages([]);
    setXmtpMessages([]);
    setPeerAccount(null);
    setRail('supabase');
    setPeerUnreachable(false);
    setPeerReadAt(null);
    dmRef.current = null;
    xmtpOldestNsRef.current = null;
    setIsLoadingMessages(true);
    setIsLoadingPeer(true);

    // Chain A — Supabase messages
    (async () => {
      try {
        const msgs = await fetchMessages(conversationId, 50);
        if (!cancelled) setSupabaseMessages(msgs);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!cancelled) setIsLoadingMessages(false);
      }
    })();

    // Chain B — peer hydration (incl. XMTP rail fields)
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

        const { data: acc } = await supabase
          .from('accounts' as any)
          .select(
            'id, account_type, sub_type, name, avatar_url, is_verified, is_extern, account_owners(wallet_address, users:wallet_address(username, profile_picture_url, equipped_frame_asset_url, xmtp_registered_at))'
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
          avatarUrl: isPersonal
            ? ownerUser?.profile_picture_url ?? row.avatar_url
            : row.avatar_url,
          equippedFrameUrl: isPersonal ? ownerUser?.equipped_frame_asset_url ?? null : null,
          isVerified: row.is_verified,
          ownerWallet: isPersonal && owner?.wallet_address
            ? String(owner.wallet_address).toLowerCase()
            : null,
          xmtpRegisteredAt: isPersonal ? ownerUser?.xmtp_registered_at ?? null : null,
          isExtern: row.is_extern === true,
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

  // ── Rail decision + XMTP thread load ─────────────────────────────
  useEffect(() => {
    if (!xmtp || !xmtpReady || !peerAccount || !threadIds) return;
    if (!isXmtpRailEligible(peerAccount, myAccountType)) return;
    let cancelled = false;

    (async () => {
      try {
        if (!(await canMessageCached(xmtp, peerAccount.ownerWallet!))) {
          if (!cancelled) setPeerUnreachable(true);
          return;
        }
        const dm = await getDmForWallet(xmtp, peerAccount.ownerWallet!);
        if (cancelled) return;
        dmRef.current = dm;
        setRail('xmtp');
        getXmtpConsentState(dm).then((state) => {
          if (!cancelled) setConsent(state);
        });

        await syncDm(dm);
        const page = await fetchXmtpThread(xmtp, dm, threadIds, { limit: 50 });
        if (cancelled) return;
        setXmtpMessages(page.messages);
        xmtpOldestNsRef.current = page.oldestNs;
        if (page.peerReadAtNs) {
          setPeerReadAt(new Date(page.peerReadAtNs / 1e6).toISOString());
        }

        // Tell the peer we've seen the thread (their "Gelesen" indicator).
        const newestPeerNs = page.messages.length
          ? Date.parse(page.messages[0].created_at) * 1e6
          : 0;
        if (newestPeerNs > lastReceiptNsRef.current) {
          lastReceiptNsRef.current = newestPeerNs;
          sendXmtpReadReceipt(dm);
        }
      } catch (err) {
        console.warn('[xmtp] thread load failed — staying on Supabase rail', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xmtp, xmtpReady, peerAccount, threadIds, myAccountType]);

  // ── Live updates ─────────────────────────────────────────────────
  // Supabase realtime (unchanged behavior)
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
          setSupabaseMessages((prev) => {
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

  // XMTP stream → refresh this thread when a message for it arrives
  const refreshXmtpThread = useCallback(async () => {
    const dm = dmRef.current;
    if (!xmtp || !dm || !threadIds) return;
    try {
      const page = await fetchXmtpThread(xmtp, dm, threadIds, { limit: 50 });
      setXmtpMessages(page.messages);
      if (page.oldestNs && !xmtpOldestNsRef.current) {
        xmtpOldestNsRef.current = page.oldestNs;
      }
      if (page.peerReadAtNs) {
        setPeerReadAt(new Date(page.peerReadAtNs / 1e6).toISOString());
      }
      const newestPeerNs = page.messages.length
        ? Date.parse(page.messages[0].created_at) * 1e6
        : 0;
      if (newestPeerNs > lastReceiptNsRef.current) {
        lastReceiptNsRef.current = newestPeerNs;
        sendXmtpReadReceipt(dm);
      }
    } catch (err) {
      console.warn('[xmtp] thread refresh failed', err);
    }
  }, [xmtp, threadIds]);

  useEffect(() => {
    if (!xmtp) return;
    const unsubscribe = subscribeMessages((message) => {
      const dm = dmRef.current;
      if (!dm || message.topic !== dm.topic) return;
      if (message.contentTypeId === CONTENT_TYPE_READ_RECEIPT) {
        if (message.senderInboxId !== xmtp.inboxId) {
          setPeerReadAt(new Date(message.sentNs / 1e6).toISOString());
        }
        return;
      }
      refreshXmtpThread();
    });
    return unsubscribe;
  }, [xmtp, subscribeMessages, refreshXmtpThread]);

  // Personal↔personal chats are XMTP-only — never fall back to Supabase for
  // them (2026-07-12 policy). Orgs/support keep the Supabase transport until
  // XMTP groups land.
  const isPersonalPair =
    !!peerAccount &&
    peerAccount.accountType === 'personal' &&
    myAccountType === 'personal' &&
    !!peerAccount.ownerWallet;

  // ── Merged view ──────────────────────────────────────────────────
  const messages = useMemo(() => {
    // XMTP-only threads: legacy Supabase history is not rendered anymore.
    if (isPersonalPair) return xmtpMessages;
    if (xmtpMessages.length === 0) return supabaseMessages;
    const merged = [...xmtpMessages, ...supabaseMessages];
    merged.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return merged;
  }, [supabaseMessages, xmtpMessages, isPersonalPair]);

  // ── Sends ────────────────────────────────────────────────────────
  const firePush = useCallback(
    (body: string) => {
      if (!peerAccount?.ownerWallet) return;
      notifyDmPush({
        senderName: safeDisplayName(myAccountName, null),
        body,
        recipientWallets: [peerAccount.ownerWallet],
        conversationId,
      });
    },
    [peerAccount?.ownerWallet, myAccountName, conversationId]
  );

  const sendBlocked: 'self' | 'peer' | null = !isPersonalPair
    ? null
    : rail === 'xmtp'
      ? null
      : xmtpReady && !xmtp
        ? 'self'
        : peerUnreachable
          ? 'peer'
          : null;

  const sendMessage = useCallback(
    async (text: string, stickerRewardId: string | null = null) => {
      if (!conversationId || !myAccountId) return;
      if (!text.trim() && !stickerRewardId) return;
      setIsSending(true);
      try {
        const dm = dmRef.current;
        if (rail === 'xmtp' && dm) {
          if (text.trim()) await sendXmtpText(dm, text.trim());
          if (stickerRewardId) await sendXmtpSticker(dm, stickerRewardId);
          await refreshXmtpThread();
          firePush(
            pushBodyForMessage({ content: text.trim(), sticker_reward_id: stickerRewardId })
          );
        } else if (isPersonalPair) {
          // XMTP-only: no Supabase writes for personal chats.
          console.warn('[xmtp] send blocked — personal chats are XMTP-only');
        } else {
          await sendMsg(conversationId, myAccountId, text.trim(), stickerRewardId);
        }
      } catch (err) {
        console.error('Failed to send message:', err);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, myAccountId, rail, isPersonalPair, refreshXmtpThread, firePush]
  );

  /**
   * In-chat Röbel Münzen payment: gasless on-chain transfer to the peer's
   * wallet, then a transactionReference receipt message on the XMTP rail.
   */
  const sendPayment = useCallback(
    async (amountRaw: bigint, amountDecimal: number) => {
      const dm = dmRef.current;
      if (rail !== 'xmtp' || !dm || !peerAccount?.ownerWallet || !xmtp) {
        throw new Error('Zahlungen sind in diesem Chat noch nicht verfügbar');
      }
      setIsSending(true);
      try {
        const txHash = await sendTaler(peerAccount.ownerWallet, amountRaw);
        try {
          await sendXmtpTransactionReference(dm, {
            namespace: 'eip155',
            networkId: 'eip155:100',
            reference: txHash || '',
            metadata: {
              transactionType: 'transfer',
              currency: 'Röbel Münzen',
              amount: amountDecimal,
              decimals: 18,
              fromAddress: xmtp.wallet,
              toAddress: peerAccount.ownerWallet,
            },
          });
          await refreshXmtpThread();
          firePush('hat dir Röbel Münzen gesendet');
        } catch (msgErr) {
          // Funds moved; only the receipt bubble failed. The recipient's
          // balance updates regardless — log loudly, don't re-throw.
          console.error('[xmtp] payment sent but receipt message failed', msgErr);
        }
      } finally {
        setIsSending(false);
      }
    },
    [rail, peerAccount?.ownerWallet, xmtp, sendTaler, refreshXmtpThread, firePush]
  );

  const sendReaction = useCallback(
    async (messageId: string, emoji: string, add: boolean) => {
      const dm = dmRef.current;
      if (rail !== 'xmtp' || !dm) return;
      try {
        await sendXmtpReaction(dm, messageId, emoji, add ? 'added' : 'removed');
        await refreshXmtpThread();
      } catch (err) {
        console.warn('[xmtp] reaction failed', err);
      }
    },
    [rail, refreshXmtpThread]
  );

  const blockPeer = useCallback(async () => {
    const dm = dmRef.current;
    if (!dm) return;
    await blockXmtpConversation(dm);
    setConsent('denied');
  }, []);

  const unblockPeer = useCallback(async () => {
    const dm = dmRef.current;
    if (!dm) return;
    await unblockXmtpConversation(dm);
    setConsent('allowed');
  }, []);

  // ── Pagination (both rails page independently) ───────────────────
  const loadMore = useCallback(async () => {
    if (!conversationId) return;

    const oldestSupabase = supabaseMessages[supabaseMessages.length - 1];
    const tasks: Promise<void>[] = [];

    if (oldestSupabase) {
      tasks.push(
        fetchMessages(conversationId, 30, oldestSupabase.created_at).then((older) => {
          if (older.length > 0) setSupabaseMessages((prev) => [...prev, ...older]);
        })
      );
    }

    const dm = dmRef.current;
    if (xmtp && dm && threadIds && xmtpOldestNsRef.current) {
      tasks.push(
        fetchXmtpThread(xmtp, dm, threadIds, {
          limit: 30,
          beforeNs: xmtpOldestNsRef.current,
        }).then((page) => {
          if (page.messages.length > 0) {
            setXmtpMessages((prev) => {
              const known = new Set(prev.map((m) => m.id));
              return [...prev, ...page.messages.filter((m) => !known.has(m.id))];
            });
          }
          if (page.oldestNs) xmtpOldestNsRef.current = page.oldestNs;
        })
      );
    }

    try {
      await Promise.all(tasks);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  }, [conversationId, supabaseMessages, xmtp, threadIds]);

  return {
    messages,
    isLoadingMessages,
    isLoadingPeer,
    // Back-compat for callers that still read `isLoading`.
    isLoading: isLoadingMessages,
    isSending,
    sendMessage,
    sendPayment,
    sendReaction,
    blockPeer,
    unblockPeer,
    consent,
    rail,
    /** Non-null when sending is blocked: 'self' = user must activate XMTP,
     *  'peer' = peer hasn't activated yet (personal chats are XMTP-only). */
    sendBlocked,
    peerReadAt,
    loadMore,
    peerAccount,
    myAccountId,
  };
}
