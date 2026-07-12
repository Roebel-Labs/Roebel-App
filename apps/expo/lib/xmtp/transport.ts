/**
 * XMTP transport adapter.
 *
 * Maps the XMTP rail onto the app's existing message model so the DM UI
 * renders both rails identically:
 *   - rail selection (which conversations go over XMTP)
 *   - DecodedMessage → Message mapping (text, payments, stickers, fallbacks)
 *   - thread fetch/merge helpers, unread counting, consent (blocking)
 *
 * All SDK VALUE access goes through the lazily-loaded handle
 * (XmtpClientHandle.sdk) — only `import type` from the SDK here.
 */

import type { DecodedMessage, Dm, ReactionContent } from '@xmtp/react-native-sdk';

import { hydrateMessageSticker, type Message, type MessageReaction } from '@/lib/supabase-messages';
import type { XmtpClientHandle } from './client';
import {
  CONTENT_TYPE_READ_RECEIPT,
  CONTENT_TYPE_ROEBEL_STICKER,
  CONTENT_TYPE_TEXT,
  CONTENT_TYPE_TRANSACTION_REFERENCE,
  ROEBEL_STICKER_TYPE,
  TRANSACTION_REFERENCE_TYPE,
  type RoebelStickerContent,
  type TransactionReferenceContent,
} from './codecs';

export interface ThreadIds {
  conversationId: string;
  myAccountId: string;
  peerAccountId: string;
}

export interface XmtpThreadPage {
  messages: Message[];
  /** Newest peer read receipt in the fetched page (ns), if any. */
  peerReadAtNs: number | null;
  /** Cursor for older pages, or null when the page was empty. */
  oldestNs: number | null;
}

// ── Rail selection ─────────────────────────────────────────────────

/**
 * Personal↔personal chats are XMTP-ONLY (2026-07-12 policy: no Supabase
 * transport for them anymore) — canMessage() alone decides reachability;
 * `users.xmtp_registered_at` remains a UI hint, not a gate. Org-involved
 * conversations stay on the Supabase rail until XMTP groups (phase 2).
 */
export function isXmtpRailEligible(
  peer: {
    accountType: string;
    ownerWallet: string | null;
    xmtpRegisteredAt: string | null;
    isExtern?: boolean;
  },
  myAccountType: string | undefined | null
): boolean {
  return (
    myAccountType === 'personal' &&
    peer.accountType === 'personal' &&
    !!peer.ownerWallet
  );
}

const canMessageCache = new Map<string, { value: boolean; at: number }>();
const CAN_MESSAGE_TTL_MS = 10 * 60 * 1000;

/** Network reachability guard on top of the registered flag (cached 10 min). */
export async function canMessageCached(
  handle: XmtpClientHandle,
  wallet: string
): Promise<boolean> {
  const key = wallet.toLowerCase();
  const hit = canMessageCache.get(key);
  if (hit && Date.now() - hit.at < CAN_MESSAGE_TTL_MS) return hit.value;
  try {
    const result = await handle.sdk.Client.canMessage(handle.env, [
      new handle.sdk.PublicIdentity(key, 'ETHEREUM'),
    ]);
    const value = result[key] ?? Object.values(result)[0] ?? false;
    canMessageCache.set(key, { value, at: Date.now() });
    return value;
  } catch (err) {
    console.warn('[xmtp] canMessage failed', err);
    return false;
  }
}

// ── Conversation handles ───────────────────────────────────────────

export async function getDmForWallet(
  handle: XmtpClientHandle,
  peerWallet: string
): Promise<Dm<any>> {
  return handle.client.conversations.findOrCreateDmWithIdentity(
    new handle.sdk.PublicIdentity(peerWallet.toLowerCase(), 'ETHEREUM')
  );
}

/**
 * Local-only DM lookup (no network, never creates). Lets existing threads
 * paint instantly from the local db before any reachability check or sync.
 */
export async function findDmForWallet(
  handle: XmtpClientHandle,
  peerWallet: string
): Promise<Dm<any> | undefined> {
  try {
    return await handle.client.conversations.findDmByIdentity(
      new handle.sdk.PublicIdentity(peerWallet.toLowerCase(), 'ETHEREUM')
    );
  } catch {
    return undefined;
  }
}

export async function syncDm(dm: Dm<any>): Promise<void> {
  try {
    await dm.sync();
  } catch (err) {
    console.warn('[xmtp] dm sync failed', err);
  }
}

// ── Message mapping ────────────────────────────────────────────────

function isReactionType(contentTypeId: string): boolean {
  return contentTypeId.startsWith('xmtp.org/reaction');
}

function aggregateReactions(
  msg: DecodedMessage<any>,
  handle: XmtpClientHandle
): MessageReaction[] | undefined {
  const children = msg.childMessages;
  if (!children?.length) return undefined;

  // Latest action per (sender, emoji) wins; count senders whose latest is 'added'.
  const latest = new Map<string, { action: string; sentNs: number; emoji: string; mine: boolean }>();
  for (const child of children) {
    if (!isReactionType(child.contentTypeId)) continue;
    let reaction: ReactionContent;
    try {
      reaction = child.content() as ReactionContent;
    } catch {
      continue;
    }
    if (!reaction?.content) continue;
    const key = `${child.senderInboxId}|${reaction.content}`;
    const prev = latest.get(key);
    if (!prev || child.sentNs > prev.sentNs) {
      latest.set(key, {
        action: reaction.action,
        sentNs: child.sentNs,
        emoji: reaction.content,
        mine: child.senderInboxId === handle.inboxId,
      });
    }
  }

  const byEmoji = new Map<string, MessageReaction>();
  for (const entry of latest.values()) {
    if (entry.action !== 'added') continue;
    const agg = byEmoji.get(entry.emoji) ?? { emoji: entry.emoji, count: 0, reactedByMe: false };
    agg.count += 1;
    agg.reactedByMe = agg.reactedByMe || entry.mine;
    byEmoji.set(entry.emoji, agg);
  }
  return byEmoji.size > 0 ? Array.from(byEmoji.values()) : undefined;
}

/**
 * Maps one XMTP message into the app's Message shape. Returns null for
 * protocol messages that don't render as bubbles (read receipts, reactions)
 * and unknown types without a fallback.
 */
export function mapXmtpMessage(
  msg: DecodedMessage<any>,
  ids: ThreadIds,
  handle: XmtpClientHandle
): Message | null {
  const typeId = msg.contentTypeId;
  if (typeId === CONTENT_TYPE_READ_RECEIPT || isReactionType(typeId)) return null;

  const isOwn = msg.senderInboxId === handle.inboxId;
  const base: Message = {
    id: String(msg.id),
    conversation_id: ids.conversationId,
    sender_account_id: isOwn ? ids.myAccountId : ids.peerAccountId,
    content: '',
    sticker_reward_id: null,
    created_at: new Date(msg.sentNs / 1e6).toISOString(),
    source: 'xmtp',
    reactions: aggregateReactions(msg, handle),
  };

  try {
    if (typeId === CONTENT_TYPE_TEXT) {
      base.content = (msg.content() as string) ?? '';
      return base.content ? base : null;
    }
    if (typeId === CONTENT_TYPE_TRANSACTION_REFERENCE) {
      const ref = msg.content() as TransactionReferenceContent;
      base.payment = {
        txHash: ref.reference,
        networkId: String(ref.networkId ?? ''),
        amount: ref.metadata?.amount ?? 0,
      };
      return base;
    }
    if (typeId === CONTENT_TYPE_ROEBEL_STICKER) {
      const sticker = msg.content() as RoebelStickerContent;
      base.sticker_reward_id = sticker.stickerRewardId ?? null;
      return base.sticker_reward_id ? base : null;
    }
  } catch (err) {
    console.warn('[xmtp] decode failed, using fallback', typeId, err);
  }

  // Replies/attachments from other XMTP apps and anything unknown render as
  // their fallback text (never raw JSON, never dropped silently when labeled).
  base.content = msg.fallback ?? '';
  return base.content ? base : null;
}

// ── Thread fetch ───────────────────────────────────────────────────

export async function fetchXmtpThread(
  handle: XmtpClientHandle,
  dm: Dm<any>,
  ids: ThreadIds,
  opts?: { beforeNs?: number; limit?: number }
): Promise<XmtpThreadPage> {
  const raw = await dm.messagesWithReactions({
    limit: opts?.limit ?? 50,
    beforeNs: opts?.beforeNs,
    direction: 'DESCENDING',
  });

  let peerReadAtNs: number | null = null;
  const messages: Message[] = [];
  let oldestNs: number | null = null;

  for (const m of raw) {
    oldestNs = oldestNs == null ? m.sentNs : Math.min(oldestNs, m.sentNs);
    if (m.contentTypeId === CONTENT_TYPE_READ_RECEIPT) {
      if (m.senderInboxId !== handle.inboxId) {
        peerReadAtNs = Math.max(peerReadAtNs ?? 0, m.sentNs);
      }
      continue;
    }
    const mapped = mapXmtpMessage(m, ids, handle);
    if (mapped) messages.push(mapped);
  }

  // Sticker messages carry only the reward id over the wire — join the asset
  // like the Supabase rail does so MessageBubble renders them identically.
  const hydrated = await Promise.all(
    messages.map((m) => (m.sticker_reward_id ? hydrateMessageSticker(m) : m))
  );

  return { messages: hydrated, peerReadAtNs, oldestNs };
}

// ── Sends ──────────────────────────────────────────────────────────

export async function sendXmtpText(dm: Dm<any>, text: string): Promise<string> {
  return String(await dm.send(text));
}

export async function sendXmtpSticker(dm: Dm<any>, stickerRewardId: string): Promise<string> {
  const content: RoebelStickerContent = { stickerRewardId };
  return String(await dm.send(content as any, { contentType: ROEBEL_STICKER_TYPE }));
}

export async function sendXmtpTransactionReference(
  dm: Dm<any>,
  content: TransactionReferenceContent
): Promise<string> {
  return String(await dm.send(content as any, { contentType: TRANSACTION_REFERENCE_TYPE }));
}

export async function sendXmtpReaction(
  dm: Dm<any>,
  referenceMessageId: string,
  emoji: string,
  action: 'added' | 'removed'
): Promise<string> {
  return String(
    await dm.send({
      reaction: {
        reference: referenceMessageId,
        action,
        schema: 'unicode',
        content: emoji,
      },
    } as any)
  );
}

export async function sendXmtpReadReceipt(dm: Dm<any>): Promise<void> {
  try {
    await dm.send({ readReceipt: {} } as any);
  } catch (err) {
    console.warn('[xmtp] read receipt send failed', err);
  }
}

// ── Inbox ──────────────────────────────────────────────────────────

export interface XmtpInboxEntry {
  dm: Dm<any>;
  peerWallet: string;
  lastMessage: DecodedMessage<any> | null;
}

// inboxId → wallet is immutable enough to cache for the session.
const walletByInboxId = new Map<string, string>();

export async function listXmtpInbox(handle: XmtpClientHandle): Promise<XmtpInboxEntry[]> {
  try {
    await handle.client.conversations.syncAllConversations(['allowed', 'unknown']);
  } catch (err) {
    console.warn('[xmtp] syncAllConversations failed', err);
  }

  const dms = await handle.client.conversations.listDms(
    { lastMessage: true },
    100,
    ['allowed', 'unknown']
  );

  const peerInboxIds = await Promise.all(
    dms.map(async (dm) => {
      try {
        return await dm.peerInboxId();
      } catch {
        return null;
      }
    })
  );

  const unknown = Array.from(
    new Set(peerInboxIds.filter((id): id is string => !!id && !walletByInboxId.has(id)))
  );
  if (unknown.length > 0) {
    try {
      const states = await handle.sdk.Client.inboxStatesForInboxIds(handle.env, unknown as any);
      for (const state of states) {
        const eth = state.identities?.find((i) => i.kind === 'ETHEREUM');
        if (eth) walletByInboxId.set(String(state.inboxId), eth.identifier.toLowerCase());
      }
    } catch (err) {
      console.warn('[xmtp] inboxStatesForInboxIds failed', err);
    }
  }

  const entries: XmtpInboxEntry[] = [];
  for (let i = 0; i < dms.length; i++) {
    const inboxId = peerInboxIds[i];
    const wallet = inboxId ? walletByInboxId.get(inboxId) : undefined;
    if (!wallet) continue;
    entries.push({ dm: dms[i], peerWallet: wallet, lastMessage: dms[i].lastMessage ?? null });
  }
  return entries;
}

/**
 * Resolve a single sender inboxId → lowercased ETH wallet, reusing the
 * session cache. Used by the inbound-notification path to tell whether a
 * streamed message came from a Röbel user or a totally external wallet.
 */
export async function resolveSenderWallet(
  handle: XmtpClientHandle,
  inboxId: string
): Promise<string | null> {
  if (!inboxId) return null;
  const cached = walletByInboxId.get(inboxId);
  if (cached) return cached;
  try {
    const states = await handle.sdk.Client.inboxStatesForInboxIds(handle.env, [inboxId] as any);
    for (const state of states) {
      const eth = state.identities?.find((i) => i.kind === 'ETHEREUM');
      if (eth) walletByInboxId.set(String(state.inboxId), eth.identifier.toLowerCase());
    }
  } catch (err) {
    console.warn('[xmtp] resolveSenderWallet failed', err);
  }
  return walletByInboxId.get(inboxId) ?? null;
}

/**
 * Message-level unread count for one XMTP dm (parity with the Supabase
 * get_unread_count semantics). Bounded at 99 per conversation.
 */
export async function countXmtpUnread(
  handle: XmtpClientHandle,
  dm: Dm<any>,
  lastReadAtIso: string | null
): Promise<number> {
  try {
    const afterNs = lastReadAtIso ? Date.parse(lastReadAtIso) * 1e6 : 0;
    const msgs = await dm.messages({ afterNs, limit: 99 });
    return msgs.filter(
      (m) =>
        m.senderInboxId !== handle.inboxId &&
        m.contentTypeId !== CONTENT_TYPE_READ_RECEIPT &&
        !isReactionType(m.contentTypeId)
    ).length;
  } catch {
    return 0;
  }
}

// ── Consent (blocking) ─────────────────────────────────────────────

export async function getXmtpConsentState(
  dm: Dm<any>
): Promise<'allowed' | 'denied' | 'unknown'> {
  try {
    return await dm.consentState();
  } catch {
    return 'unknown';
  }
}

export async function blockXmtpConversation(dm: Dm<any>): Promise<void> {
  await dm.updateConsent('denied');
}

export async function unblockXmtpConversation(dm: Dm<any>): Promise<void> {
  await dm.updateConsent('allowed');
}
