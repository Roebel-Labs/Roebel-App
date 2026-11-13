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

// ---- account, own keys, connectors, analytics ---------------------------------------

export interface Me {
  displayName: string | null;
  username: string | null;
  isCitizen: boolean;
  tier: 'free' | 'plus' | 'ultra' | string;
  quota: { used: number; limit: number; ownKey: boolean };
  providerKeys: ProviderKey[];
}

export const fetchMe = (token: string) => call<Me>('/api/chat/me', { token });

export type KeyProvider = 'anthropic' | 'openai';
export interface ProviderKey {
  provider: KeyProvider;
  last4: string;
  status: 'active' | 'error';
  lastError: string | null;
  createdAt: string;
}

export const listProviderKeys = (token: string) => call<{ keys: ProviderKey[] }>('/api/chat/provider-keys', { token });
export const saveProviderKey = (token: string, provider: KeyProvider, key: string) =>
  call<{ key: ProviderKey }>('/api/chat/provider-keys', { token, method: 'PUT', json: { provider, key } });
export const deleteProviderKey = (token: string, provider: KeyProvider) =>
  call<{ ok: boolean }>(`/api/chat/provider-keys?provider=${provider}`, { token, method: 'DELETE' });

export interface Connector {
  id: string;
  kind: 'mcp' | 'google';
  name: string;
  url: string | null;
  status: 'active' | 'error' | 'disabled';
  toolCount: number;
  lastError: string | null;
}

export const listConnectors = (token: string) => call<{ connectors: Connector[]; googleAvailable: boolean }>('/api/chat/connectors', { token });
export const addMcpConnector = (token: string, name: string, url: string) =>
  call<{ connector: Connector }>('/api/chat/connectors', { token, json: { kind: 'mcp', name, url } });
export const deleteConnector = (token: string, id: string) =>
  call<{ ok: boolean }>(`/api/chat/connectors?id=${encodeURIComponent(id)}`, { token, method: 'DELETE' });
/** Google consent URL; the browser lands on /studio/verbunden afterwards. */
export const googleStart = (token: string) =>
  call<{ url: string }>(`/api/chat/connectors/google/start?return=${encodeURIComponent(`${apiBase()}/studio/verbunden`)}`, { token });

export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | 'all';
export interface AnalyticsSummary {
  appId: string;
  range: AnalyticsRange;
  opens: number;
  uniqueWallets: number;
  events: number;
  sessions: number;
  returningWallets: number;
  retentionRate: number;
  rewardsGranted: number;
  rewardsAmount: number;
  budget: number | null;
  spent: number | null;
  series: { date: string; opens: number; uniqueWallets: number; rewards: number }[];
  topEvents: { event: string; count: number }[];
}

export const fetchMiniAppAnalytics = (token: string, appId: string, range: AnalyticsRange) =>
  call<AnalyticsSummary>(`/api/chat/mini-apps/${encodeURIComponent(appId)}/analytics?range=${range}`, { token });

// ---- personal context: wiki, suggestions, skills, routines, library (contract 2026-11-12) -------

export type RoutineSchedule = { kind: 'weekly' | 'daily'; weekday?: number; hour: number; minute: number; tz: 'Europe/Berlin' };
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

export type PersonaState = 'empty' | 'building' | 'ready' | 'error';
export interface PersonaStatus {
  state: PersonaState;
  stage: 'collect' | 'digest' | 'synthesize' | 'people' | 'suggest' | null;
  stageLabel: string | null;
  progress: number;
  error: string | null;
  builtAt: string | null;
  sources: { google: boolean; googleMail: boolean; googleCalendar: boolean; roebel: boolean; imports: number; memories: number };
}

export type PageKind = 'overview' | 'goals' | 'projects' | 'profile' | 'profile_section' | 'notes' | 'person';
export interface PageMeta {
  slug: string;
  kind: PageKind;
  title: string;
  summary: string;
  parent: string | null;
  updatedAt: string;
  editedByUser: boolean;
}
export interface PersonMeta {
  slug: string;
  name: string;
  email: string | null;
  description: string;
  priority: number;
}
export interface PageSource {
  n: number;
  label: string;
  date: string | null;
}
export interface Page extends PageMeta {
  body: string;
  facts: { label: string; value: string }[];
  sources: PageSource[];
}
export interface PersonaUpdate {
  at: string;
  text: string;
}
export interface Persona {
  status: PersonaStatus;
  pages: PageMeta[];
  people: PersonMeta[];
  updates: PersonaUpdate[];
}

const enc = encodeURIComponent;

export const fetchPersona = (token: string) => call<Persona>('/api/chat/persona', { token });
/** v2: pages that link here (`backlinks`) and pages this one links to (`related`); absent on an older backend. */
export interface PageLink {
  slug: string;
  title: string;
}
export const fetchPersonaPage = (token: string, slug: string) =>
  call<{ page: Page; backlinks?: PageLink[]; related?: PageLink[] }>(`/api/chat/persona/pages/${enc(slug)}`, { token });
export const savePersonaPage = (token: string, slug: string, body: { body: string; title?: string; summary?: string }) =>
  call<{ page: Page }>(`/api/chat/persona/pages/${enc(slug)}`, { token, method: 'PUT', json: body });
export const deletePersonaPage = (token: string, slug: string) =>
  call<{ ok: boolean }>(`/api/chat/persona/pages/${enc(slug)}`, { token, method: 'DELETE' });
export const createPerson = (token: string, body: { name: string; email?: string; description?: string }) =>
  call<{ page: Page }>('/api/chat/persona/people', { token, json: body });
export const buildPersona = (token: string, mode: 'full' | 'refresh' = 'full') =>
  call<{ status: PersonaStatus }>('/api/chat/persona/build', { token, json: { mode } });
export const deletePersona = (token: string) => call<{ ok: boolean }>('/api/chat/persona', { token, method: 'DELETE' });

export type ImportKind = 'claude' | 'chatgpt' | 'text';
export interface PersonaImport {
  id: string;
  kind: ImportKind;
  title: string;
  chars: number;
  createdAt: string;
}
export const fetchPersonaImports = (token: string) =>
  call<{ imports: PersonaImport[]; exportPrompt: string }>('/api/chat/persona/imports', { token });
export const addPersonaImport = (token: string, body: { kind: ImportKind; title?: string; text: string }) =>
  call<{ import: PersonaImport }>('/api/chat/persona/imports', { token, json: body });
export const deletePersonaImport = (token: string, id: string) =>
  call<{ ok: boolean }>(`/api/chat/persona/imports?id=${enc(id)}`, { token, method: 'DELETE' });

export interface Suggestion {
  id: string;
  kind: 'task' | 'routine';
  title: string;
  reason: string;
  prompt: string;
  schedule: RoutineSchedule | null;
  people: { name: string; slug: string }[];
  /** v2: done in minutes ("Schnell erledigt"). */
  quick?: boolean;
  /** v2: not in the previous set ("Neu"). */
  fresh?: boolean;
}
export interface SuggestionGroup {
  title: string;
  items: Suggestion[];
}
export type SuggestionSectionKey = 'projects' | 'collab' | 'improve' | 'peers';
export interface SuggestionSection {
  key: SuggestionSectionKey | string;
  title: string;
  groups: SuggestionGroup[];
}
/** `sections` is v2 and absent on an older backend; `groups` stays as the fallback. */
export const fetchSuggestions = (token: string) =>
  call<{ sections?: SuggestionSection[]; groups?: SuggestionGroup[]; status: PersonaStatus }>('/api/chat/persona/suggestions', { token });
export const dismissSuggestion = (token: string, id: string) =>
  call<{ ok: boolean }>(`/api/chat/persona/suggestions/${enc(id)}`, { token, json: { action: 'dismiss' } });
export const startSuggestion = (token: string, id: string) =>
  call<{ threadId: string; prompt: string; routine: ChatRoutine | null }>(`/api/chat/persona/suggestions/${enc(id)}`, { token, json: { action: 'start' } });

/** Start page briefing (v3). The endpoint may not exist yet (404): callers fall back to the suggestions. */
export interface Briefing {
  name: string | null;
  date: string | null;
  items: { label: string; text: string }[];
  suggestions: Suggestion[];
}
export const fetchBriefing = (token: string) => call<Partial<Briefing>>('/api/chat/persona/briefing', { token });

// Link with Claude (two-way sync over MCP). The endpoint may not exist yet (404).
export interface LinkToken {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export interface LinkCreated {
  token: LinkToken;
  /** Shown once. */
  secret: string;
  mcpUrl: string;
  connectorUrl: string;
  claudeCodeCommand: string;
  syncPrompt: string;
}
export const fetchPersonaLinks = (token: string) =>
  call<{ tokens: LinkToken[]; mcpUrl: string; syncPrompt: string }>('/api/chat/persona/link', { token });
export const createPersonaLink = (token: string, label?: string) =>
  call<LinkCreated>('/api/chat/persona/link', { token, json: label ? { label } : {} });
export const deletePersonaLink = (token: string, id: string) =>
  call<{ ok: boolean }>(`/api/chat/persona/link?id=${enc(id)}`, { token, method: 'DELETE' });

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  updatedAt: string;
}
export type SkillInput = { name: string; description: string; body: string };
export const fetchSkills = (token: string) => call<{ skills: Skill[] }>('/api/chat/skills', { token });
export const createSkill = (token: string, body: SkillInput) => call<{ skill: Skill }>('/api/chat/skills', { token, json: body });
export const updateSkill = (token: string, id: string, patch: Partial<SkillInput & { enabled: boolean }>) =>
  call<{ skill: Skill }>(`/api/chat/skills/${enc(id)}`, { token, method: 'PATCH', json: patch });
export const deleteSkill = (token: string, id: string) => call<{ ok: boolean }>(`/api/chat/skills/${enc(id)}`, { token, method: 'DELETE' });

export const fetchRoutines = (token: string) => call<{ routines: ChatRoutine[] }>('/api/chat/routines', { token });
export const updateRoutine = (token: string, id: string, patch: Partial<Pick<ChatRoutine, 'enabled' | 'title' | 'prompt' | 'schedule'>>) =>
  call<{ routine: ChatRoutine }>(`/api/chat/routines/${enc(id)}`, { token, method: 'PATCH', json: patch });
export const deleteRoutine = (token: string, id: string) => call<{ ok: boolean }>(`/api/chat/routines?id=${enc(id)}`, { token, method: 'DELETE' });

export type RoutineIcon = 'inbox' | 'mail' | 'calendar' | 'search' | 'list' | 'sun' | 'news' | 'radar' | 'people' | 'chart' | 'handshake' | 'bell';
export interface RoutineTemplate {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  icon: RoutineIcon | string;
  color: string;
  schedule: RoutineSchedule;
  requires: 'google'[];
  installed: boolean;
}
export const fetchRoutineCatalog = (token: string) =>
  call<{ categories: { id: string; label: string }[]; templates: RoutineTemplate[] }>('/api/chat/routines/catalog', { token });
export const installRoutineTemplate = (token: string, id: string) =>
  call<{ routine: ChatRoutine; threadId: string }>(`/api/chat/routines/catalog/${enc(id)}/install`, { token, json: {} });
export const createQuickRoutine = (token: string, body: { title: string; prompt: string; schedule: RoutineSchedule }) =>
  call<{ routine: ChatRoutine; threadId: string }>('/api/chat/routines/quick', { token, json: body });

export interface LibraryFile {
  id: string;
  name: string;
  ext: string;
  size: number;
  kind: 'document' | 'image';
  url: string | null;
  threadId: string;
  threadTitle: string;
  routineTitle: string | null;
  createdAt: string;
}
export interface LibraryCollection {
  id: string;
  label: string;
  count: number;
  kind: 'recent' | 'thread' | 'routine';
}
export const fetchLibrary = (token: string) => call<{ files: LibraryFile[]; collections: LibraryCollection[] }>('/api/chat/library', { token });
