// Mecky Chat state (spec §4.4). Mounted only around app/chat/* by app/chat/_layout.tsx. Holds the
// bootstrap snapshot (presets, bots, threads, tier, quota) and one ThreadState per opened thread.
// No Supabase Realtime (the app has no Supabase auth session): data refetches on focus.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import {
  ChatApiError,
  createBot as apiCreateBot,
  createThread as apiCreateThread,
  dismissOptions as apiDismissOptions,
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
  type ChatTier,
  type CreateBotInput,
  type SendMessageBody,
  type UpdateBotInput,
  type UploadedImage,
} from '@/lib/chat/api';
import { ensureChatSession, hasStoredChatSession } from '@/lib/chat/session';
import {
  initialThreadState,
  threadReducer,
  TEMP_ID_PREFIX,
  type ThreadAction,
  type ThreadError,
  type ThreadState,
} from '@/lib/chat/reducer';
import type { ChatBot, ChatMessage, ChatThread } from '@/lib/chat/types';
import type { SigningAccount } from '@/lib/signed-request';

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
  | { type: 'thread_read'; threadId: string }
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
      const threads = state.data.threads.map((t) => (t.id === action.threadId ? { ...t, unread: false } : t));
      return { ...state, data: { ...state.data, threads } };
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
      local({ type: 'loaded', messages: res.messages, hasMore: res.hasMore });
    } catch (err) {
      local({ type: 'load_failed', code: errorCode(err), message: errorMessage(err) });
    }
  }, [account, threadId, current, local]);

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
      const body: SendMessageBody = imageUrls.length ? { ...draft, imageUrls } : draft;

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
    [account, threadId, current, local, dispatch, aborters, uploadCache, lastInputs],
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

  const markRead = useCallback(async () => {
    if (!account || !threadId) return;
    dispatch({ type: 'thread_read', threadId });
    try {
      await markThreadRead(account, threadId);
    } catch {
      // Unread flag is cosmetic; the next bootstrap reconciles.
    }
  }, [account, threadId, dispatch]);

  return {
    thread,
    messages: state.messages,
    hasMore: state.hasMore,
    loaded: state.loaded,
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
    markRead,
  };
}

/** Mutations that are not bound to one open thread. All throw ChatApiError (German `message`). */
export function useChatActions() {
  const { account, dispatch } = useChatContext();

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

  return { createBot, updateBot, createThread, uploadImage, transcribe, fetchFile };
}
