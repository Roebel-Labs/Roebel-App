// Pure per-thread state machine (spec §4.4): initial page, older pages, optimistic user message,
// streamed bot messages (delta/part assembly), terminal error with a retry payload, reactions and
// option-card state. No React, no I/O — the ChatContext dispatches, tests drive it directly.
import type { SendMessageBody } from './api';
import type { ChatStreamEvent } from './stream';
import type { ApprovalStatus, ChatMessage, ChatPart } from './types';

export interface ThreadError {
  code: string;
  message: string;
  /** Body to resend on "Erneut versuchen"; null when the failure was not a send. */
  retry: SendMessageBody | null;
}

export interface ThreadState {
  messages: ChatMessage[];
  hasMore: boolean;
  /** First page arrived at least once. */
  loaded: boolean;
  /** Counts finished first-page fetches (ok or failed); screens wait for a fetch newer than their mount. */
  loadSeq: number;
  loadingOlder: boolean;
  /** Non-null while a send is in flight; botId/messageId name the bot currently writing. */
  streaming: { botId: string | null; messageId: string | null } | null;
  /** Temp id of the optimistic user message until the server's `user` event replaces it. */
  pendingTempId: string | null;
  /** Body of the in-flight send (becomes the retry payload on error). */
  lastSend: SendMessageBody | null;
  error: ThreadError | null;
}

export const initialThreadState: ThreadState = {
  messages: [],
  hasMore: false,
  loaded: false,
  loadSeq: 0,
  loadingOlder: false,
  streaming: null,
  pendingTempId: null,
  lastSend: null,
  error: null,
};

export type ThreadAction =
  | { type: 'loaded'; messages: ChatMessage[]; hasMore: boolean }
  | { type: 'load_failed'; code: string; message: string }
  | { type: 'stream_cancelled' }
  | { type: 'load_older_start' }
  | { type: 'load_older_failed' }
  | { type: 'older_loaded'; messages: ChatMessage[]; hasMore: boolean }
  | {
      type: 'send_optimistic';
      tempId: string;
      threadId: string;
      body: SendMessageBody;
      /** Local image URIs shown in the optimistic bubble until the server echo arrives. */
      localImageUris?: string[];
      createdAt: string;
    }
  | { type: 'send_failed'; code: string; message: string; body: SendMessageBody }
  | { type: 'stream_event'; event: ChatStreamEvent }
  | { type: 'discard_failed' }
  | { type: 'clear_error' }
  | { type: 'react_optimistic'; messageId: string; emoji: string }
  | { type: 'reactions'; messageId: string; reactions: Record<string, number> }
  | { type: 'dismiss_options'; messageId: string }
  | { type: 'option_answered'; messageId: string; key: string }
  | { type: 'message_replaced'; message: ChatMessage }
  /** An approve/reject/complete stream opens: bot turn without an optimistic user message. */
  | { type: 'continuation_start' }
  /** Optimistic (or server-confirmed) status of the approval part with this actionId. */
  | { type: 'approval_status'; actionId: string; status: ApprovalStatus; resultNote?: string }
  /** Polled snapshot of a background task (GET /api/chat/tasks/:id): patches its task part in place. */
  | { type: 'task_update'; task: TaskSnapshot };

/** GET /api/chat/tasks/:id → task (agent harness wave 2). */
export interface TaskSnapshot {
  id: string;
  title: string;
  status: TaskPartStatus;
  steps: Extract<ChatPart, { type: 'task' }>['steps'];
  error: string | null;
  updatedAt: string;
}

export type TaskPartStatus = Extract<ChatPart, { type: 'task' }>['status'];

export const LIVE_TASK_STATUSES: readonly TaskPartStatus[] = ['queued', 'running', 'waiting_approval'];

export function isLiveTaskStatus(status: TaskPartStatus): boolean {
  return LIVE_TASK_STATUSES.includes(status);
}

/** Task ids whose card is still live (queued / running / waiting for approval), in thread order. */
export function liveTaskIds(state: Pick<ThreadState, 'messages'>): string[] {
  const ids: string[] = [];
  for (const m of state.messages) {
    for (const p of m.parts) {
      if (p.type === 'task' && isLiveTaskStatus(p.status) && !ids.includes(p.taskId)) ids.push(p.taskId);
    }
  }
  return ids;
}

/** Applies a task snapshot to every task part with that taskId; unchanged state when nothing differs. */
export function withTaskSnapshot(state: ThreadState, task: TaskSnapshot): ThreadState {
  let hit = false;
  const messages = state.messages.map((m) => {
    if (!m.parts.some((p) => p.type === 'task' && p.taskId === task.id)) return m;
    let changed = false;
    const parts = m.parts.map((p) => {
      if (p.type !== 'task' || p.taskId !== task.id) return p;
      if (p.status === task.status && p.title === task.title && JSON.stringify(p.steps) === JSON.stringify(task.steps)) {
        return p;
      }
      changed = true;
      return { ...p, title: task.title || p.title, status: task.status, steps: task.steps };
    });
    if (!changed) return m;
    hit = true;
    return { ...m, parts };
  });
  return hit ? { ...state, messages } : state;
}

export const TEMP_ID_PREFIX = 'temp-';

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

/** One-line preview of a message for reply quotes. */
export function messagePreview(message: ChatMessage, max = 80): string {
  for (const part of message.parts) {
    let text = '';
    if (part.type === 'text') text = part.text;
    else if (part.type === 'options') text = part.question;
    else if (part.type === 'file') text = part.name;
    else if (part.type === 'image') text = 'Bild';
    else if (part.type === 'integration') text = part.title;
    else if (part.type === 'calendar_event') text = part.title;
    else if (part.type === 'approval') text = part.title;
    else if (part.type === 'task') text = part.title;
    else if (part.type === 'generated_image') text = 'Bild';
    if (text.trim()) {
      const flat = text.replace(/\s+/g, ' ').trim();
      return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
    }
  }
  return '';
}

function byCreatedAt(a: ChatMessage, b: ChatMessage): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function mapMessage(state: ThreadState, id: string, fn: (m: ChatMessage) => ChatMessage): ThreadState {
  let hit = false;
  const messages = state.messages.map((m) => {
    if (m.id !== id) return m;
    hit = true;
    return fn(m);
  });
  return hit ? { ...state, messages } : state;
}

function upsert(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === message.id);
  if (idx === -1) return [...messages, message];
  const next = messages.slice();
  next[idx] = message;
  return next;
}

function mapOptions(message: ChatMessage, fn: (p: Extract<ChatPart, { type: 'options' }>) => ChatPart): ChatMessage {
  return { ...message, parts: message.parts.map((p) => (p.type === 'options' ? fn(p) : p)) };
}

/** Key that identifies a part which is updated in place (approval by actionId, task by taskId, image by imageId). */
export function liveKey(part: ChatPart): string | null {
  if (part.type === 'approval') return `approval:${part.actionId}`;
  if (part.type === 'task') return `task:${part.taskId}`;
  if (part.type === 'generated_image') return `generated_image:${part.imageId}`;
  return null;
}

/** Replaces an existing approval/task/generated-image part with the same id anywhere in the thread; null when none. */
function replaceLivePart(state: ThreadState, part: ChatPart): ThreadState | null {
  const key = liveKey(part);
  if (!key) return null;
  let hit = false;
  const messages = state.messages.map((m) => {
    if (!m.parts.some((p) => liveKey(p) === key)) return m;
    hit = true;
    return { ...m, parts: m.parts.map((p) => (liveKey(p) === key ? part : p)) };
  });
  return hit ? { ...state, messages } : null;
}

/** Sets the status of the approval part with `actionId` (all messages). */
export function withApprovalStatus(
  state: ThreadState,
  actionId: string,
  status: ApprovalStatus,
  resultNote?: string,
): ThreadState {
  let hit = false;
  const messages = state.messages.map((m) => {
    if (!m.parts.some((p) => p.type === 'approval' && p.actionId === actionId)) return m;
    hit = true;
    return {
      ...m,
      parts: m.parts.map((p) =>
        p.type === 'approval' && p.actionId === actionId
          ? { ...p, status, ...(resultNote !== undefined ? { resultNote } : {}) }
          : p,
      ),
    };
  });
  return hit ? { ...state, messages } : state;
}

/** The approval part with `actionId`, if loaded. */
export function findApproval(
  state: ThreadState,
  actionId: string,
): { message: ChatMessage; part: Extract<ChatPart, { type: 'approval' }> } | null {
  for (const message of state.messages) {
    for (const p of message.parts) if (p.type === 'approval' && p.actionId === actionId) return { message, part: p };
  }
  return null;
}

function applyStreamEvent(state: ThreadState, event: ChatStreamEvent): ThreadState {
  switch (event.type) {
    case 'user': {
      const withoutTemp = state.pendingTempId
        ? state.messages.filter((m) => m.id !== state.pendingTempId)
        : state.messages;
      // Keep the confirmed message where the optimistic one sat (end of list at send time).
      const tempIdx = state.pendingTempId ? state.messages.findIndex((m) => m.id === state.pendingTempId) : -1;
      let messages: ChatMessage[];
      if (withoutTemp.some((m) => m.id === event.message.id)) messages = upsert(withoutTemp, event.message);
      else if (tempIdx >= 0) {
        messages = withoutTemp.slice();
        messages.splice(tempIdx, 0, event.message);
      } else messages = [...withoutTemp, event.message];
      return { ...state, messages, pendingTempId: null };
    }
    case 'bot_start': {
      const exists = state.messages.some((m) => m.id === event.messageId);
      const threadId = state.messages[state.messages.length - 1]?.threadId ?? '';
      const messages = exists
        ? state.messages
        : [
            ...state.messages,
            {
              id: event.messageId,
              threadId,
              role: 'bot' as const,
              botId: event.botId,
              parts: [],
              replyTo: null,
              reactions: {},
              createdAt: new Date().toISOString(),
            },
          ];
      return { ...state, messages, streaming: { botId: event.botId, messageId: event.messageId } };
    }
    case 'delta':
      return mapMessage(state, event.messageId, (m) => {
        const parts = m.parts.slice();
        const last = parts[parts.length - 1];
        if (last && last.type === 'text') parts[parts.length - 1] = { type: 'text', text: last.text + event.text };
        else parts.push({ type: 'text', text: event.text });
        return { ...m, parts };
      });
    case 'part':
      // An approval/task/generated-image part that already exists (e.g. the approval being executed,
      // an image going generating → done) updates in place.
      return (
        replaceLivePart(state, event.part) ??
        mapMessage(state, event.messageId, (m) => ({ ...m, parts: [...m.parts, event.part] }))
      );
    case 'bot_done': {
      const messages = upsert(state.messages, event.message);
      const stillWriting = state.streaming?.messageId === event.message.id;
      return {
        ...state,
        messages,
        streaming: state.streaming && stillWriting ? { botId: null, messageId: null } : state.streaming,
      };
    }
    case 'done':
      return { ...state, streaming: null, pendingTempId: null, lastSend: null, error: null };
    case 'error': {
      // Drop an empty half-started bot bubble; keep partially streamed text visible.
      const openId = state.streaming?.messageId;
      const messages = openId
        ? state.messages.filter((m) => !(m.id === openId && m.parts.length === 0))
        : state.messages;
      return {
        ...state,
        messages,
        streaming: null,
        error: { code: event.code, message: event.message, retry: state.lastSend },
      };
    }
  }
}

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case 'loaded': {
      // Keep an optimistic / streaming tail that the fetched page does not know yet.
      const ids = new Set(action.messages.map((m) => m.id));
      const keepTail = state.streaming !== null || state.pendingTempId !== null;
      const tail = keepTail
        ? state.messages.filter((m) => !ids.has(m.id) && (isTempId(m.id) || m.id === state.streaming?.messageId))
        : [];
      const error = state.error && state.error.retry === null ? null : state.error;
      return {
        ...state,
        messages: [...action.messages, ...tail],
        hasMore: action.hasMore,
        loaded: true,
        loadSeq: state.loadSeq + 1,
        error,
      };
    }
    case 'load_failed':
      return state.loaded
        ? { ...state, loadSeq: state.loadSeq + 1 }
        : {
            ...state,
            loaded: true,
            loadSeq: state.loadSeq + 1,
            error: { code: action.code, message: action.message, retry: null },
          };
    case 'stream_cancelled':
      return { ...state, streaming: null, lastSend: null };
    case 'load_older_start':
      return { ...state, loadingOlder: true };
    case 'load_older_failed':
      return { ...state, loadingOlder: false };
    case 'older_loaded': {
      const ids = new Set(state.messages.map((m) => m.id));
      const older = action.messages.filter((m) => !ids.has(m.id)).sort(byCreatedAt);
      return { ...state, messages: [...older, ...state.messages], hasMore: action.hasMore, loadingOlder: false };
    }
    case 'send_optimistic': {
      const { body } = action;
      const parts: ChatPart[] = [];
      for (const url of action.localImageUris ?? body.imageUrls ?? []) parts.push({ type: 'image', url });
      if (body.text) parts.push({ type: 'text', text: body.text });
      const replied = body.replyToId ? state.messages.find((m) => m.id === body.replyToId) : undefined;
      const optimistic: ChatMessage = {
        id: action.tempId,
        threadId: action.threadId,
        role: 'user',
        botId: null,
        parts,
        replyTo: replied ? { id: replied.id, preview: messagePreview(replied) } : null,
        reactions: {},
        createdAt: action.createdAt,
      };
      // A previous failed optimistic message is replaced by the retry.
      const base = state.error && state.pendingTempId
        ? state.messages.filter((m) => m.id !== state.pendingTempId)
        : state.messages;
      return {
        ...state,
        messages: [...base, optimistic],
        pendingTempId: action.tempId,
        streaming: { botId: null, messageId: null },
        lastSend: body,
        error: null,
      };
    }
    case 'send_failed':
      // Failure before the stream opened (e.g. image upload); the optimistic bubble stays for retry.
      return { ...state, streaming: null, error: { code: action.code, message: action.message, retry: action.body } };
    case 'stream_event':
      return applyStreamEvent(state, action.event);
    case 'discard_failed':
      return {
        ...state,
        messages: state.pendingTempId ? state.messages.filter((m) => m.id !== state.pendingTempId) : state.messages,
        pendingTempId: null,
        lastSend: null,
        error: null,
      };
    case 'clear_error':
      return { ...state, error: null };
    case 'react_optimistic':
      return mapMessage(state, action.messageId, (m) => ({
        ...m,
        reactions: { ...m.reactions, [action.emoji]: (m.reactions[action.emoji] ?? 0) + 1 },
      }));
    case 'reactions':
      return mapMessage(state, action.messageId, (m) => ({ ...m, reactions: action.reactions }));
    case 'dismiss_options':
      return mapMessage(state, action.messageId, (m) => mapOptions(m, (p) => ({ ...p, dismissed: true })));
    case 'option_answered':
      return mapMessage(state, action.messageId, (m) => mapOptions(m, (p) => ({ ...p, selected: action.key })));
    case 'message_replaced':
      return mapMessage(state, action.message.id, () => action.message);
    case 'continuation_start':
      return { ...state, streaming: { botId: null, messageId: null }, lastSend: null, error: null };
    case 'approval_status':
      return withApprovalStatus(state, action.actionId, action.status, action.resultNote);
    case 'task_update':
      return withTaskSnapshot(state, action.task);
  }
}
