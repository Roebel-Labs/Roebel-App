// SSE client for POST /api/chat/threads/:id/messages (spec §3.5). React Native's global fetch has no
// streaming body, so the request goes through `expo/fetch`; when a runtime still hands back no
// reader we fall back to reading the whole text and parsing it in one go.
import { fetch as expoFetch } from 'expo/fetch';
import type { ChatMessage, ChatPart, ChatThread } from './types';

export type ChatStreamEvent =
  | { type: 'user'; message: ChatMessage }
  | { type: 'bot_start'; botId: string; messageId: string }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'part'; messageId: string; part: ChatPart }
  | { type: 'bot_done'; message: ChatMessage }
  | { type: 'done'; thread: ChatThread }
  | { type: 'error'; code: string; message: string };

const KNOWN_EVENTS = new Set(['user', 'bot_start', 'delta', 'part', 'bot_done', 'done', 'error']);

function toEvent(name: string, data: string): ChatStreamEvent | null {
  if (!KNOWN_EVENTS.has(name)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const body = parsed as Record<string, unknown>;
  if (name === 'error') {
    return {
      type: 'error',
      code: typeof body.code === 'string' ? body.code : 'unknown',
      message: typeof body.message === 'string' ? body.message : 'Es ist ein Fehler aufgetreten.',
    };
  }
  return { ...(body as object), type: name } as ChatStreamEvent;
}

/**
 * Pure SSE frame parser. Feed it the accumulated buffer; it returns every complete event and the
 * unconsumed tail (an incomplete frame) to prepend to the next chunk. Handles \n and \r\n line
 * endings, multi-line `data:`, comment lines and unknown event names (skipped).
 */
export function parseSSEChunk(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, '\n');
  const events: ChatStreamEvent[] = [];
  let cursor = 0;
  for (;;) {
    const end = normalized.indexOf('\n\n', cursor);
    if (end === -1) break;
    const frame = normalized.slice(cursor, end);
    cursor = end + 2;
    let name = 'message';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') name = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length === 0) continue;
    const event = toEvent(name, data.join('\n'));
    if (event) events.push(event);
  }
  return { events, rest: normalized.slice(cursor) };
}

/** Minimal slice of a fetch Response this module needs (expo/fetch and global fetch both fit). */
export interface StreamableResponse {
  body?: { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  text: () => Promise<string>;
}

/**
 * Reads an SSE response to the end, calling `onEvent` per event. Resolves `true` when a terminal
 * `done` or `error` event was seen, `false` when the stream ended without one (connection drop).
 */
export async function consumeSSEResponse(
  res: StreamableResponse,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<boolean> {
  let terminal = false;
  const emit = (events: ChatStreamEvent[]) => {
    for (const e of events) {
      if (e.type === 'done' || e.type === 'error') terminal = true;
      onEvent(e);
    }
  };
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader || typeof TextDecoder === 'undefined') {
    const { events, rest } = parseSSEChunk(await res.text());
    emit(events);
    if (rest.trim()) emit(parseSSEChunk(`${rest}\n\n`).events);
    return terminal;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSSEChunk(buffer);
    buffer = rest;
    emit(events);
  }
  buffer += decoder.decode();
  if (buffer.trim()) emit(parseSSEChunk(`${buffer}\n\n`).events);
  return terminal;
}

/** Response surface the chat API needs from a streaming POST. */
export interface SSEResponse extends StreamableResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** Streaming POST via expo/fetch. No timeout on purpose: a bot turn can legitimately run minutes. */
export async function postSSE(
  url: string,
  init: { headers: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<SSEResponse> {
  const res = await expoFetch(url, {
    method: 'POST',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', ...init.headers },
    body: init.body,
    signal: init.signal,
  });
  return res as unknown as SSEResponse;
}
