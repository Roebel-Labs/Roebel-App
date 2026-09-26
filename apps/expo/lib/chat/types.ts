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
      provider: 'google_calendar' | 'device_calendar';
      title: string;
      description: string;
      status: 'pending' | 'connected';
    }
  | { type: 'sources'; items: { title: string; url: string }[] }
  | {
      type: 'calendar_event';
      title: string;
      start: string; // ISO 8601 with offset
      end: string; // ISO 8601 with offset
      location?: string;
      notes?: string;
      status: CalendarEventStatus;
    };

export type CalendarEventStatus = 'proposed' | 'added' | 'dismissed';

/** One upcoming device-calendar event the app sends along (send body `calendarContext`). */
export interface CalendarContextEvent {
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  location?: string;
}

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
  /** Enabled tool keys, e.g. 'web_search', 'files', 'ask_options', 'calendar'. */
  tools?: string[];
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
  /** ISO time the owner last read the thread; the "NEU" divider sits before the first newer bot message. */
  lastReadAt: string;
  /** At least one enabled routine posts into this thread (online dot in the chat list). */
  hasActiveRoutine: boolean;
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
