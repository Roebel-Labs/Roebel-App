import { supabase } from './supabase';

// ── Types ──────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  participant_one: string;
  participant_two: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_address: string;
  content: string;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  peerAddress: string;
  lastMessage: Message | null;
  lastReadAt: string | null;
  hasUnread: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

function ordered(a: string, b: string): [string, string] {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la < lb ? [la, lb] : [lb, la];
}

// ── Queries ────────────────────────────────────────────────────────

export async function findOrCreateConversation(
  myAddress: string,
  peerAddress: string
): Promise<Conversation | null> {
  const [p1, p2] = ordered(myAddress, peerAddress);

  // Upsert conversation
  const { data, error } = await supabase
    .from('conversations' as any)
    .upsert(
      { participant_one: p1, participant_two: p2 } as any,
      { onConflict: 'participant_one,participant_two' }
    )
    .select()
    .single();

  if (error) {
    console.error('findOrCreateConversation error:', error);
    return null;
  }

  const convo = data as Conversation;

  // Ensure participant rows exist for read tracking
  const myAddr = myAddress.toLowerCase();
  const peerAddr = peerAddress.toLowerCase();
  await supabase
    .from('conversation_participants' as any)
    .upsert(
      [
        { conversation_id: convo.id, wallet_address: myAddr },
        { conversation_id: convo.id, wallet_address: peerAddr },
      ] as any,
      { onConflict: 'conversation_id,wallet_address' }
    );

  return convo;
}

export async function fetchConversations(
  walletAddress: string
): Promise<ConversationWithLastMessage[]> {
  const addr = walletAddress.toLowerCase();

  // Get all conversations where user is a participant
  const { data: rawConvos, error } = await supabase
    .from('conversations' as any)
    .select('*')
    .or(`participant_one.eq.${addr},participant_two.eq.${addr}`)
    .order('created_at', { ascending: false });

  if (error || !rawConvos?.length) {
    if (error) console.error('fetchConversations error:', error);
    return [];
  }

  const convos = rawConvos as Conversation[];

  // Fetch last message + read tracking for each conversation
  const results: ConversationWithLastMessage[] = [];

  for (const convo of convos) {
    const peerAddress =
      convo.participant_one === addr ? convo.participant_two : convo.participant_one;

    // Last message
    const { data: msgs } = await supabase
      .from('direct_messages' as any)
      .select('*')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastMessage: Message | null = (msgs as Message[] | null)?.[0] ?? null;

    // Read tracking
    const { data: cp } = await supabase
      .from('conversation_participants' as any)
      .select('last_read_at')
      .eq('conversation_id', convo.id)
      .eq('wallet_address', addr)
      .single();

    const lastReadAt: string | null = (cp as any)?.last_read_at ?? null;

    const hasUnread =
      !!lastMessage &&
      lastMessage.sender_address !== addr &&
      (!lastReadAt || new Date(lastMessage.created_at) > new Date(lastReadAt));

    results.push({ ...convo, peerAddress, lastMessage, lastReadAt, hasUnread });
  }

  // Sort by last message time (newest first), then by created_at
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
    .select('*')
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
  senderAddress: string,
  content: string
): Promise<Message | null> {
  const { data, error } = await supabase
    .from('direct_messages' as any)
    .insert({
      conversation_id: conversationId,
      sender_address: senderAddress.toLowerCase(),
      content,
    } as any)
    .select()
    .single();

  if (error) {
    console.error('sendMessage error:', error);
    return null;
  }
  return data as Message;
}

export async function markConversationRead(
  conversationId: string,
  walletAddress: string
): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants' as any)
    .upsert(
      {
        conversation_id: conversationId,
        wallet_address: walletAddress.toLowerCase(),
        last_read_at: new Date().toISOString(),
      } as any,
      { onConflict: 'conversation_id,wallet_address' }
    );

  if (error) console.error('markConversationRead error:', error);
}

export async function getUnreadCount(walletAddress: string): Promise<number> {
  const { data, error } = await (supabase.rpc as any)('get_unread_count', {
    p_wallet: walletAddress.toLowerCase(),
  });

  if (error) {
    console.error('getUnreadCount error:', error);
    return 0;
  }
  return (data as number) ?? 0;
}
