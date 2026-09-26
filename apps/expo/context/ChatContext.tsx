// Mecky Chat state (spec §4.4). Mounted only around app/chat/* by app/chat/_layout.tsx. Holds the
// bootstrap snapshot (presets, bots, threads, tier, quota) and one ThreadState per opened thread.
// No Supabase Realtime (the app has no Supabase auth session): data refetches on focus.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import {
  ChatApiError,
  approveAction as apiApproveAction,
  rejectAction as apiRejectAction,
  completeAction as apiCompleteAction,
  fetchMemories as apiFetchMemories,
  deleteMemory as apiDeleteMemory,
  fetchBotGrants as apiFetchBotGrants,
  putBotGrants as apiPutBotGrants,
  fetchAgentActions as apiFetchAgentActions,
  fetchConnectors as apiFetchConnectors,
  addMcpConnector as apiAddMcpConnector,
  deleteConnector as apiDeleteConnector,
  refreshConnector as apiRefreshConnector,
  startGoogleConnect as apiStartGoogleConnect,
  type AddMcpConnectorInput,
  type ChatConnector,
  type ChatConnectorList,
  type AgentActionRecord,
  type BotGrants,
  type ChatMemory,
  createBot as apiCreateBot,
  createThread as apiCreateThread,
  deleteRoutine as apiDeleteRoutine,
  fetchRoutines as apiFetchRoutines,
  updateRoutine as apiUpdateRoutine,
  dismissOptions as apiDismissOptions,
  setMessagePartStatus as apiSetMessagePartStatus,
  fetchBootstrap,
  fetchFile as apiFetchFile,
  fetchMessages,
  markThreadRead,
  reactToMessage,
  sendThreadMessage,
  transcribeAudio,
  updateBot as apiUpdateBot,
  uploadImage as apiUploadImage,
  type ChatBootstrap,
  type ChatFile,
  type ChatRoutine,
  type UpdateRoutineInput,
  type ChatTier,
  type CreateBotInput,
  type SendMessageBody,
  type UpdateBotInput,
  type UploadedImage,
} from '@/lib/chat/api';
import { dismissInspiration, fetchInspiration } from '@/lib/chat/api';
import { cancelTask as apiCancelTask, fetchTask as apiFetchTask } from '@/lib/chat/api';
import { withoutTask, type InspirationFeed } from '@/lib/chat/inspiration';
import { ensureChatSession, hasStoredChatSession } from '@/lib/chat/session';
import {
  findApproval,
  initialThreadState,
  isLiveTaskStatus,
  liveTaskIds,
  type TaskPartStatus,
  threadReducer,
  TEMP_ID_PREFIX,
  type ThreadAction,
  type ThreadError,
  type ThreadState,
} from '@/lib/chat/reducer';
import { markThreadReadIn, mergeThreadIn } from '@/lib/chat/unread';
import type { CalendarEventStatus, ChatBot, ChatMessage, ChatThread } from '@/lib/chat/types';
import { isCalendarThread, withPartStatus } from '@/lib/chat/calendar';
import {
  addEventWithSystemSheet,
  readCalendarContext,
  requestCalendarReadAccess,
  type CalendarReadAccess,
} from '@/lib/chat/device-calendar';
import type { SigningAccount } from '@/lib/signed-request';
import type { ChatStreamEvent } from '@/lib/chat/stream';

export type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SendInput {
  text: string;
  imageUris?: string[];
  replyToId?: string;
  mentionBotIds?: string[];
}

interface StoreState {
  status: BootstrapStatus;
  data: ChatBootstrap | null;
  error: string | null;
  threads: Record<string, ThreadState>;
}

type StoreAction =
  | { type: 'reset' }
  | { type: 'bootstrap_start' }
  | { type: 'bootstrap_ok'; data: ChatBootstrap }
  | { type: 'bootstrap_failed'; error: string }
  | { type: 'upsert_thread'; thread: ChatThread }
  | { type: 'thread_read'; threadId: string; lastReadAt?: string }
  | { type: 'merge_thread'; thread: ChatThread }
  | { type: 'upsert_bot'; bot: ChatBot }
  | { type: 'thread'; threadId: string; action: ThreadAction };

const initialStore: StoreState = { status: 'idle', data: null, error: null, threads: {} };

function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'reset':
      return initialStore;
    case 'bootstrap_start':
      return { ...state, status: state.data ? state.status : 'loading', error: null };
    case 'bootstrap_ok':
      return { ...state, status: 'ready', data: action.data, error: null };
    case 'bootstrap_failed':
      return { ...state, status: state.data ? 'ready' : 'error', error: action.error };
    case 'upsert_thread': {
      if (!state.data) return state;
      const rest = state.data.threads.filter((t) => t.id !== action.thread.id);
      return { ...state, data: { ...state.data, threads: [action.thread, ...rest] } };
    }
    case 'thread_read': {
      if (!state.data) return state;
      const threads = markThreadReadIn(state.data.threads, action.threadId, action.lastReadAt);
      return { ...state, data: { ...state.data, threads } };
    }
    case 'merge_thread': {
      if (!state.data) return state;
      return { ...state, data: { ...state.data, threads: mergeThreadIn(state.data.threads, action.thread) } };
    }
    case 'upsert_bot': {
      if (!state.data) return state;
      const exists = state.data.bots.some((b) => b.id === action.bot.id);
      const bots = exists
        ? state.data.bots.map((b) => (b.id === action.bot.id ? action.bot : b))
        : [...state.data.bots, action.bot];
      const threads = state.data.threads.map((t) => ({
        ...t,
        bots: t.bots.map((b) => (b.id === action.bot.id ? action.bot : b)),
      }));
      return { ...state, data: { ...state.data, bots, threads } };
    }
    case 'thread': {
      const prev = state.threads[action.threadId] ?? initialThreadState;
      const next = threadReducer(prev, action.action);
      return next === prev ? state : { ...state, threads: { ...state.threads, [action.threadId]: next } };
    }
  }
}

interface ChatContextValue {
  account: SigningAccount | null;
  /** null = not checked yet. */
  hasSession: boolean | null;
  store: StoreState;
  storeRef: React.MutableRefObject<StoreState>;
  dispatch: React.Dispatch<StoreAction>;
  refreshBootstrap: () => Promise<void>;
  startSession: () => Promise<boolean>;
  aborters: React.MutableRefObject<Map<string, AbortController>>;
  uploadCache: React.MutableRefObject<Map<string, string>>;
  lastInputs: React.MutableRefObject<Map<string, { input: SendInput; optionAnswer?: SendMessageBody['optionAnswer'] }>>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function errorMessage(err: unknown): string {
  if (err instanceof ChatApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Es ist ein Fehler aufgetreten.';
}

function errorCode(err: unknown): string {
  return err instanceof ChatApiError ? err.code : 'unknown';
}

function notSignedIn(): ChatApiError {
  return new ChatApiError('not_signed_in', 'Bitte melde dich zuerst an.');
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const active = useActiveAccount();
  const account = useMemo<SigningAccount | null>(
    () => (active ? { address: active.address, signMessage: (args) => active.signMessage(args) } : null),
    [active],
  );
  const wallet = account?.address.toLowerCase() ?? null;

  const [store, dispatch] = useReducer(storeReducer, initialStore);
  const storeRef = useRef(store);
  storeRef.current = store;
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const aborters = useRef(new Map<string, AbortController>());
  const uploadCache = useRef(new Map<string, string>());
  const lastInputs = useRef(new Map<string, { input: SendInput; optionAnswer?: SendMessageBody['optionAnswer'] }>());
  const bootstrapInFlight = useRef<Promise<void> | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;

  // Wallet switch or logout: drop everything from the previous identity.
  useEffect(() => {
    dispatch({ type: 'reset' });
    setHasSession(null);
    uploadCache.current.clear();
    lastInputs.current.clear();
    if (!wallet) {
      setHasSession(false);
      return;
    }
    let cancelled = false;
    hasStoredChatSession(wallet).then((ok) => {
      if (!cancelled) setHasSession(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  useEffect(() => {
    const map = aborters.current;
    return () => {
      map.forEach((c) => c.abort());
      map.clear();
    };
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const acc = accountRef.current;
    if (!acc) return;
    if (bootstrapInFlight.current) return bootstrapInFlight.current;
    const run = (async () => {
      dispatch({ type: 'bootstrap_start' });
      try {
        const data = await fetchBootstrap(acc);
        if (accountRef.current?.address.toLowerCase() !== acc.address.toLowerCase()) return;
        dispatch({ type: 'bootstrap_ok', data });
        setHasSession(true);
      } catch (err) {
        dispatch({ type: 'bootstrap_failed', error: errorMessage(err) });
      }
    })().finally(() => {
      bootstrapInFlight.current = null;
    });
    bootstrapInFlight.current = run;
    return run;
  }, []);

  const startSession = useCallback(async () => {
    const acc = accountRef.current;
    if (!acc) return false;
    try {
      await ensureChatSession(acc);
      setHasSession(true);
      await refreshBootstrap();
      return true;
    } catch (err) {
      dispatch({ type: 'bootstrap_failed', error: errorMessage(err) });
      return false;
    }
  }, [refreshBootstrap]);

  const value = useMemo<ChatContextValue>(
    () => ({ account, hasSession, store, storeRef, dispatch, refreshBootstrap, startSession, aborters, uploadCache, lastInputs }),
    [account, hasSession, store, refreshBootstrap, startSession],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('Chat hooks must be used inside <ChatProvider> (app/chat/_layout.tsx).');
  return ctx;
}

/** Presets, own bots, threads, tier and quota. Refetches whenever the calling screen gains focus. */
export function useChatBootstrap() {
  const { account, hasSession, store, refreshBootstrap, startSession } = useChatContext();

  useFocusEffect(
    useCallback(() => {
      if (hasSession) refreshBootstrap();
    }, [hasSession, refreshBootstrap]),
  );

  const data = store.data;
  return {
    isConnected: !!account,
    /** null while the stored session is being checked; false → show the Welcome screen. */
    hasSession,
    status: store.status,
    error: store.error,
    presets: data?.presets ?? [],
    bots: data?.bots ?? [],
    threads: data?.threads ?? [],
    tier: (data?.tier ?? 'free') as ChatTier,
    quota: data?.quota ?? { used: 0, limit: 0 },
    refresh: refreshBootstrap,
    /** Signs the chat session (Welcome → "Los geht's") and loads the bootstrap. */
    startSession,
  };
}

/** One thread: messages, paging, send with optimistic bubble + streamed replies, reactions, options. */
export function useThread(threadId: string) {
  const { account, store, storeRef, dispatch, aborters, uploadCache, lastInputs } = useChatContext();
  const state = store.threads[threadId] ?? initialThreadState;
  const thread = store.data?.threads.find((t) => t.id === threadId) ?? null;

  const local = useCallback(
    (action: ThreadAction) => dispatch({ type: 'thread', threadId, action }),
    [dispatch, threadId],
  );
  const current = useCallback(() => storeRef.current.threads[threadId] ?? initialThreadState, [storeRef, threadId]);

  const refresh = useCallback(async () => {
    if (!account || !threadId) return;
    if (current().streaming) return; // the stream owns the tail right now
    try {
      const res = await fetchMessages(account, threadId, { limit: 50 });
      // Fresh thread (lastReadAt, routine state) lands in the same render as the page.
      if (res.thread) dispatch({ type: 'merge_thread', thread: res.thread });
      local({ type: 'loaded', messages: res.messages, hasMore: res.hasMore });
    } catch (err) {
      local({ type: 'load_failed', code: errorCode(err), message: errorMessage(err) });
    }
  }, [account, threadId, current, local, dispatch]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const loadOlder = useCallback(async () => {
    const s = current();
    if (!account || s.loadingOlder || !s.hasMore) return;
    const oldest = s.messages.find((m) => !m.id.startsWith(TEMP_ID_PREFIX));
    if (!oldest) return;
    local({ type: 'load_older_start' });
    try {
      const res = await fetchMessages(account, threadId, { before: oldest.createdAt, limit: 50 });
      local({ type: 'older_loaded', messages: res.messages, hasMore: res.hasMore });
    } catch {
      local({ type: 'load_older_failed' });
    }
  }, [account, threadId, current, local]);

  const runSend = useCallback(
    async (input: SendInput, optionAnswer?: SendMessageBody['optionAnswer']) => {
      if (!account) throw notSignedIn();
      if (current().streaming) return; // one turn at a time
      lastInputs.current.set(threadId, { input, optionAnswer });
      const tempId = `${TEMP_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const draft: SendMessageBody = {
        text: input.text,
        ...(input.replyToId ? { replyToId: input.replyToId } : {}),
        ...(input.mentionBotIds?.length ? { mentionBotIds: input.mentionBotIds } : {}),
        ...(optionAnswer ? { optionAnswer } : {}),
      };
      local({
        type: 'send_optimistic',
        tempId,
        threadId,
        body: draft,
        localImageUris: input.imageUris,
        createdAt: new Date().toISOString(),
      });

      const imageUrls: string[] = [];
      try {
        for (const uri of input.imageUris ?? []) {
          let url = uploadCache.current.get(uri);
          if (!url) {
            url = (await apiUploadImage(account, uri)).url;
            uploadCache.current.set(uri, url);
          }
          imageUrls.push(url);
        }
      } catch (err) {
        local({ type: 'send_failed', code: errorCode(err), message: errorMessage(err), body: draft });
        return;
      }
      let body: SendMessageBody = imageUrls.length ? { ...draft, imageUrls } : draft;
      // Calendar bots get the next 7 days of the device calendar when read access is granted.
      if (isCalendarThread(storeRef.current.data?.threads.find((t) => t.id === threadId))) {
        const calendarContext = await readCalendarContext();
        if (calendarContext) body = { ...body, calendarContext };
      }

      const controller = new AbortController();
      aborters.current.get(threadId)?.abort();
      aborters.current.set(threadId, controller);
      try {
        await sendThreadMessage(
          account,
          threadId,
          body,
          (event) => {
            local({ type: 'stream_event', event });
            if (event.type === 'done') dispatch({ type: 'upsert_thread', thread: event.thread });
          },
          controller.signal,
        );
      } finally {
        if (aborters.current.get(threadId) === controller) aborters.current.delete(threadId);
      }
    },
    [account, threadId, current, local, dispatch, aborters, uploadCache, lastInputs, storeRef],
  );

  const send = useCallback((input: SendInput) => runSend(input), [runSend]);

  /** Resends the failed message (uploads already done are reused). */
  const retry = useCallback(async () => {
    const last = lastInputs.current.get(threadId);
    if (!last) return;
    await runSend(last.input, last.optionAnswer);
  }, [lastInputs, threadId, runSend]);

  const discardFailed = useCallback(() => local({ type: 'discard_failed' }), [local]);

  /** Stops the running stream (the server may still persist the reply; next refresh shows it). */
  const cancel = useCallback(() => {
    aborters.current.get(threadId)?.abort();
    aborters.current.delete(threadId);
    local({ type: 'stream_cancelled' });
  }, [aborters, threadId, local]);

  const answerOption = useCallback(
    async (messageId: string, key: string) => {
      const message = current().messages.find((m) => m.id === messageId);
      const part = message?.parts.find((p) => p.type === 'options');
      const label = part && part.type === 'options' ? part.options.find((o) => o.key === key)?.label ?? key : key;
      local({ type: 'option_answered', messageId, key });
      await runSend({ text: label }, { messageId, key });
    },
    [current, local, runSend],
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      if (!account) throw notSignedIn();
      local({ type: 'react_optimistic', messageId, emoji });
      try {
        const reactions = await reactToMessage(account, messageId, emoji);
        local({ type: 'reactions', messageId, reactions });
      } catch {
        refresh();
      }
    },
    [account, local, refresh],
  );

  const dismissOptions = useCallback(
    async (messageId: string) => {
      if (!account) throw notSignedIn();
      local({ type: 'dismiss_options', messageId });
      try {
        const message = await apiDismissOptions(account, messageId);
        local({ type: 'message_replaced', message });
      } catch {
        // Optimistic state stays; the next refresh reconciles.
      }
    },
    [account, local],
  );

  /** Optimistic part-status update (calendar_event / integration) + PATCH; refresh on failure. */
  const setPartStatus = useCallback(
    async (messageId: string, index: number, status: CalendarEventStatus | 'pending' | 'connected') => {
      if (!account) throw notSignedIn();
      const message = current().messages.find((m) => m.id === messageId);
      if (message) local({ type: 'message_replaced', message: withPartStatus(message, index, status) });
      try {
        local({ type: 'message_replaced', message: await apiSetMessagePartStatus(account, messageId, index, status) });
      } catch {
        refresh();
      }
    },
    [account, current, local, refresh],
  );

  /** Opens the OS "new event" sheet for a proposed event; marks it added when saved. */
  const addCalendarEvent = useCallback(
    async (messageId: string, index: number): Promise<boolean> => {
      const part = current().messages.find((m) => m.id === messageId)?.parts[index];
      if (!part || part.type !== 'calendar_event') return false;
      const saved = await addEventWithSystemSheet(part);
      if (saved) await setPartStatus(messageId, index, 'added');
      return saved;
    },
    [current, setPartStatus],
  );

  /**
   * "Autorisieren" on a device_calendar card: asks for read access (only when the OS can still
   * prompt), marks the card connected and re-sends so the bot sees the calendar.
   */
  const authorizeDeviceCalendar = useCallback(
    async (messageId: string, index: number): Promise<CalendarReadAccess> => {
      const access = await requestCalendarReadAccess();
      if (access !== 'granted') return access;
      await setPartStatus(messageId, index, 'connected');
      await runSend({ text: 'Ich habe meinen Kalender freigegeben.' });
      return access;
    },
    [setPartStatus, runSend],
  );

  /**
   * Runs one approve/reject/complete stream into the thread exactly like a send (isStreaming,
   * streaming bubble, error state). `optimistic` is applied to the approval part first and rolled
   * back when the stream fails; the thread refetches afterwards so the card matches the server.
   * Throws ChatApiError (German message) when the stream ended in an error.
   */
  const runActionStream = useCallback(
    async (
      actionId: string,
      optimistic: 'approved' | 'rejected' | null,
      open: (onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal) => Promise<void>,
    ): Promise<void> => {
      if (!account) throw notSignedIn();
      if (current().streaming) {
        throw new ChatApiError('busy', 'Einen Moment – die Antwort läuft noch.');
      }
      const before = findApproval(current(), actionId)?.part.status ?? null;
      if (optimistic) local({ type: 'approval_status', actionId, status: optimistic });
      local({ type: 'continuation_start' });

      const controller = new AbortController();
      aborters.current.get(threadId)?.abort();
      aborters.current.set(threadId, controller);
      let failure: { code: string; message: string } | null = null;
      try {
        await open((event) => {
          local({ type: 'stream_event', event });
          if (event.type === 'done') dispatch({ type: 'upsert_thread', thread: event.thread });
          if (event.type === 'error') failure = { code: event.code, message: event.message };
        }, controller.signal);
      } finally {
        if (aborters.current.get(threadId) === controller) aborters.current.delete(threadId);
      }
      const failed = failure as { code: string; message: string } | null;
      if (failed && optimistic && before) local({ type: 'approval_status', actionId, status: before });
      // The server owns the final part state (executed / failed / resultNote): reconcile. Fetched
      // directly because `refresh` skips while storeRef still shows the (just finished) stream.
      if (!controller.signal.aborted) {
        fetchMessages(account, threadId, { limit: 50 })
          .then((res) => {
            if (res.thread) dispatch({ type: 'merge_thread', thread: res.thread });
            if (!current().streaming) local({ type: 'loaded', messages: res.messages, hasMore: res.hasMore });
          })
          .catch(() => {});
      }
      if (failed) throw new ChatApiError(failed.code, failed.message);
    },
    [account, current, local, dispatch, aborters, threadId],
  );

  /** "Freigeben" on an approval card (non-money): executes server-side, bot continues. */
  const approveAction = useCallback(
    (actionId: string, opts?: { alwaysAllow?: boolean }) =>
      runActionStream(actionId, 'approved', (onEvent, signal) =>
        apiApproveAction(account as SigningAccount, actionId, { alwaysAllow: !!opts?.alwaysAllow }, onEvent, signal),
      ),
    [account, runActionStream],
  );

  /** "Ablehnen": the bot acknowledges briefly. */
  const rejectAction = useCallback(
    (actionId: string, reason?: string) =>
      runActionStream(actionId, 'rejected', (onEvent, signal) =>
        apiRejectAction(account as SigningAccount, actionId, reason ? { reason } : {}, onEvent, signal),
      ),
    [account, runActionStream],
  );

  /** Money approvals: reports the device-signed transfer (txHash) or its failure (error). */
  const completeAction = useCallback(
    (actionId: string, result: { txHash?: string; error?: string }) =>
      runActionStream(actionId, result.txHash ? 'approved' : null, (onEvent, signal) =>
        apiCompleteAction(account as SigningAccount, actionId, result, onEvent, signal),
      ),
    [account, runActionStream],
  );

  const markRead = useCallback(async () => {
    if (!account || !threadId) return;
    dispatch({ type: 'thread_read', threadId });
    try {
      const res = await markThreadRead(account, threadId);
      if (res?.lastReadAt) dispatch({ type: 'thread_read', threadId, lastReadAt: res.lastReadAt });
    } catch {
      // Unread flag is cosmetic; the next bootstrap reconciles.
    }
  }, [account, threadId, dispatch]);

  return {
    thread,
    messages: state.messages,
    hasMore: state.hasMore,
    loaded: state.loaded,
    /** Increments after each finished first-page fetch (see ThreadState.loadSeq). */
    loadSeq: state.loadSeq,
    loadingOlder: state.loadingOlder,
    isStreaming: state.streaming !== null,
    /** Bot currently writing (typing indicator); null between bubbles or before the first bot_start. */
    streamingBotId: state.streaming?.botId ?? null,
    streamingMessageId: state.streaming?.messageId ?? null,
    error: state.error as ThreadError | null,
    refresh,
    loadOlder,
    send,
    retry,
    discardFailed,
    cancel,
    answerOption,
    react,
    dismissOptions,
    setPartStatus,
    addCalendarEvent,
    authorizeDeviceCalendar,
    approveAction,
    rejectAction,
    completeAction,
    markRead,
  };
}

// ---- background tasks (agent harness wave 2) ------------------------------------

/** Poll interval for live task cards while the thread screen is focused. */
export const TASK_POLL_MS = 4000;

/**
 * Live task cards of one thread: while the screen is focused and a task part is queued / running /
 * waiting for approval, polls GET /api/chat/tasks/:id every 4 s and patches the part in place.
 * Stops once every task is terminal. When a task finishes or starts waiting for an approval the
 * worker posts a bot message, so the thread page is refetched then.
 */
export function useTaskPolling(threadId: string) {
  const { account, store, storeRef, dispatch } = useChatContext();
  const state = store.threads[threadId] ?? initialThreadState;
  const liveIds = liveTaskIds(state);
  const liveKey = liveIds.join(',');
  const [focused, setFocused] = useState(false);
  const lastStatus = useRef(new Map<string, TaskPartStatus>());

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!account || !focused || !liveKey) return;
    const ids = liveKey.split(',');
    let stopped = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      let reload = false;
      try {
        await Promise.all(
          ids.map(async (id) => {
            try {
              const task = await apiFetchTask(account, id);
              if (stopped || !task) return;
              const before = lastStatus.current.get(id);
              lastStatus.current.set(id, task.status);
              if (before !== task.status && (task.status === 'waiting_approval' || !isLiveTaskStatus(task.status))) {
                reload = true;
              }
              dispatch({ type: 'thread', threadId, action: { type: 'task_update', task } });
            } catch {
              // Transient: the next tick retries.
            }
          }),
        );
        if (reload && !stopped && !storeRef.current.threads[threadId]?.streaming) {
          const res = await fetchMessages(account, threadId, { limit: 50 }).catch(() => null);
          if (res && !stopped && !storeRef.current.threads[threadId]?.streaming) {
            if (res.thread) dispatch({ type: 'merge_thread', thread: res.thread });
            dispatch({ type: 'thread', threadId, action: { type: 'loaded', messages: res.messages, hasMore: res.hasMore } });
          }
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(tick, TASK_POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [account, focused, liveKey, threadId, dispatch, storeRef]);

  /** "Abbrechen" on a running task card. Throws ChatApiError (German message). */
  const cancelTask = useCallback(
    async (taskId: string) => {
      if (!account) throw notSignedIn();
      const task = await apiCancelTask(account, taskId);
      if (task) dispatch({ type: 'thread', threadId, action: { type: 'task_update', task } });
    },
    [account, dispatch, threadId],
  );

  return { liveTaskIds: liveIds, cancelTask };
}

/** Mutations that are not bound to one open thread. All throw ChatApiError (German `message`). */
export function useChatActions() {
  const { account, dispatch, refreshBootstrap } = useChatContext();

  const createBot = useCallback(
    async (input: CreateBotInput): Promise<ChatBot> => {
      if (!account) throw notSignedIn();
      const bot = await apiCreateBot(account, input);
      dispatch({ type: 'upsert_bot', bot });
      return bot;
    },
    [account, dispatch],
  );

  const updateBot = useCallback(
    async (id: string, patch: UpdateBotInput): Promise<ChatBot> => {
      if (!account) throw notSignedIn();
      const bot = await apiUpdateBot(account, id, patch);
      dispatch({ type: 'upsert_bot', bot });
      return bot;
    },
    [account, dispatch],
  );

  const createThread = useCallback(
    async (botIds: string[]): Promise<{ thread: ChatThread; messages: ChatMessage[] }> => {
      if (!account) throw notSignedIn();
      const res = await apiCreateThread(account, botIds);
      dispatch({ type: 'upsert_thread', thread: res.thread });
      dispatch({
        type: 'thread',
        threadId: res.thread.id,
        action: { type: 'loaded', messages: res.messages, hasMore: false },
      });
      return res;
    },
    [account, dispatch],
  );

  const uploadImage = useCallback(
    async (uri: string): Promise<UploadedImage> => {
      if (!account) throw notSignedIn();
      return apiUploadImage(account, uri);
    },
    [account],
  );

  const transcribe = useCallback(
    async (uri: string): Promise<string> => {
      if (!account) throw notSignedIn();
      return transcribeAudio(account, uri);
    },
    [account],
  );

  const fetchFile = useCallback(
    async (fileId: string): Promise<ChatFile> => {
      if (!account) throw notSignedIn();
      return apiFetchFile(account, fileId);
    },
    [account],
  );

  /** Routines of one thread (bot sheet). */
  const fetchRoutines = useCallback(
    async (threadId: string): Promise<ChatRoutine[]> => {
      if (!account) throw notSignedIn();
      return apiFetchRoutines(account, threadId);
    },
    [account],
  );

  /** Pause/resume or edit a routine; the chat list's online dot + topic follow via refetch. */
  const updateRoutine = useCallback(
    async (id: string, patch: UpdateRoutineInput): Promise<ChatRoutine> => {
      if (!account) throw notSignedIn();
      const routine = await apiUpdateRoutine(account, id, patch);
      refreshBootstrap();
      return routine;
    },
    [account, refreshBootstrap],
  );

  const deleteRoutine = useCallback(
    async (id: string): Promise<void> => {
      if (!account) throw notSignedIn();
      await apiDeleteRoutine(account, id);
      refreshBootstrap();
    },
    [account, refreshBootstrap],
  );

  /** Agent memory facts ("Gedächtnis"). */
  const fetchMemories = useCallback(async (): Promise<ChatMemory[]> => {
    if (!account) throw notSignedIn();
    return apiFetchMemories(account);
  }, [account]);

  const deleteMemory = useCallback(
    async (id: string): Promise<void> => {
      if (!account) throw notSignedIn();
      await apiDeleteMemory(account, id);
    },
    [account],
  );

  /** Always-allowed gated tools of one bot ("Berechtigungen"). */
  const fetchBotGrants = useCallback(
    async (botId: string): Promise<BotGrants> => {
      if (!account) throw notSignedIn();
      return apiFetchBotGrants(account, botId);
    },
    [account],
  );

  const setBotGrants = useCallback(
    async (botId: string, tools: string[]): Promise<string[]> => {
      if (!account) throw notSignedIn();
      return apiPutBotGrants(account, botId, tools);
    },
    [account],
  );

  /** Audit list ("Aktivität"), newest first. */
  const fetchAgentActions = useCallback(
    async (limit = 50): Promise<AgentActionRecord[]> => {
      if (!account) throw notSignedIn();
      return apiFetchAgentActions(account, limit);
    },
    [account],
  );

  /** Connectors ("Verbindungen"): MCP servers + Google. */
  const fetchConnectors = useCallback(async (): Promise<ChatConnectorList> => {
    if (!account) throw notSignedIn();
    return apiFetchConnectors(account);
  }, [account]);

  const addMcpConnector = useCallback(
    async (input: AddMcpConnectorInput): Promise<ChatConnector> => {
      if (!account) throw notSignedIn();
      return apiAddMcpConnector(account, input);
    },
    [account],
  );

  const deleteConnector = useCallback(
    async (id: string): Promise<void> => {
      if (!account) throw notSignedIn();
      await apiDeleteConnector(account, id);
    },
    [account],
  );

  const refreshConnector = useCallback(
    async (id: string): Promise<ChatConnector> => {
      if (!account) throw notSignedIn();
      return apiRefreshConnector(account, id);
    },
    [account],
  );

  const startGoogleConnect = useCallback(
    async (returnUrl: string): Promise<string> => {
      if (!account) throw notSignedIn();
      return apiStartGoogleConnect(account, returnUrl);
    },
    [account],
  );

  return {
    createBot, updateBot, createThread, uploadImage, transcribe, fetchFile,
    fetchRoutines, updateRoutine, deleteRoutine,
    fetchMemories, deleteMemory, fetchBotGrants, setBotGrants, fetchAgentActions,
    fetchConnectors, addMcpConnector, deleteConnector, refreshConnector, startGoogleConnect,
  };
}

// ---- "Für dich" inspiration ----------------------------------------------------

/** Last feed per wallet + audience, so the chat list row and the screen open without a spinner. */
const inspirationCache = new Map<string, InspirationFeed>();

/**
 * "Für dich" cards for one audience chip ("me" or "org:<id>"). Refetches on focus; the chat
 * list and the inspiration screen share the cached feed.
 */
export function useInspiration(audienceKey: string) {
  const { account, hasSession } = useChatContext();
  const wallet = account?.address.toLowerCase() ?? '';
  const cacheKey = `${wallet}|${audienceKey}`;
  const [feed, setFeed] = useState<InspirationFeed | null>(() => inspirationCache.get(cacheKey) ?? null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(feed ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Switching chips: show that chip's cached feed right away (or the spinner).
  const [shownKey, setShownKey] = useState(cacheKey);
  if (shownKey !== cacheKey) {
    setShownKey(cacheKey);
    const cached = inspirationCache.get(cacheKey) ?? null;
    setFeed(cached);
    setStatus(cached ? 'ready' : 'idle');
    setError(null);
  }

  const refresh = useCallback(async () => {
    if (!account || !hasSession) return;
    const mine = ++seq.current;
    setStatus((s) => (s === 'ready' ? 'ready' : 'loading'));
    try {
      const data = await fetchInspiration(account, audienceKey);
      if (mine !== seq.current) return;
      inspirationCache.set(cacheKey, data);
      setFeed(data);
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorMessage(err));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [account, hasSession, audienceKey, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  /** "Nicht relevant": optimistic removal, restored when the server refuses. */
  const dismiss = useCallback(
    async (taskId: string) => {
      if (!account) throw notSignedIn();
      const before = inspirationCache.get(cacheKey) ?? feed;
      if (before) {
        const next = withoutTask(before, taskId);
        inspirationCache.set(cacheKey, next);
        setFeed(next);
      }
      try {
        await dismissInspiration(account, taskId);
        // Other chips may still hold the card.
        for (const key of [...inspirationCache.keys()]) {
          if (key !== cacheKey && key.startsWith(`${wallet}|`)) inspirationCache.delete(key);
        }
      } catch (err) {
        if (before) {
          inspirationCache.set(cacheKey, before);
          setFeed(before);
        }
        throw err;
      }
    },
    [account, cacheKey, feed, wallet],
  );

  return {
    status,
    error,
    audiences: feed?.audiences ?? [],
    tasks: feed?.tasks ?? [],
    tier: feed?.tier ?? 'free',
    refresh,
    dismiss,
  };
}
