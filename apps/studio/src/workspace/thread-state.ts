// Pure message-list reducer: applies stream events (user echo, bot deltas, parts, final messages).
import type { ChatMessage, ChatStreamEvent } from './types';

export interface ThreadView {
  messages: ChatMessage[];
  /** Bot message ids still streaming. */
  streaming: string[];
  error: string | null;
}

export const emptyThread: ThreadView = { messages: [], streaming: [], error: null };

function upsert(list: ChatMessage[], m: ChatMessage): ChatMessage[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i === -1) return [...list, m];
  const next = list.slice();
  next[i] = m;
  return next;
}

/** A local echo of the user's text until the server's `user` event replaces it. */
export function optimisticUser(threadId: string, text: string, now = new Date()): ChatMessage {
  return {
    id: `local-${now.getTime()}`,
    threadId,
    role: 'user',
    botId: null,
    parts: [{ type: 'text', text }],
    replyTo: null,
    reactions: {},
    createdAt: now.toISOString(),
  };
}

export function applyEvent(view: ThreadView, threadId: string, e: ChatStreamEvent): ThreadView {
  switch (e.type) {
    case 'user': {
      const withoutLocal = view.messages.filter((m) => !m.id.startsWith('local-'));
      return { ...view, messages: upsert(withoutLocal, e.message) };
    }
    case 'bot_start': {
      if (view.messages.some((m) => m.id === e.messageId)) return view;
      const m: ChatMessage = {
        id: e.messageId,
        threadId,
        role: 'bot',
        botId: e.botId,
        parts: [],
        replyTo: null,
        reactions: {},
        createdAt: new Date().toISOString(),
      };
      return { ...view, messages: [...view.messages, m], streaming: [...view.streaming, e.messageId] };
    }
    case 'delta':
      return {
        ...view,
        messages: view.messages.map((m) => {
          if (m.id !== e.messageId) return m;
          const parts = m.parts.slice();
          const last = parts[parts.length - 1];
          if (last && last.type === 'text') parts[parts.length - 1] = { type: 'text', text: (last as { text: string }).text + e.text };
          else parts.push({ type: 'text', text: e.text });
          return { ...m, parts };
        }),
      };
    case 'part':
      return { ...view, messages: view.messages.map((m) => (m.id === e.messageId ? { ...m, parts: [...m.parts, e.part] } : m)) };
    case 'bot_done':
      return { ...view, messages: upsert(view.messages, e.message), streaming: view.streaming.filter((id) => id !== e.message.id) };
    case 'done':
      return { ...view, streaming: [] };
    case 'error':
      return { ...view, streaming: [], error: e.message };
  }
}
