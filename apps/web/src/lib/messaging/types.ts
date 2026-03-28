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

export interface ConversationWithMeta {
  conversation: Conversation;
  peerAddress: string;
  lastMessage: string | null;
  lastMessageTime: Date | null;
  unreadCount: number;
}

export interface ContactInfo {
  walletAddress: string;
  username: string | null;
  profilePictureUrl: string | null;
  isCitizen: boolean;
}

export interface MessagingContextValue {
  isReady: boolean;
  walletAddress: string | null;
}
