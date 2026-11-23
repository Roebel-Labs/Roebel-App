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
    }
  | {
      type: 'approval';
      actionId: string;
      tool: string;
      risk: 'public' | 'money' | 'external';
      title: string;
      summary: string;
      preview: ApprovalPreview;
      status: ApprovalStatus;
      resultNote?: string;
      canAlwaysAllow: boolean;
      // money only; toWallet (lower-case) is for signing on the device, never displayed
      signRequest?: { kind: 'muenzen_transfer'; toName: string; amount: string; toWallet?: string };
    }
  | {
      type: 'task';
      taskId: string;
      title: string;
      status: 'queued' | 'running' | 'waiting_approval' | 'done' | 'failed' | 'cancelled';
      steps: { label: string; status: 'pending' | 'running' | 'done' | 'failed' }[];
    }
  | {
      // AI-generated image (images pack). Updated in place by imageId: generating → done | failed.
      // width/height = target size while generating (aspect for the placeholder), real size when done.
      type: 'generated_image';
      imageId: string;
      status: GeneratedImageStatus;
      prompt: string;
      url?: string;
      width?: number;
      height?: number;
      error?: string; // German reason when failed
    }
  | {
      // Day-by-day plan the agent shows (e.g. the week's marked events). Read-only card;
      // only sent to clients that list 'schedule' in the send body's partTypes.
      type: 'schedule';
      title: string;
      subtitle?: string;
      days: { date: string; items: ScheduleItem[] }[]; // date = YYYY-MM-DD, sorted
      empty?: string; // text when days is empty
    };

export type GeneratedImageStatus = 'generating' | 'done' | 'failed';

/** One entry of a schedule part. */
export interface ScheduleItem {
  title: string;
  time?: string | null; // HH:mm
  location?: string | null;
  url?: string | null;
  tag?: string | null; // short label, e.g. "Vorgemerkt" or the org name
}

export type CalendarEventStatus = 'proposed' | 'added' | 'dismissed';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired';

/** Rich preview on an approval card (agent harness spec §3). */
export interface ApprovalPreview {
  kind: 'text' | 'post' | 'event' | 'listing' | 'message' | 'email' | 'transfer' | 'generic';
  fields: { label: string; value: string }[];
  body?: string; // main text (post body, email body)
  imageUrl?: string;
}

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
  /** Illustrated agent character (lib/chat/characters.ts); unknown ids fall back to the initial tile. */
  character?: string;
  /** Personality preset key of a character agent (the main assistant uses its profile's instead). */
  personality?: string;
  /**
   * Own uploaded picture or house artwork (presets). Wins over the character. shape/eyes are legacy fields
   * the app no longer draws (see lib/chat/avatar-picture.ts for the picture rule).
   */
  imageUrl?: string;
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
