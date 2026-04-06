export interface Conversation {
  id: string;
  participant_one: string;
  participant_two: string;
  participant_one_account?: string | null;
  participant_two_account?: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_address: string;
  sender_account_id?: string | null;
  content: string;
  created_at: string;
}

export interface ConversationWithMeta {
  conversation: Conversation;
  peerAddress: string;
  peerAccountId?: string | null;
  peerAccountName?: string | null;
  lastMessage: string | null;
  lastMessageTime: Date | null;
  unreadCount: number;
}

export interface ContactInfo {
  walletAddress: string;
  username: string | null;
  profilePictureUrl: string | null;
  isCitizen: boolean;
  accountId?: string | null;
  accountName?: string | null;
}

export interface MessagingContextValue {
  isReady: boolean;
  walletAddress: string | null;
  activeAccountId?: string | null;
}
