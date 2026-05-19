import { supabase } from './supabase';
import type { OrgSubType } from './types';

// ── Types ──────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  participant_one_account_id: string;
  participant_two_account_id: string;
  // Legacy wallet fields — still present in DB but unused by new code.
  participant_one?: string | null;
  participant_two?: string | null;
  created_at: string;
}

export interface MessageStickerRef {
  id: string;
  type: 'sticker' | 'animated_sticker';
  name: string;
  asset_url: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_account_id: string;
  sender_address?: string | null; // legacy
  content: string;
  sticker_reward_id: string | null;
  sticker?: MessageStickerRef | null;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  // Peer (the OTHER participant relative to the caller's active account).
  peerAccountId: string;
  peerAccountType: 'personal' | 'organisation';
  peerSubType: OrgSubType | null;
  peerName: string;
  peerSlug: string | null;
  peerUsername: string | null;
  peerIsVerified: boolean;
  peerAvatarUrl: string | null;
  peerEquippedFrameUrl: string | null;
  // Legacy display fields kept so older render code keeps compiling.
  peerAddress: string;
  peerProfilePictureUrl: string | null;
  peerProfileFrameUrl?: string | null;
  lastMessage: Message | null;
  lastReadAt: string | null;
  hasUnread: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

// Conversations are pair-keyed: order the two ids so (a,b) and (b,a) hash
// to the same row. Plain string compare is stable for uuids.
function orderedIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// Never render a wallet address as a display name. Some legacy `accounts.name`
// rows were defaulted to the owner wallet — strip those out at the UI boundary.
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
export function safeDisplayName(
  name: string | null | undefined,
  username: string | null | undefined
): string {
  if (username && !WALLET_RE.test(username)) return username;
  if (name && !WALLET_RE.test(name)) return name;
  return 'Unbekannt';
}

// ── Queries ────────────────────────────────────────────────────────

export async function findOrCreateConversation(
  myAccountId: string,
  peerAccountId: string
): Promise<Conversation | null> {
  if (myAccountId === peerAccountId) return null;
  const [p1, p2] = orderedIds(myAccountId, peerAccountId);

  // Write BOTH the new account-id columns and the legacy wallet columns.
  // The legacy columns are NOT NULL with a `participant_one < participant_two`
  // CHECK; using the same ordered uuid satisfies both. The legacy
  // `(participant_one, participant_two)` unique index is always present,
  // so we use it as the conflict target — that works regardless of whether
  // the round-2 fixup migration has been applied yet.
  const { data, error } = await supabase
    .from('conversations' as any)
    .upsert(
      {
        participant_one: p1,
        participant_two: p2,
        participant_one_account_id: p1,
        participant_two_account_id: p2,
      } as any,
      { onConflict: 'participant_one,participant_two' }
    )
    .select()
    .single();

  if (error) {
    console.error('findOrCreateConversation error:', error);
    return null;
  }

  const convo = data as Conversation;

  // Ensure participant rows exist for read tracking, one per account. Mirror
  // the account id into the legacy wallet_address column so the original
  // (conversation_id, wallet_address) PK is satisfied without the migration.
  await supabase
    .from('conversation_participants' as any)
    .upsert(
      [
        { conversation_id: convo.id, wallet_address: p1, account_id: p1 },
        { conversation_id: convo.id, wallet_address: p2, account_id: p2 },
      ] as any,
      { onConflict: 'conversation_id,wallet_address' }
    );

  return convo;
}

type AccountFields = {
  id: string;
  account_type: 'personal' | 'organisation';
  sub_type: OrgSubType | null;
  name: string;
  slug: string | null;
  avatar_url: string | null;
  is_verified: boolean;
};

type UserFields = {
  wallet_address: string;
  username: string | null;
  equipped_frame_asset_url: string | null;
};

export async function fetchConversations(
  myAccountId: string
): Promise<ConversationWithLastMessage[]> {
  if (!myAccountId) return [];

  const { data: rawConvos, error } = await supabase
    .from('conversations' as any)
    .select('*')
    .or(
      `participant_one_account_id.eq.${myAccountId},participant_two_account_id.eq.${myAccountId}`
    )
    .order('created_at', { ascending: false });

  if (error || !rawConvos?.length) {
    if (error) console.error('fetchConversations error:', error);
    return [];
  }

  const convos = rawConvos as Conversation[];

  // Collect peer account ids so we can batch-fetch their account fields.
  const peerIds = Array.from(
    new Set(
      convos.map((c) =>
        c.participant_one_account_id === myAccountId
          ? c.participant_two_account_id
          : c.participant_one_account_id
      )
    )
  ).filter(Boolean);

  const accountById = new Map<string, AccountFields>();
  if (peerIds.length > 0) {
    const { data: accounts } = await supabase
      .from('accounts' as any)
      .select('id, account_type, sub_type, name, slug, avatar_url, is_verified')
      .in('id', peerIds);
    for (const a of (accounts ?? []) as AccountFields[]) {
      accountById.set(a.id, a);
    }
  }

  // For personal peers, additionally pull username + equipped frame from
  // their owner wallet's `users` row.
  const personalAccountIds = peerIds.filter(
    (id) => accountById.get(id)?.account_type === 'personal'
  );
  const userByAccountId = new Map<string, UserFields>();
  if (personalAccountIds.length > 0) {
    const { data: ownerRows } = await supabase
      .from('account_owners' as any)
      .select('account_id, wallet_address')
      .in('account_id', personalAccountIds);
    const walletByAccount = new Map<string, string>();
    for (const r of (ownerRows ?? []) as Array<{ account_id: string; wallet_address: string }>) {
      // Personal accounts have a single owner; first row wins if duplicates exist.
      if (!walletByAccount.has(r.account_id)) {
        walletByAccount.set(r.account_id, r.wallet_address);
      }
    }
    const wallets = Array.from(new Set(walletByAccount.values()));
    if (wallets.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('wallet_address, username, equipped_frame_asset_url')
        .in('wallet_address', wallets);
      const userByWallet = new Map<string, UserFields>();
      for (const u of (users ?? []) as UserFields[]) {
        userByWallet.set(u.wallet_address, u);
      }
      for (const [accountId, wallet] of walletByAccount.entries()) {
        const u = userByWallet.get(wallet);
        if (u) userByAccountId.set(accountId, u);
      }
    }
  }

  // Fire all per-conversation queries in parallel — with 5+ chats this is
  // the difference between feeling laggy and feeling instant on cold open.
  const rows = await Promise.all(
    convos.map(async (convo) => {
      const peerId =
        convo.participant_one_account_id === myAccountId
          ? convo.participant_two_account_id
          : convo.participant_one_account_id;
      if (!peerId) return null;

      const peerAccount = accountById.get(peerId);
      if (!peerAccount) return null;

      const peerUser = userByAccountId.get(peerId);

      const [{ data: msgs }, { data: cp }] = await Promise.all([
        supabase
          .from('direct_messages' as any)
          .select('*, sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)')
          .eq('conversation_id', convo.id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('conversation_participants' as any)
          .select('last_read_at')
          .eq('conversation_id', convo.id)
          .eq('account_id', myAccountId)
          .maybeSingle(),
      ]);

      const lastMessage: Message | null = (msgs as Message[] | null)?.[0] ?? null;
      const lastReadAt: string | null = (cp as any)?.last_read_at ?? null;

      const hasUnread =
        !!lastMessage &&
        lastMessage.sender_account_id !== myAccountId &&
        (!lastReadAt || new Date(lastMessage.created_at) > new Date(lastReadAt));

      return {
        ...convo,
        peerAccountId: peerId,
        peerAccountType: peerAccount.account_type,
        peerSubType: peerAccount.sub_type,
        peerName: peerAccount.name,
        peerSlug: peerAccount.slug,
        peerUsername: peerUser?.username ?? null,
        peerIsVerified: peerAccount.is_verified,
        peerAvatarUrl: peerAccount.avatar_url,
        peerEquippedFrameUrl: peerUser?.equipped_frame_asset_url ?? null,
        // Legacy mirror fields kept for back-compat with older renderers.
        peerAddress: peerId,
        peerProfilePictureUrl: peerAccount.avatar_url,
        lastMessage,
        lastReadAt,
        hasUnread,
      } satisfies ConversationWithLastMessage;
    })
  );

  const results = rows.filter((r): r is ConversationWithLastMessage => r !== null);

  results.sort((a, b) => {
    const ta = a.lastMessage?.created_at ?? a.created_at;
    const tb = b.lastMessage?.created_at ?? b.created_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  return results;
}

export async function fetchMessages(
  conversationId: string,
  limit: number,
  beforeDate?: string
): Promise<Message[]> {
  let query = supabase
    .from('direct_messages' as any)
    .select('*, sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (beforeDate) {
    query = query.lt('created_at', beforeDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchMessages error:', error);
    return [];
  }
  return (data as Message[] | null) ?? [];
}

export async function sendMessage(
  conversationId: string,
  senderAccountId: string,
  content: string,
  stickerRewardId: string | null = null
): Promise<Message | null> {
  // Mirror sender_account_id into the legacy NOT NULL `sender_address` so the
  // insert works against the pre-migration schema too.
  const { data, error } = await supabase
    .from('direct_messages' as any)
    .insert({
      conversation_id: conversationId,
      sender_address: senderAccountId,
      sender_account_id: senderAccountId,
      content,
      sticker_reward_id: stickerRewardId,
    } as any)
    .select('*, sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)')
    .single();

  if (error) {
    console.error('sendMessage error:', error);
    return null;
  }
  return data as Message;
}

export async function markConversationRead(
  conversationId: string,
  accountId: string
): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants' as any)
    .upsert(
      {
        conversation_id: conversationId,
        wallet_address: accountId,
        account_id: accountId,
        last_read_at: new Date().toISOString(),
      } as any,
      { onConflict: 'conversation_id,wallet_address' }
    );

  if (error) console.error('markConversationRead error:', error);
}

export async function getUnreadCount(accountId: string): Promise<number> {
  const { data, error } = await (supabase.rpc as any)('get_unread_count', {
    p_account_id: accountId,
  });

  if (error) {
    console.error('getUnreadCount error:', error);
    return 0;
  }
  return (data as number) ?? 0;
}

// ── Wallet → personal account resolver ─────────────────────────────
// Used by deep links that arrive with a peer wallet address (e.g. the
// marketplace "contact seller" CTA) so we can convert them to the
// account-keyed conversation model.
export async function fetchPersonalAccountIdByWallet(
  walletAddress: string
): Promise<string | null> {
  const normalized = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from('account_owners' as any)
    .select('account_id, accounts:account_id(id, account_type)')
    .eq('wallet_address', normalized);

  if (error || !data) return null;

  const rows = data as Array<{
    account_id: string;
    accounts: { id: string; account_type: 'personal' | 'organisation' } | null;
  }>;
  const personal = rows.find((r) => r.accounts?.account_type === 'personal');
  return personal?.account_id ?? null;
}

// Hydrate a Message row (e.g. from a realtime payload) with its joined
// sticker reward when applicable. Exposed so useConversation can call it
// from the realtime handler.
export async function hydrateMessageSticker(msg: Message): Promise<Message> {
  if (!msg.sticker_reward_id) return msg;
  const { data } = await supabase
    .from('lootbox_rewards')
    .select('id, type, name, asset_url')
    .eq('id', msg.sticker_reward_id)
    .maybeSingle();
  if (data) return { ...msg, sticker: data as MessageStickerRef };
  return msg;
}
