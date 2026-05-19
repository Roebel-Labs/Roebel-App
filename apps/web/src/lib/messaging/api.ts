import { supabase } from "../supabase";
import type {
  Conversation,
  Message,
  ConversationWithMeta,
  PeerAccountMeta,
} from "./types";

// Conversations are pair-keyed: order the two ids so (a,b) and (b,a) hash
// to the same row. Plain string compare is stable for uuids.
function orderedIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Find or create a 1:1 conversation between two ACCOUNTS.
 *
 * The DB has both the new `participant_*_account_id` columns and the legacy
 * `participant_one`/`participant_two` wallet columns. The legacy columns are
 * NOT NULL with a `participant_one < participant_two` CHECK, so we mirror the
 * ordered account_ids into them. The unique index `(participant_one,
 * participant_two)` is always present, so we use it as the conflict target.
 *
 * Mirrors apps/expo/lib/supabase-messages.ts so writes from web and mobile
 * land on the same rows.
 */
export async function getOrCreateConversation(
  myAccountId: string,
  peerAccountId: string
): Promise<Conversation> {
  if (myAccountId === peerAccountId) {
    throw new Error("Cannot create conversation with yourself");
  }
  const [p1, p2] = orderedIds(myAccountId, peerAccountId);

  const { data, error } = await supabase
    .from("conversations")
    .upsert(
      {
        participant_one: p1,
        participant_two: p2,
        participant_one_account_id: p1,
        participant_two_account_id: p2,
      },
      { onConflict: "participant_one,participant_two" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create conversation: ${error?.message ?? "unknown"}`
    );
  }

  const convo = data as Conversation;

  // Mirror account_id into wallet_address to satisfy the legacy NOT NULL PK
  // on (conversation_id, wallet_address). This matches the expo writer.
  await supabase.from("conversation_participants").upsert(
    [
      { conversation_id: convo.id, wallet_address: p1, account_id: p1 },
      { conversation_id: convo.id, wallet_address: p2, account_id: p2 },
    ],
    { onConflict: "conversation_id,wallet_address" }
  );

  return convo;
}

type AccountRow = {
  id: string;
  account_type: "personal" | "organisation";
  name: string;
  slug: string | null;
  avatar_url: string | null;
  is_verified: boolean;
};

type AccountOwnerRow = {
  account_id: string;
  wallet_address: string;
};

type UserRow = {
  wallet_address: string;
  username: string | null;
};

async function fetchPeerMeta(
  peerAccountIds: string[]
): Promise<Map<string, PeerAccountMeta>> {
  const out = new Map<string, PeerAccountMeta>();
  if (peerAccountIds.length === 0) return out;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_type, name, slug, avatar_url, is_verified")
    .in("id", peerAccountIds);

  const accountById = new Map<string, AccountRow>();
  for (const a of (accounts ?? []) as AccountRow[]) {
    accountById.set(a.id, a);
  }

  // For personal peers, look up the owner wallet so we can pull username +
  // legacy wallet address (used by older UI bits and deep-links).
  const personalIds = peerAccountIds.filter(
    (id) => accountById.get(id)?.account_type === "personal"
  );

  const walletByAccount = new Map<string, string>();
  if (personalIds.length > 0) {
    const { data: owners } = await supabase
      .from("account_owners")
      .select("account_id, wallet_address")
      .in("account_id", personalIds);

    for (const r of (owners ?? []) as AccountOwnerRow[]) {
      if (!walletByAccount.has(r.account_id)) {
        walletByAccount.set(r.account_id, r.wallet_address);
      }
    }
  }

  const userByWallet = new Map<string, UserRow>();
  const wallets = Array.from(new Set(walletByAccount.values()));
  if (wallets.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("wallet_address, username")
      .in("wallet_address", wallets);
    for (const u of (users ?? []) as UserRow[]) {
      userByWallet.set(u.wallet_address, u);
    }
  }

  for (const id of peerAccountIds) {
    const account = accountById.get(id);
    if (!account) continue;
    const wallet = walletByAccount.get(id) ?? null;
    const user = wallet ? userByWallet.get(wallet) ?? null : null;
    out.set(id, {
      accountId: id,
      accountType: account.account_type,
      name: account.name,
      slug: account.slug,
      avatarUrl: account.avatar_url,
      username: user?.username ?? null,
      isVerified: account.is_verified,
      walletAddress: wallet,
    });
  }

  return out;
}

/**
 * Get all conversations for the given account, with peer metadata and a
 * single-row last-message preview per conversation.
 */
export async function getConversationsForUser(
  accountId: string
): Promise<ConversationWithMeta[]> {
  if (!accountId) return [];

  const { data: rawConvos, error } = await supabase
    .from("conversations")
    .select("*")
    .or(
      `participant_one_account_id.eq.${accountId},participant_two_account_id.eq.${accountId}`
    )
    .order("created_at", { ascending: false });

  if (error || !rawConvos || rawConvos.length === 0) return [];
  const convos = rawConvos as Conversation[];

  const peerIds = Array.from(
    new Set(
      convos
        .map((c) =>
          c.participant_one_account_id === accountId
            ? c.participant_two_account_id
            : c.participant_one_account_id
        )
        .filter(Boolean)
    )
  );

  const peerById = await fetchPeerMeta(peerIds);

  // Batch fetch read timestamps for this account across all conversations.
  const convoIds = convos.map((c) => c.id);
  const { data: cps } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("account_id", accountId)
    .in("conversation_id", convoIds);

  const readMap = new Map<string, string | null>();
  for (const p of (cps ?? []) as Array<{
    conversation_id: string;
    last_read_at: string | null;
  }>) {
    readMap.set(p.conversation_id, p.last_read_at);
  }

  // Fire per-conversation last-message + unread-count queries in parallel.
  const rows = await Promise.all(
    convos.map(async (convo) => {
      const peerId =
        convo.participant_one_account_id === accountId
          ? convo.participant_two_account_id
          : convo.participant_one_account_id;
      if (!peerId) return null;

      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMsg = (msgs as Message[] | null)?.[0] ?? null;

      let unreadCount = 0;
      const lastReadAt = readMap.get(convo.id) ?? null;
      const { count } = await supabase
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", convo.id)
        .neq("sender_account_id", accountId)
        .gt("created_at", lastReadAt ?? "1970-01-01");
      unreadCount = count ?? 0;

      return {
        conversation: convo,
        peerAccountId: peerId,
        peer: peerById.get(peerId) ?? null,
        lastMessage: lastMsg?.content ?? null,
        lastMessageTime: lastMsg ? new Date(lastMsg.created_at) : null,
        unreadCount,
      } satisfies ConversationWithMeta;
    })
  );

  const results = rows.filter((r): r is ConversationWithMeta => r !== null);

  results.sort((a, b) => {
    if (!a.lastMessageTime && !b.lastMessageTime) return 0;
    if (!a.lastMessageTime) return 1;
    if (!b.lastMessageTime) return -1;
    return b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
  });

  return results;
}

/**
 * Get messages for a conversation.
 */
export async function getMessages(
  conversationId: string,
  limit = 100
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []) as Message[];
}

/**
 * Send a message in a conversation as the given account.
 *
 * Mirrors `sender_account_id` into the legacy NOT NULL `sender_address`
 * column so the insert satisfies the pre-migration schema (same approach
 * used by apps/expo).
 */
export async function sendMessage(
  conversationId: string,
  senderAccountId: string,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      conversation_id: conversationId,
      sender_address: senderAccountId,
      sender_account_id: senderAccountId,
      content,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to send message: ${error.message}`);
  return data as Message;
}

/**
 * Mark a conversation as read for the given account.
 */
export async function markConversationRead(
  conversationId: string,
  accountId: string
): Promise<void> {
  await supabase.from("conversation_participants").upsert(
    {
      conversation_id: conversationId,
      wallet_address: accountId,
      account_id: accountId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,wallet_address" }
  );
}

/**
 * Get total unread message count for an account across all conversations.
 *
 * Uses the same `get_unread_count` RPC that the expo client uses.
 */
export async function getUnreadCount(accountId: string): Promise<number> {
  if (!accountId) return 0;
  const { data, error } = await supabase.rpc("get_unread_count", {
    p_account_id: accountId,
  });

  if (error) {
    console.warn("Error getting unread count:", error);
    return 0;
  }
  return (data as number) ?? 0;
}

/**
 * Resolve a wallet address to its personal account id. Used by deep-links
 * (e.g. marketplace "contact seller") that arrive with a peer wallet rather
 * than an account_id.
 */
export async function findPersonalAccountIdByWallet(
  walletAddress: string
): Promise<string | null> {
  const normalized = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from("account_owners")
    .select("account_id, accounts:account_id(id, account_type)")
    .eq("wallet_address", normalized);

  if (error || !data) return null;

  type Row = {
    account_id: string;
    accounts:
      | { id: string; account_type: "personal" | "organisation" }
      | { id: string; account_type: "personal" | "organisation" }[]
      | null;
  };
  const rows = data as unknown as Row[];
  const personal = rows.find((r) => {
    const acc = Array.isArray(r.accounts) ? r.accounts[0] : r.accounts;
    return acc?.account_type === "personal";
  });
  return personal?.account_id ?? null;
}
