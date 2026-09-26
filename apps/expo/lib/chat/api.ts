// Typed wrappers for the /api/chat/* endpoints (spec §3.5). Every call carries the chat session
// Bearer token; a 401 clears it, re-signs once and retries. JSON calls time out after 20 s because
// React Native's fetch never does on its own; the SSE send has no timeout (caller aborts).
import { getApiBaseUrl, type SigningAccount } from '@/lib/signed-request';
import { clearChatSession, ensureChatSession, ChatSessionError } from './session';
import { consumeSSEResponse, postSSE, type ChatStreamEvent } from './stream';
import type { BotAvatarSpec, CalendarContextEvent, ChatBot, ChatMessage, ChatThread } from './types';

const JSON_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 90_000;

export type ChatTier = 'free' | 'plus' | 'ultra';

export interface ChatBootstrap {
  presets: ChatBot[];
  bots: ChatBot[];
  threads: ChatThread[];
  tier: ChatTier;
  quota: { used: number; limit: number };
}

export interface CreateBotInput {
  name: string;
  description?: string;
  instructions?: string;
  avatar: BotAvatarSpec;
}
export type UpdateBotInput = Partial<CreateBotInput>;

export interface SendMessageBody {
  text: string;
  imageUrls?: string[];
  replyToId?: string;
  mentionBotIds?: string[];
  optionAnswer?: { messageId: string; key: string };
  /** Upcoming device-calendar events for calendar bots; omitted without read access. */
  calendarContext?: CalendarContextEvent[];
}

export interface ChatFile {
  id: string;
  name: string;
  ext: string;
  size: number;
  content: string;
}

export interface UploadedImage {
  url: string;
  width: number;
  height: number;
}

export interface RoutineSchedule {
  kind: 'weekly' | 'daily';
  weekday?: number;
  hour: number;
  minute: number;
  tz: string;
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

export class ChatApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'ChatApiError';
    this.code = code;
    this.status = status;
  }
}

function toApiError(err: unknown): ChatApiError {
  if (err instanceof ChatApiError) return err;
  if (err instanceof ChatSessionError) return new ChatApiError(err.code, err.message, 401);
  if (err instanceof Error && err.name === 'AbortError') {
    return new ChatApiError('timeout', 'Der Server antwortet gerade nicht. Bitte versuche es erneut.');
  }
  return new ChatApiError('network', 'Keine Verbindung. Bitte prüfe dein Internet.');
}

async function errorFromResponse(res: { status: number; json: () => Promise<unknown> }): Promise<ChatApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return new ChatApiError(
    body?.error?.code ?? `http_${res.status}`,
    body?.error?.message ?? 'Es ist ein Fehler aufgetreten.',
    res.status,
  );
}

/** Runs `attempt(token)`; on 401 drops the stored session, re-signs once and retries. */
async function withAuth<R extends { status: number }>(
  account: SigningAccount,
  attempt: (token: string) => Promise<R>,
): Promise<R> {
  const token = await ensureChatSession(account);
  const first = await attempt(token);
  if (first.status !== 401) return first;
  await clearChatSession(account.address);
  const fresh = await ensureChatSession(account, { force: true });
  return attempt(fresh);
}

async function request<T>(
  account: SigningAccount,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts?: { json?: unknown; form?: () => FormData; timeoutMs?: number },
): Promise<T> {
  try {
    const res = await withAuth(account, async (token) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? JSON_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
        let body: string | FormData | undefined;
        if (opts?.form) body = opts.form();
        else if (opts?.json !== undefined) {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(opts.json);
        }
        const r = await fetch(`${getApiBaseUrl()}${path}`, { method, headers, body, signal: controller.signal });
        // Read the body inside the timeout window: a stalled body is a hang too.
        const text = await r.text();
        return { status: r.status, ok: r.ok, text };
      } finally {
        clearTimeout(timer);
      }
    });
    let parsed: unknown = null;
    try {
      parsed = res.text ? JSON.parse(res.text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) throw await errorFromResponse({ status: res.status, json: async () => parsed });
    return parsed as T;
  } catch (err) {
    throw toApiError(err);
  }
}

const enc = encodeURIComponent;

export function fetchBootstrap(account: SigningAccount): Promise<ChatBootstrap> {
  return request<ChatBootstrap>(account, 'GET', '/api/chat/bootstrap');
}

export async function createBot(account: SigningAccount, input: CreateBotInput): Promise<ChatBot> {
  return (await request<{ bot: ChatBot }>(account, 'POST', '/api/chat/bots', { json: input })).bot;
}

export async function updateBot(account: SigningAccount, id: string, patch: UpdateBotInput): Promise<ChatBot> {
  return (await request<{ bot: ChatBot }>(account, 'PATCH', `/api/chat/bots/${enc(id)}`, { json: patch })).bot;
}

export function createThread(
  account: SigningAccount,
  botIds: string[],
): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
  return request(account, 'POST', '/api/chat/threads', { json: { botIds } });
}

export function fetchMessages(
  account: SigningAccount,
  threadId: string,
  opts?: { before?: string; limit?: number },
): Promise<{ messages: ChatMessage[]; hasMore: boolean; thread?: ChatThread }> {
  const q: string[] = [`limit=${opts?.limit ?? 50}`];
  if (opts?.before) q.push(`before=${enc(opts.before)}`);
  return request(account, 'GET', `/api/chat/threads/${enc(threadId)}/messages?${q.join('&')}`);
}

export function markThreadRead(account: SigningAccount, threadId: string): Promise<{ ok: boolean; lastReadAt?: string }> {
  return request(account, 'POST', `/api/chat/threads/${enc(threadId)}/read`);
}

export async function reactToMessage(
  account: SigningAccount,
  messageId: string,
  emoji: string,
): Promise<Record<string, number>> {
  const res = await request<{ reactions: Record<string, number> }>(
    account,
    'POST',
    `/api/chat/messages/${enc(messageId)}/reactions`,
    { json: { emoji } },
  );
  return res.reactions;
}

export async function dismissOptions(account: SigningAccount, messageId: string): Promise<ChatMessage> {
  const res = await request<{ message: ChatMessage }>(
    account,
    'POST',
    `/api/chat/messages/${enc(messageId)}/dismiss-options`,
  );
  return res.message;
}

/** Sets the status of one part (calendar_event: proposed|added|dismissed · integration: pending|connected). */
export async function setMessagePartStatus(
  account: SigningAccount,
  messageId: string,
  index: number,
  status: string,
): Promise<ChatMessage> {
  const res = await request<{ message: ChatMessage }>(
    account,
    'PATCH',
    `/api/chat/messages/${enc(messageId)}/parts/${index}`,
    { json: { status } },
  );
  return res.message;
}

export async function fetchFile(account: SigningAccount, fileId: string): Promise<ChatFile> {
  return (await request<{ file: ChatFile }>(account, 'GET', `/api/chat/files/${enc(fileId)}`)).file;
}

function fileNameFromUri(uri: string, fallback: string): string {
  const last = uri.split('?')[0].split('/').pop();
  return last && last.includes('.') ? last : fallback;
}

function imageMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/** Multipart upload of a local image (≤ 10 MB server-side). Returns the stored, signed URL. */
export function uploadImage(account: SigningAccount, uri: string, mimeType?: string): Promise<UploadedImage> {
  const name = fileNameFromUri(uri, 'bild.jpg');
  const type = mimeType ?? imageMimeFromName(name);
  return request<UploadedImage>(account, 'POST', '/api/chat/uploads', {
    timeoutMs: UPLOAD_TIMEOUT_MS,
    form: () => {
      const form = new FormData();
      form.append('file', { uri, name, type } as unknown as Blob);
      return form;
    },
  });
}

/** Multipart upload of a local m4a recording; returns the transcript. */
export async function transcribeAudio(account: SigningAccount, uri: string): Promise<string> {
  const name = fileNameFromUri(uri, 'aufnahme.m4a');
  const res = await request<{ text: string }>(account, 'POST', '/api/chat/transcribe', {
    timeoutMs: UPLOAD_TIMEOUT_MS,
    form: () => {
      const form = new FormData();
      form.append('audio', { uri, name, type: 'audio/m4a' } as unknown as Blob);
      return form;
    },
  });
  return res.text ?? '';
}

export async function fetchRoutines(account: SigningAccount, threadId?: string): Promise<ChatRoutine[]> {
  const q = threadId ? `?threadId=${enc(threadId)}` : '';
  const res = await request<{ routines?: ChatRoutine[] }>(account, 'GET', `/api/chat/routines${q}`);
  return res.routines ?? [];
}

export type UpdateRoutineInput = Partial<Pick<ChatRoutine, 'enabled' | 'title' | 'prompt' | 'schedule'>>;

export async function updateRoutine(account: SigningAccount, id: string, patch: UpdateRoutineInput): Promise<ChatRoutine> {
  return (await request<{ routine: ChatRoutine }>(account, 'PATCH', `/api/chat/routines/${enc(id)}`, { json: patch })).routine;
}

export async function createRoutine(
  account: SigningAccount,
  input: Pick<ChatRoutine, 'threadId' | 'botId' | 'title' | 'schedule' | 'prompt'>,
): Promise<ChatRoutine> {
  return (await request<{ routine: ChatRoutine }>(account, 'POST', '/api/chat/routines', { json: input })).routine;
}

export function deleteRoutine(account: SigningAccount, id: string): Promise<{ ok: boolean }> {
  return request(account, 'DELETE', `/api/chat/routines/${enc(id)}`);
}

/**
 * Sends a message and streams the reply. Resolves when the stream ends. A stream that closes without
 * `done`/`error` is reported as a synthetic `error {code:'stream_closed'}` so the UI never hangs.
 * Aborting via `signal` resolves silently.
 */
export async function sendThreadMessage(
  account: SigningAccount,
  threadId: string,
  body: SendMessageBody,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${getApiBaseUrl()}/api/chat/threads/${enc(threadId)}/messages`;
  const payload = JSON.stringify(body);
  try {
    const res = await withAuth(account, (token) =>
      postSSE(url, { headers: { Authorization: `Bearer ${token}` }, body: payload, signal }),
    );
    if (!res.ok) {
      const err = await errorFromResponse(res);
      onEvent({ type: 'error', code: err.code, message: err.message });
      return;
    }
    const terminal = await consumeSSEResponse(res, onEvent);
    if (!terminal && !signal?.aborted) {
      onEvent({ type: 'error', code: 'stream_closed', message: 'Die Verbindung wurde unterbrochen.' });
    }
  } catch (err) {
    if (signal?.aborted) return;
    const apiErr = toApiError(err);
    onEvent({ type: 'error', code: apiErr.code, message: apiErr.message });
  }
}
