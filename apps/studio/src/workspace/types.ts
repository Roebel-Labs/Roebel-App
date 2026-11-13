// Subset of the chat contract (apps/web/src/lib/chat/types.ts ≡ apps/expo/lib/chat/types.ts) that
// the studio renders. Unknown part types are shown as a neutral placeholder, never dropped silently.

export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'options'; question: string; options: { key: string; label: string }[]; selected?: string | null; dismissed?: boolean }
  | { type: 'file'; fileId: string; name: string; ext: string; size: number }
  | { type: 'image'; url: string; width?: number; height?: number }
  | { type: 'sources'; items: { title: string; url: string }[] }
  | {
      type: 'approval';
      actionId: string;
      tool: string;
      risk: 'public' | 'money' | 'external';
      title: string;
      summary: string;
      preview: { kind: string; fields: { label: string; value: string }[]; body?: string; imageUrl?: string };
      status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired';
      resultNote?: string;
      canAlwaysAllow: boolean;
    }
  | { type: 'task'; taskId: string; title: string; status: string; steps: { label: string; status: string }[] }
  | { type: 'generated_image'; imageId: string; status: 'generating' | 'done' | 'failed'; prompt: string; url?: string; error?: string }
  | { type: 'calendar_event'; title: string; start: string; end: string; location?: string; status: string }
  | { type: string; [k: string]: unknown };

export interface BotAvatarSpec {
  shape: string;
  color: string;
  eyes: string;
  /** Illustrated agent character (src/agent/characters.ts). */
  character?: string;
}

export interface ChatBot {
  id: string;
  name: string;
  description: string;
  avatar: BotAvatarSpec;
  isPreset: boolean;
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

export interface ChatBootstrap {
  presets: ChatBot[];
  bots: ChatBot[];
  threads: ChatThread[];
  tier: string;
  quota: { used: number; limit: number };
}

export type ChatStreamEvent =
  | { type: 'user'; message: ChatMessage }
  | { type: 'bot_start'; botId: string; messageId: string }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'part'; messageId: string; part: ChatPart }
  | { type: 'bot_done'; message: ChatMessage }
  | { type: 'done'; thread: ChatThread }
  | { type: 'error'; code: string; message: string };
