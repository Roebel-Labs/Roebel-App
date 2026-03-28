import { supabase } from "../supabase";
import type { Conversation, Message, ConversationWithMeta } from "./types";

/**
 * Canonicalize two addresses: lowercase + sort so participant_one < participant_two.
 */
function canonicalize(a: string, b: string): [string, string] {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la < lb ? [la, lb] : [lb, la];
}

/**
 * Find or create a 1:1 conversation between two wallet addresses.
 */
export async function getOrCreateConversation(
  addressA: string,
  addressB: string
): Promise<Conversation> {
  const [participantOne, participantTwo] = canonicalize(addressA, addressB);

  // Try to find existing
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("participant_one", participantOne)
    .eq("participant_two", participantTwo)
    .single();

  if (existing) return existing as Conversation;

  // Create new conversation
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ participant_one: participantOne, participant_two: participantTwo })
    .select()
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);

  // Create participant entries for read tracking
  await supabase.from("conversation_participants").insert([
    { conversation_id: created.id, wallet_address: participantOne },
    { conversation_id: created.id, wallet_address: participantTwo },
  ]);

  return created as Conversation;
}

/**
 * Get all conversations for a user with last message and unread count.
 */
export async function getConversationsForUser(
  walletAddress: string
): Promise<ConversationWithMeta[]> {
  const addr = walletAddress.toLowerCase();

  // Get all conversations where user is a participant
  const { data: convos, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`participant_one.eq.${addr},participant_two.eq.${addr}`)
    .order("created_at", { ascending: false });

  if (error || !convos) return [];

  // Get participant read timestamps
  const convoIds = convos.map((c) => c.id);
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("*")
    .eq("wallet_address", addr)
    .in("conversation_id", convoIds);

  const readMap = new Map<string, string>();
  for (const p of participants || []) {
    readMap.set(p.conversation_id, p.last_read_at);
  }

  // Build ConversationWithMeta for each conversation
  const results: ConversationWithMeta[] = [];

  for (const convo of convos) {
    const peerAddress =
      convo.participant_one === addr
        ? convo.participant_two
        : convo.participant_one;

    // Get last message
    const { data: lastMsgs } = await supabase
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastMsg = lastMsgs?.[0] || null;

    // Count unread messages
    let unreadCount = 0;
    const lastReadAt = readMap.get(convo.id);
    if (lastReadAt) {
      const { count } = await supabase
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", convo.id)
        .neq("sender_address", addr)
        .gt("created_at", lastReadAt);
      unreadCount = count || 0;
    }

    results.push({
      conversation: convo as Conversation,
      peerAddress,
      lastMessage: lastMsg?.content || null,
      lastMessageTime: lastMsg ? new Date(lastMsg.created_at) : null,
      unreadCount,
    });
  }

  // Sort by most recent message
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
  return (data || []) as Message[];
}

/**
 * Send a message in a conversation.
 */
export async function sendMessage(
  conversationId: string,
  senderAddress: string,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      conversation_id: conversationId,
      sender_address: senderAddress.toLowerCase(),
      content,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to send message: ${error.message}`);
  return data as Message;
}

/**
 * Mark a conversation as read for a user.
 */
export async function markConversationRead(
  conversationId: string,
  walletAddress: string
): Promise<void> {
  const addr = walletAddress.toLowerCase();

  await supabase
    .from("conversation_participants")
    .upsert(
      {
        conversation_id: conversationId,
        wallet_address: addr,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,wallet_address" }
    );
}

/**
 * Get total unread message count for a user across all conversations.
 */
export async function getUnreadCount(
  walletAddress: string
): Promise<number> {
  const addr = walletAddress.toLowerCase();
  const { data, error } = await supabase.rpc("get_unread_count", {
    p_wallet: addr,
  });

  if (error) {
    console.warn("Error getting unread count:", error);
    return 0;
  }
  return data || 0;
}
