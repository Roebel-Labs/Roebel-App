// SSE parsing for the chat send/approve streams. Same algorithm as apps/expo/lib/chat/stream.ts
// (kept in sync by hand: the studio is not a workspace consumer of the app).
import type { ChatStreamEvent } from './types';

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

/** Returns every complete event in the buffer and the unconsumed tail. */
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

/** Reads a streaming Response to the end. Resolves true when a terminal done/error event arrived. */
export async function consumeSSE(res: Response, onEvent: (e: ChatStreamEvent) => void): Promise<boolean> {
  let terminal = false;
  const emit = (events: ChatStreamEvent[]) => {
    for (const e of events) {
      if (e.type === 'done' || e.type === 'error') terminal = true;
      onEvent(e);
    }
  };
  const reader = res.body?.getReader();
  if (!reader) {
    emit(parseSSEChunk(`${await res.text()}\n\n`).events);
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
