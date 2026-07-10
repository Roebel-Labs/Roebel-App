import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/context/AccountContext';
import { useXmtp } from '@/context/XmtpContext';
import {
  fetchConversations as fetchConvos,
  getUnreadCount as fetchUnread,
  markConversationRead as markRead,
  fetchPersonalAccountIdByWallet,
  findOrCreateConversation,
  type ConversationWithLastMessage,
} from '@/lib/supabase-messages';
import {
  countXmtpUnread,
  listXmtpInbox,
  mapXmtpMessage,
  type XmtpInboxEntry,
} from '@/lib/xmtp/transport';
import type { XmtpClientHandle } from '@/lib/xmtp/client';

interface MessagingContextValue {
  conversations: ConversationWithLastMessage[];
  unreadCount: number;
  isLoading: boolean;
  refreshConversations: () => Promise<void>;
  markConversationRead: (conversationId: string) => void;
}

const MessagingContext = createContext<MessagingContextValue>({
  conversations: [],
  unreadCount: 0,
  isLoading: false,
  refreshConversations: async () => {},
  markConversationRead: () => {},
});

export function useMessaging() {
  return useContext(MessagingContext);
}

/**
 * Merges the XMTP rail into the Supabase-backed inbox rows: newer XMTP last
 * messages override previews/unread dots, per-conversation XMTP unread counts
 * add to the badge, and inbound XMTP DMs without a registry row get one
 * created (Röbel peers only — external XMTP wallets are ignored in v1).
 */
async function mergeXmtpInbox(
  handle: XmtpClientHandle,
  myAccountId: string,
  rows: ConversationWithLastMessage[],
  adoptedWallets: Set<string>,
  allowAdoption: boolean
): Promise<{ rows: ConversationWithLastMessage[]; xmtpUnread: number; adopted: boolean }> {
  let entries: XmtpInboxEntry[] = [];
  try {
    entries = await listXmtpInbox(handle);
  } catch (err) {
    console.warn('[xmtp] inbox list failed', err);
    return { rows, xmtpUnread: 0, adopted: false };
  }
  if (entries.length === 0) return { rows, xmtpUnread: 0, adopted: false };

  let xmtpUnread = 0;
  let adopted = false;
  const merged = rows.map((r) => ({ ...r }));

  for (const entry of entries) {
    const rowIndex = merged.findIndex((r) => r.peerOwnerWallet === entry.peerWallet);

    if (rowIndex === -1) {
      // Inbound XMTP DM with no registry row (peer started the chat, possibly
      // from another XMTP app). Adopt it once per wallet per session — but
      // only for wallets that belong to a Röbel personal account.
      if (allowAdoption && !adoptedWallets.has(entry.peerWallet)) {
        adoptedWallets.add(entry.peerWallet);
        try {
          const peerAccountId = await fetchPersonalAccountIdByWallet(entry.peerWallet);
          if (peerAccountId && peerAccountId !== myAccountId) {
            await findOrCreateConversation(myAccountId, peerAccountId);
            adopted = true;
          }
        } catch (err) {
          console.warn('[xmtp] adoption failed', err);
        }
      }
      continue;
    }

    const row = merged[rowIndex];

    // Preview: override when the XMTP side is newer.
    if (entry.lastMessage) {
      const mapped = mapXmtpMessage(
        entry.lastMessage,
        { conversationId: row.id, myAccountId, peerAccountId: row.peerAccountId },
        handle
      );
      if (mapped) {
        if (mapped.payment) mapped.content = '💰 Röbel Münzen';
        const newer =
          !row.lastMessage ||
          Date.parse(mapped.created_at) > Date.parse(row.lastMessage.created_at);
        if (newer) row.lastMessage = mapped;
      }
    }

    // Unread: message-level parity with get_unread_count. Skip the local-db
    // count when the newest XMTP message can't be unread anyway.
    const last = entry.lastMessage;
    const lastFromPeer = last && last.senderInboxId !== handle.inboxId;
    const lastIsNew =
      !!last &&
      (!row.lastReadAt || last.sentNs / 1e6 > Date.parse(row.lastReadAt));
    if (lastFromPeer && lastIsNew) {
      const unread = await countXmtpUnread(handle, entry.dm, row.lastReadAt);
      if (unread > 0) {
        xmtpUnread += unread;
        row.hasUnread = true;
      }
    }
  }

  merged.sort((a, b) => {
    const ta = a.lastMessage?.created_at ?? a.created_at;
    const tb = b.lastMessage?.created_at ?? b.created_at;
    return Date.parse(tb) - Date.parse(ta);
  });

  return { rows: merged, xmtpUnread, adopted };
}

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { activeAccount } = useAccount();
  const activeAccountId = activeAccount?.id ?? null;
  const activeAccountType = (activeAccount as any)?.account_type as string | undefined;

  const { handle: xmtp, ready: xmtpReady, subscribeMessages } = useXmtp();

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [baseUnread, setBaseUnread] = useState(0);
  const [xmtpUnread, setXmtpUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const accountIdRef = useRef<string | null>(null);
  const accountTypeRef = useRef<string | undefined>(undefined);
  const xmtpRef = useRef<XmtpClientHandle | null>(null);
  const adoptedWalletsRef = useRef<Set<string>>(new Set());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  accountTypeRef.current = activeAccountType;
  xmtpRef.current = xmtp;

  const loadConversations = useCallback(async (accountId: string) => {
    setIsLoading(true);
    try {
      let convos = await fetchConvos(accountId);

      const handle = xmtpRef.current;
      if (handle && accountTypeRef.current === 'personal') {
        let result = await mergeXmtpInbox(
          handle,
          accountId,
          convos,
          adoptedWalletsRef.current,
          true
        );
        if (result.adopted) {
          // A registry row was created for an inbound XMTP DM — refetch once
          // so the new conversation appears with full peer hydration.
          const refreshed = await fetchConvos(accountId);
          result = await mergeXmtpInbox(
            handle,
            accountId,
            refreshed,
            adoptedWalletsRef.current,
            false
          );
        }
        convos = result.rows;
        if (accountIdRef.current === accountId) setXmtpUnread(result.xmtpUnread);
      } else if (accountIdRef.current === accountId) {
        setXmtpUnread(0);
      }

      // Guard against stale loads after an account switch.
      if (accountIdRef.current === accountId) {
        setConversations(convos);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      if (accountIdRef.current === accountId) {
        setIsLoading(false);
      }
    }
  }, []);

  const loadUnreadCount = useCallback(async (accountId: string) => {
    try {
      const count = await fetchUnread(accountId);
      if (accountIdRef.current === accountId) {
        setBaseUnread(count);
      }
    } catch (err) {
      console.error('Failed to load unread count:', err);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const id = accountIdRef.current;
    if (!id) return;
    await Promise.all([loadConversations(id), loadUnreadCount(id)]);
  }, [loadConversations, loadUnreadCount]);

  const handleMarkRead = useCallback((conversationId: string) => {
    const id = accountIdRef.current;
    if (!id) return;
    markRead(conversationId, id);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, hasUnread: false, lastReadAt: new Date().toISOString() } : c
      )
    );
    setBaseUnread((prev) => Math.max(0, prev - 1));
  }, []);

  // Load whenever the active account changes (incl. switching between
  // personal and an owned org). Strict scoping: switching the account
  // swaps the inbox entirely.
  useEffect(() => {
    if (!activeAccountId) {
      accountIdRef.current = null;
      setConversations([]);
      setBaseUnread(0);
      setXmtpUnread(0);
      return;
    }
    accountIdRef.current = activeAccountId;
    loadConversations(activeAccountId);
    loadUnreadCount(activeAccountId);
  }, [activeAccountId, loadConversations, loadUnreadCount]);

  // When the XMTP client becomes ready after the first load, merge it in.
  useEffect(() => {
    if (!xmtpReady || !xmtp) return;
    const id = accountIdRef.current;
    if (id) loadConversations(id);
  }, [xmtpReady, xmtp, loadConversations]);

  // Realtime (Supabase rail): any new direct_messages insert triggers a
  // refetch scoped to the active account.
  useEffect(() => {
    if (!activeAccountId) return;

    const channel = supabase
      .channel(`messaging-realtime-${activeAccountId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        () => {
          const current = accountIdRef.current;
          if (current) {
            loadConversations(current);
            loadUnreadCount(current);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAccountId, loadConversations, loadUnreadCount]);

  // Realtime (XMTP rail): stream events debounce into an inbox refresh.
  useEffect(() => {
    if (!xmtp) return;
    const unsubscribe = subscribeMessages(() => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        const current = accountIdRef.current;
        if (current) loadConversations(current);
      }, 500);
    });
    return () => {
      unsubscribe();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [xmtp, subscribeMessages, loadConversations]);

  return (
    <MessagingContext.Provider
      value={{
        conversations,
        unreadCount: baseUnread + xmtpUnread,
        isLoading,
        refreshConversations,
        markConversationRead: handleMarkRead,
      }}
    >
      {children}
    </MessagingContext.Provider>
  );
}
