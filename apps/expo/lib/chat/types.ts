// Shared message-part contract (spec §3.4). Must stay identical to apps/web/src/lib/chat/types.ts.

export type ChatPart =
  | { type: 'text'; text: string } // markdown allowed (links)
  | {
      type: 'options';
      question: string;
      options: { key: string; label: string }[];
      selected?: string | null;
      dismissed?: boolean;
    }
  | { type: 'file'; fileId: string; name: string; ext: string; size: number }
  | { type: 'image'; url: string; width?: number; height?: number }
  | {
      type: 'integration';
      provider: 'google_calendar';
      title: string;
      description: string;
      status: 'pending' | 'connected';
    }
  | { type: 'sources'; items: { title: string; url: string }[] };

export type BotShape = 'circle' | 'cloud' | 'drop' | 'hexagon' | 'squircle' | 'pill' | 'triangle' | 'egg' | 'blob';
export type BotEyes = 'dots' | 'dashes' | 'wink' | 'happy';

export interface BotAvatarSpec {
  shape: BotShape;
  color: string;
  eyes: BotEyes;
}

export interface ChatBot {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  avatar: BotAvatarSpec;
  isPreset: boolean;
  modelRoute: string;
}

export interface ChatThread {
  id: string;
  title: string;
  topic: string | null;
  kind: 'direct' | 'group';
  bots: ChatBot[];
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: boolean;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'bot' | 'system';
  botId: string | null;
  parts: ChatPart[];
  replyTo: { id: string; preview: string } | null;
  reactions: Record<string, number>;
  createdAt: string;
}
