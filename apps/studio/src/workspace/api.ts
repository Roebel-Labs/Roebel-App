// Chat API client (same endpoints as the Röbel app, spec 2026-09-25 §3.5 + pairing 2026-11-12 §3.1).
import { consumeSSE } from './sse';
import { apiBase } from './session';
import type { ChatBootstrap, ChatMessage, ChatStreamEvent, ChatThread } from './types';

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function errorOf(res: Response): Promise<ChatApiError> {
  const j = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return new ChatApiError(res.status, j?.error?.code ?? 'failed', j?.error?.message ?? `Fehler ${res.status}`);
}

async function call<T>(path: string, init: { method?: string; token?: string; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  } catch {
    throw new ChatApiError(0, 'network', 'Server nicht erreichbar. Internetverbindung prüfen.');
  }
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as T;
}

// ---- pairing ---------------------------------------------------------------------

export interface PairStart {
  code: string;
  codeDisplay: string;
  pollToken: string;
  expiresAt: string;
  approveUrl: string;
  qrSvg: string;
}

export const pairStart = (deviceName: string) => call<PairStart>('/api/chat/pair/start', { json: { deviceName } });

export type PairPoll = { state: 'pending' } | { state: 'approved'; token: string; expiresAt: string };
export const pairPoll = (pollToken: string) => call<PairPoll>('/api/chat/pair/poll', { json: { pollToken } });

// ---- chat ------------------------------------------------------------------------

export const fetchBootstrap = (token: string) => call<ChatBootstrap>('/api/chat/bootstrap', { token });

export const createThread = (token: string, botIds: string[]) =>
  call<{ thread: ChatThread; messages: ChatMessage[] }>('/api/chat/threads', { token, json: { botIds } });

export const fetchMessages = (token: string, threadId: string) =>
  call<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chat/threads/${encodeURIComponent(threadId)}/messages?limit=50`, { token });

export const markRead = (token: string, threadId: string) =>
  call<{ ok: boolean }>(`/api/chat/threads/${encodeURIComponent(threadId)}/read`, { token, json: {} });

export const fetchFile = (token: string, fileId: string) =>
  call<{ file: { id: string; name: string; ext: string; size: number; content: string } }>(`/api/chat/files/${encodeURIComponent(fileId)}`, { token });

async function stream(path: string, token: string, json: unknown, onEvent: (e: ChatStreamEvent) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(json),
    });
  } catch {
    throw new ChatApiError(0, 'network', 'Server nicht erreichbar. Internetverbindung prüfen.');
  }
  if (!res.ok) throw await errorOf(res);
  const terminal = await consumeSSE(res, onEvent);
  if (!terminal) onEvent({ type: 'error', code: 'dropped', message: 'Verbindung unterbrochen. Die Antwort erscheint nach dem Neuladen.' });
}

export const sendMessage = (token: string, threadId: string, body: { text: string; imageUrls?: string[]; optionAnswer?: { messageId: string; key: string } }, onEvent: (e: ChatStreamEvent) => void) =>
  stream(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`, token, body, onEvent);

export const approveAction = (token: string, actionId: string, onEvent: (e: ChatStreamEvent) => void) =>
  stream(`/api/chat/actions/${encodeURIComponent(actionId)}/approve`, token, {}, onEvent);

export const rejectAction = (token: string, actionId: string, onEvent: (e: ChatStreamEvent) => void) =>
  stream(`/api/chat/actions/${encodeURIComponent(actionId)}/reject`, token, {}, onEvent);

// ---- media -----------------------------------------------------------------------

async function upload<T>(path: string, token: string, field: string, blob: Blob, name: string): Promise<T> {
  const form = new FormData();
  form.append(field, blob, name);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch {
    throw new ChatApiError(0, 'network', 'Server nicht erreichbar. Internetverbindung prüfen.');
  }
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as T;
}

export const uploadImage = (token: string, blob: Blob, name: string) =>
  upload<{ url: string; width: number; height: number }>('/api/chat/uploads', token, 'file', blob, name);

export const transcribe = (token: string, blob: Blob) =>
  upload<{ text: string }>('/api/chat/transcribe', token, 'audio', blob, 'aufnahme.webm');

// ---- mini apps -------------------------------------------------------------------

export interface MyMiniApp {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  homeUrl: string;
  status: 'draft' | 'pending' | 'approved' | 'live' | 'rejected' | 'suspended';
  category: string;
  primaryColor: string | null;
  pendingUpdate: boolean;
  updatedAt: string;
}

export const fetchMyMiniApps = (token: string) => call<{ apps: MyMiniApp[] }>('/api/chat/mini-apps', { token });
