// Shared message-part contract (spec §3.4). The contract block below must stay
// identical to apps/expo/lib/chat/types.ts. Server-only extras (SSE events,
// routines, tiers) follow after the contract block.

// ---- contract (≡ apps/expo/lib/chat/types.ts) --------------------------------

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

// ---- server extras -----------------------------------------------------------

export const BOT_SHAPES: readonly BotShape[] = ['circle', 'cloud', 'drop', 'hexagon', 'squircle', 'pill', 'triangle', 'egg', 'blob'];
export const BOT_EYES: readonly BotEyes[] = ['dots', 'dashes', 'wink', 'happy'];

export type ChatTier = 'free' | 'plus' | 'ultra';
export type ModelRoute = 'bot-fast' | 'bot-smart' | 'vision';

export interface ChatQuota {
  used: number;
  limit: number;
}

export interface ChatBootstrap {
  presets: ChatBot[];
  bots: ChatBot[];
  threads: ChatThread[];
  tier: ChatTier;
  quota: ChatQuota;
}

export interface RoutineSchedule {
  kind: 'weekly' | 'daily';
  /** 0 = Sunday … 6 = Saturday (JS getDay convention). Required for weekly. */
  weekday?: number;
  hour: number;
  minute: number;
  tz: 'Europe/Berlin';
}

export interface ChatRoutine {
  id: string;
  threadId: string;
  botId: string;
  title: string;
  schedule: RoutineSchedule;
  prompt: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export interface ChatFile {
  id: string;
  name: string;
  ext: string;
  size: number;
  content: string;
}

export interface ChatErrorBody {
  error: { code: string; message: string };
}

/** POST /api/chat/threads/:id/messages body. */
export interface SendMessageInput {
  text: string;
  imageUrls?: string[];
  replyToId?: string;
  mentionBotIds?: string[];
  optionAnswer?: { messageId: string; key: string };
  /** Upcoming device-calendar events (next 7 days, ≤ 50); absent = no read access. */
  calendarContext?: CalendarContextEvent[];
}

/** SSE events of the send-message stream, in order (spec §3.5). */
export type ChatStreamEvent =
  | { event: 'user'; data: { message: ChatMessage } }
  | { event: 'bot_start'; data: { botId: string; messageId: string } }
  | { event: 'delta'; data: { messageId: string; text: string } }
  | { event: 'part'; data: { messageId: string; part: ChatPart } }
  | { event: 'bot_done'; data: { message: ChatMessage } }
  | { event: 'done'; data: { thread: ChatThread } }
  | { event: 'error'; data: { code: string; message: string } };

export type ChatStreamEventName = ChatStreamEvent['event'];
