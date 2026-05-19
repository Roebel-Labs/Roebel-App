export interface Conversation {
  id: string;
  participant_one_account_id: string;
  participant_two_account_id: string;
  // Legacy wallet fields — still present in DB but mirror the account ids.
  participant_one?: string | null;
  participant_two?: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_account_id: string;
  sender_address?: string | null; // legacy mirror
  content: string;
  created_at: string;
}

export interface PeerAccountMeta {
  accountId: string;
  accountType: "personal" | "organisation";
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  username: string | null;
  isVerified: boolean;
  walletAddress: string | null;
}

export interface ConversationWithMeta {
  conversation: Conversation;
  peerAccountId: string;
  peer: PeerAccountMeta | null;
  lastMessage: string | null;
  lastMessageTime: Date | null;
  unreadCount: number;
}

export interface ContactInfo {
  accountId: string;
  walletAddress: string | null;
  accountType: "personal" | "organisation";
  name: string;
  username: string | null;
  profilePictureUrl: string | null;
  isCitizen: boolean;
}

export interface MessagingContextValue {
  isReady: boolean;
  walletAddress: string | null;
  activeAccountId: string | null;
}
