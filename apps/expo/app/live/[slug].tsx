// Live room: native livestream (expo-video, PiP, background audio) with the rundown,
// chat, floating reactions, Unterstützen (Stripe Checkout) and the Publikumsliebling Meinungsbild.
// Spec: docs/superpowers/specs/2026-11-05-live-room-design.md. Deep link: roebel://live/<slug>.
//
// Layout (2026-11-06): the room IS the immersive full-screen stage (TikTok / Instagram Live / eBay Live):
// LivePlayer renders the stage, FullscreenOverlay the chat + action column on it. No split view, no Modal:
// every sheet (Programm, Unterstützen, Publikumsliebling, settings, cast, message actions, login) is a
// BottomDrawer modal over this screen, so it never leaves the stage. Landscape = video only (see the stage).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Keyboard, Pressable, Share, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import * as Haptics from 'expo-haptics';
import LiveIcon from '@/components/live/LiveIcon';
import { useGoBack } from '@/hooks/useGoBack';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import {
  authorKeyOf, confirmSupport, fetchChat, fetchResults, fetchShow, joinLiveRoom, liveAct, liveActAs,
  liveErrorText, liveShareUrl, loadBlocked, loadLastSeen, openSupportCheckout, peekLiveSession, precheckChat, randomTestSupport,
  saveBlocked, saveLastSeen, startSupport, subscribeShowChanges, topSupporters,
  type ChatMessage, type LiveReaction, type LiveRoomChannel, type LiveSession, type LiveShow, type MyLiveState, type ReportReason,
  type RundownItem, type VoteResults,
} from '@/lib/live';
import LivePlayer from '@/components/live/LivePlayer';
import ProgramSheet from '@/components/live/ProgramSheet';
import SupportSheet, { type SupportDraft } from '@/components/live/SupportSheet';
import VoteSheet from '@/components/live/VoteSheet';
import FullscreenOverlay, { type FullscreenOverlayApi } from '@/components/live/FullscreenOverlay';
import MessageActionsSheet from '@/components/live/chat/MessageActionsSheet';
import SupportAlertLayer, { type SupportAlertHandle } from '@/components/live/SupportAlertLayer';
import LoginDrawer from '@/components/LoginDrawer';
// Guard only (no LiveKit import): the join route itself is reached via router.push, never imported.
import { hasLiveKitNative } from '@/lib/live-guest-support';
import type { FloatingReactionsHandle } from '@/components/live/FloatingReactions';
import { F, VIDEO } from '@/components/live/tokens';

// ─── Defensive expo-keep-awake load (same pattern as FeedAudioPlayerCard) ───
type KeepAwakeFn = (tag?: string) => Promise<void> | void;
let activateKeepAwakeAsync: KeepAwakeFn = async () => {};
let deactivateKeepAwake: KeepAwakeFn = async () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ka = require('expo-keep-awake');
  if (ka?.activateKeepAwakeAsync) activateKeepAwakeAsync = ka.activateKeepAwakeAsync as KeepAwakeFn;
  if (ka?.deactivateKeepAwake) deactivateKeepAwake = ka.deactivateKeepAwake as KeepAwakeFn;
} catch {
  // Screen may sleep; playback itself is unaffected.
}
const KEEP_AWAKE_TAG = 'roebel-live-room';

const MAX_CHAT = 200;
const SHOW_POLL_MS = 30_000;
const RESULTS_POLL_MS = 10_000;
/** The "Neu" divider goes away on its own after this long. */
const NEW_DIVIDER_MS = 120_000;

function sortRundown(items: RundownItem[]): RundownItem[] {
  return [...items].sort((a, b) => a.position - b.position);
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const next = list.slice();
  next[i] = { ...next[i], ...row };
  return next;
}

/** Swap an optimistic message for the server row (or drop it when the real row is already there via Realtime). */
function reconcileTemp(list: ChatMessage[], tempId: string, real: ChatMessage): ChatMessage[] {
  const realRow = { ...real, pending: false };
  if (list.some((x) => x.id === real.id)) return upsertById(list.filter((x) => x.id !== tempId), realRow);
  const i = list.findIndex((x) => x.id === tempId);
  if (i === -1) return [...list, realRow];
  const next = list.slice();
  next[i] = realRow;
  return next;
}

type Me = Pick<LiveSession, 'author_key' | 'display_name' | 'avatar_url'>;

export default function LiveRoomScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const thirdwebAccount = useActiveAccount();
  const signerRef = useRef(thirdwebAccount);
  signerRef.current = thirdwebAccount;
  const loggedIn = !!thirdwebAccount;
  const { activeAccount } = useAccount();
  const { user } = useUser();
  const defaultName = activeAccount?.name ?? user?.username ?? '';

  const [show, setShow] = useState<LiveShow | null>(null);
  const showRef = useRef<LiveShow | null>(null);
  showRef.current = show;
  const [rundown, setRundown] = useState<RundownItem[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewers, setViewers] = useState(0);
  const freshIds = useRef(new Set<string>());
  const [ownIds, setOwnIds] = useState<Set<string>>(() => new Set());

  // Personal state (needs a live session)
  const [reminders, setReminders] = useState<Set<string>>(() => new Set());
  const [myVote, setMyVote] = useState<string | null>(null);

  // Chat: inline error of the last send; who "I" am in this show (author_key from the cached live session,
  // so own messages from earlier visits get "(du)" too, without a new signature).
  const [chatError, setChatError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const meRef = useRef<Me | null>(null);
  meRef.current = me;
  const tempSeq = useRef(0);

  // Sheets
  const [programOpen, setProgramOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [results, setResults] = useState<VoteResults | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState<'support' | 'next' | null>(null);
  // Phone guests need the LiveKit native modules (3.9.0+ binaries); constant per process.
  const [guestsNative] = useState(() => hasLiveKitNative());

  // Moderation (local block list per show, report sheet) + "Neu" divider
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set());
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [snack, setSnack] = useState<{ text: string; undoKey: string } | null>(null);
  const [newDividerId, setNewDividerId] = useState<string | null>(null);
  const lastSentRef = useRef<{ body: string; at: number } | null>(null);
  const chatRef = useRef<ChatMessage[]>([]);
  chatRef.current = chat;

  const reactionsRef = useRef<FloatingReactionsHandle>(null);
  const supportAlertRef = useRef<SupportAlertHandle>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  // Close the login drawer as soon as the account is there; the room continues where you were.
  useEffect(() => {
    if (loggedIn) setLoginOpen(false);
  }, [loggedIn]);

  const roomRef = useRef<LiveRoomChannel | null>(null);

  // ─── Keep awake while watching ───
  useEffect(() => {
    void Promise.resolve(activateKeepAwakeAsync(KEEP_AWAKE_TAG)).catch(() => undefined);
    return () => { void Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined); };
  }, []);

  // ─── Initial load ───
  useEffect(() => {
    let alive = true;
    if (!slug) { setLoading(false); return; }
    void (async () => {
      const r = await fetchShow(String(slug));
      if (!alive) return;
      if (r) {
        setShow(r.show);
        setRundown(sortRundown(r.rundown));
        const [history, lastSeen] = await Promise.all([fetchChat(r.show.id), loadLastSeen(r.show.id)]);
        if (alive) {
          setChat(history);
          const seenAt = lastSeen ? Date.parse(lastSeen) : NaN;
          if (Number.isFinite(seenAt)) {
            const firstNew = history.find((m) => Date.parse(m.created_at) > seenAt);
            if (firstNew) setNewDividerId(firstNew.id);
          }
        }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  const showId = show?.id ?? null;

  const refetchAll = useCallback(async () => {
    const s = showRef.current;
    if (!s) return;
    const [r, history] = await Promise.all([fetchShow(s.slug), fetchChat(s.id)]);
    if (r) { setShow(r.show); setRundown(sortRundown(r.rundown)); }
    if (history.length) {
      setChat((cur) => {
        let next = cur;
        for (const m of history) next = upsertById(next, m);
        return next.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(-MAX_CHAT);
      });
    }
  }, []);

  // ─── Realtime: table changes ───
  useEffect(() => {
    if (!showId) return;
    return subscribeShowChanges(showId, {
      onShow: (s) => setShow((cur) => (cur ? { ...cur, ...s } : s)),
      onItem: (item, ev, oldId) => {
        if (ev === 'DELETE') { setRundown((cur) => cur.filter((x) => x.id !== oldId)); return; }
        setRundown((cur) => sortRundown(upsertById(cur, item)));
      },
      onChatInsert: (m) => {
        if (m.hidden_at) return;
        // Unterstützen shows as an in-app layer over the player (never in the stream picture).
        if (m.kind === 'support') supportAlertRef.current?.push(m);
        freshIds.current.add(m.id);
        const myKey = meRef.current?.author_key ?? null;
        const mine = !!myKey && m.author_key === myKey;
        if (mine) setOwnIds((cur) => (cur.has(m.id) ? cur : new Set(cur).add(m.id)));
        setChat((cur) => {
          // Our own message arriving before the send response: it replaces the optimistic copy.
          if (mine && !cur.some((x) => x.id === m.id)) {
            const temp = cur.find((x) => x.pending && x.body === m.body);
            if (temp) return reconcileTemp(cur, temp.id, m).slice(-MAX_CHAT);
          }
          return upsertById(cur, m).slice(-MAX_CHAT);
        });
      },
      onChatUpdate: (m) => {
        if (m.hidden_at) { setChat((cur) => cur.filter((x) => x.id !== m.id)); return; }
        setChat((cur) => (cur.some((x) => x.id === m.id) ? upsertById(cur, m) : cur));
      },
      onResubscribed: () => { void refetchAll(); },
    });
  }, [showId, refetchAll]);

  // Fallback poll + refresh on foreground (realtime can silently drop on mobile networks).
  useEffect(() => {
    if (!showId) return;
    const t = setInterval(() => {
      const s = showRef.current;
      if (!s) return;
      void fetchShow(s.slug).then((r) => {
        if (r) { setShow(r.show); setRundown(sortRundown(r.rundown)); }
      });
    }, SHOW_POLL_MS);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void refetchAll(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [showId, refetchAll]);

  // ─── Presence + reactions ───
  useEffect(() => {
    if (!showId) return;
    const room = joinLiveRoom(showId, {
      onViewers: setViewers,
      onReaction: (e) => reactionsRef.current?.spawn(e),
    });
    roomRef.current = room;
    return () => { room.close(); roomRef.current = null; };
  }, [showId]);

  // ─── Local block list ───
  useEffect(() => {
    if (!showId) return;
    let alive = true;
    void loadBlocked(showId).then((keys) => { if (alive) setBlocked(new Set(keys)); });
    return () => { alive = false; };
  }, [showId]);

  // ─── "Neu" divider: remember the newest message seen on leave / background; drop the divider after 2 min ───
  useEffect(() => {
    if (!showId) return;
    const persist = () => {
      const real = chatRef.current.filter((m) => !m.pending);
      const newest = real[real.length - 1];
      if (newest?.created_at) void saveLastSeen(showId, newest.created_at);
    };
    const sub = AppState.addEventListener('change', (st) => { if (st === 'background' || st === 'inactive') persist(); });
    return () => { sub.remove(); persist(); };
  }, [showId]);
  useEffect(() => {
    if (!newDividerId) return;
    const t = setTimeout(() => setNewDividerId(null), NEW_DIVIDER_MS);
    return () => clearTimeout(t);
  }, [newDividerId]);

  // ─── Personal state from a cached session (never prompts for a signature on open) ───
  const applyMyState = useCallback((s: MyLiveState | null | undefined) => {
    if (!s) return;
    setMyVote(s.vote_item_id ?? null);
    setReminders(new Set(s.reminder_item_ids ?? []));
  }, []);

  const wallet = thirdwebAccount?.address ?? null;
  const rememberMe = useCallback((session: LiveSession | null) => {
    if (!session) return;
    setMe({ author_key: session.author_key ?? null, display_name: session.display_name, avatar_url: session.avatar_url });
  }, []);
  /** After an action that may have created the session: pick up author_key + profile from the cache. */
  const refreshMe = useCallback(async () => {
    const account = signerRef.current;
    const s = showRef.current;
    if (!account || !s) return;
    rememberMe(await peekLiveSession(account.address, s.id));
  }, [rememberMe]);
  useEffect(() => {
    if (!showId || !wallet) { setMyVote(null); setReminders(new Set()); setMe(null); return; }
    let alive = true;
    void (async () => {
      const session = await peekLiveSession(wallet, showId);
      if (!session || !alive) return;
      rememberMe(session);
      const r = await liveAct<MyLiveState>(session.token, { action: 'my_state', show_id: showId });
      if (alive && r.ok) applyMyState(r.data);
    })();
    return () => { alive = false; };
  }, [showId, wallet, applyMyState, rememberMe]);

  /** After the first session-creating action: pull vote + reminders once. */
  const myStateLoaded = useRef(false);
  const ensureMyState = useCallback(async () => {
    const account = signerRef.current;
    const s = showRef.current;
    if (myStateLoaded.current || !account || !s) return;
    myStateLoaded.current = true;
    const r = await liveActAs<MyLiveState>(account, s.id, { action: 'my_state', show_id: s.id });
    if (r.ok) applyMyState(r.data);
    void refreshMe();
  }, [applyMyState, refreshMe]);

  // ─── Results polling while the vote sheet is open ───
  useEffect(() => {
    if (!voteOpen || !show?.slug) return;
    let alive = true;
    const slugNow = show.slug;
    const load = () => { void fetchResults(slugNow).then((r) => { if (alive && r) setResults(r); }); };
    load();
    const t = show.voting_open ? setInterval(load, RESULTS_POLL_MS) : null;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [voteOpen, show?.slug, show?.voting_open]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Derived ───
  const current = useMemo(() => {
    if (!show) return null;
    return rundown.find((i) => i.id === show.current_item_id) ?? rundown.find((i) => i.status === 'on_stage') ?? null;
  }, [rundown, show]);
  const next = useMemo(() => {
    const upcoming = rundown.filter((i) => i.status === 'upcoming');
    if (current) return upcoming.find((i) => i.position > current.position) ?? null;
    return upcoming[0] ?? null;
  }, [rundown, current]);
  const voteItems = useMemo(() => rundown.filter((i) => i.status === 'done' || i.status === 'on_stage'), [rundown]);
  const pinned = useMemo(() => {
    const id = show?.overlay?.featured_message_id;
    if (!id) return null;
    return chat.find((m) => m.id === id) ?? null;
  }, [chat, show?.overlay?.featured_message_id]);

  // Recomputed on every chat change, so Realtime support inserts update the strip live.
  const supporters = useMemo(() => topSupporters(chat), [chat]);
  const isBlocked = useCallback((m: ChatMessage) => blocked.size > 0 && blocked.has(authorKeyOf(m)), [blocked]);
  const myAuthorKey = me?.author_key ?? null;
  const isOwn = useCallback(
    (m: ChatMessage) => !!m.pending || ownIds.has(m.id) || (!!myAuthorKey && m.author_key === myAuthorKey),
    [ownIds, myAuthorKey],
  );
  /** Re-render chat cells when anything renderItem reads (besides the row itself) changes. */
  const listExtra = useMemo(() => ({ newDividerId, blocked, ownIds, myAuthorKey }), [newDividerId, blocked, ownIds, myAuthorKey]);

  // ─── Actions ───
  // Login opens in place (the app's login drawer), so the stream keeps playing.
  const goLogin = useCallback(() => {
    setActionMsg(null);
    setProgramOpen(false);
    setVoteOpen(false);
    setSupportOpen(false);
    Keyboard.dismiss();
    setLoginOpen(true);
  }, []);

  const react = useCallback((e: LiveReaction) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    reactionsRef.current?.spawn(e, true);
    roomRef.current?.sendReaction(e);
  }, []);

  /** Double-tap on the live video: the stage already drew the heart; only haptic + broadcast here. */
  const sendDoubleTapHeart = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    roomRef.current?.sendReaction('❤️');
  }, []);

  /**
   * Instant send: the message shows right away (pending, slightly dimmed), the composer clears, and the server
   * response swaps in the real row (Realtime may deliver it first: deduped by id / author_key). On failure the
   * optimistic row goes away and the German error shows inline. Returns a precheck error synchronously.
   */
  const sendChat = useCallback((raw: string): string | null => {
    const account = signerRef.current;
    const s = showRef.current;
    const body = raw.trim();
    if (!s || !body) return 'Bitte schreib eine Nachricht.';
    if (!account) { goLogin(); return 'Bitte melde dich an, um mitzuschreiben.'; }
    const pre = precheckChat(body, lastSentRef.current);
    if (pre) { setChatError(pre); return pre; }
    lastSentRef.current = { body, at: Date.now() };
    tempSeq.current += 1;
    const tempId = `tmp-${Date.now()}-${tempSeq.current}`;
    const mine = meRef.current;
    const temp: ChatMessage = {
      id: tempId,
      show_id: s.id,
      display_name: mine?.display_name || defaultName || null,
      avatar_url: mine?.avatar_url ?? null,
      body,
      kind: 'chat',
      amount_cents: null,
      created_at: new Date().toISOString(),
      hidden_at: null,
      featured_at: null,
      author_key: mine?.author_key ?? null,
      pending: true,
    };
    freshIds.current.add(tempId);
    setChatError(null);
    setNewDividerId(null);
    setChat((cur) => [...cur, temp].slice(-MAX_CHAT));
    void Haptics.selectionAsync().catch(() => undefined);
    void (async () => {
      const r = await liveActAs<{ message: ChatMessage }>(account, s.id, { action: 'chat', show_id: s.id, body });
      if (!r.ok) {
        setChat((cur) => cur.filter((x) => x.id !== tempId));
        setChatError(liveErrorText(r.code, r.message));
        // A refused message does not count for the duplicate check.
        if (lastSentRef.current?.body === body) lastSentRef.current = null;
        return;
      }
      const m = r.data?.message;
      if (m?.id) {
        freshIds.current.add(m.id);
        setOwnIds((cur) => new Set(cur).add(m.id));
        setChat((cur) => reconcileTemp(cur, tempId, m).slice(-MAX_CHAT));
      } else {
        // Sent, but no row came back: keep it as a normal own message.
        setChat((cur) => cur.map((x) => (x.id === tempId ? { ...x, pending: false } : x)));
      }
      void ensureMyState();
      void refreshMe();
    })();
    return null;
  }, [goLogin, ensureMyState, refreshMe, defaultName]);
  const dismissChatError = useCallback(() => setChatError(null), []);

  // ─── Report + block ───
  const openActions = useCallback((m: ChatMessage) => {
    if (m.kind === 'system') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    Keyboard.dismiss();
    setActionMsg(m);
  }, []);

  const report = useCallback(async (m: ChatMessage, reason: ReportReason) => {
    const account = signerRef.current;
    const s = showRef.current;
    if (!s) return;
    if (!account) { setActionMsg(null); goLogin(); return; }
    setReportBusy(true);
    const r = await liveActAs<{ reported: boolean }>(account, s.id, { action: 'report', show_id: s.id, message_id: m.id, reason });
    setReportBusy(false);
    setActionMsg(null);
    setToast(r.ok ? 'Danke, wir schauen uns das an.' : liveErrorText(r.code, r.message));
    if (r.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [goLogin]);

  const setBlockedKey = useCallback((key: string, on: boolean) => {
    const s = showRef.current;
    setBlocked((cur) => {
      const nextSet = new Set(cur);
      if (on) nextSet.add(key); else nextSet.delete(key);
      if (s) void saveBlocked(s.id, [...nextSet]);
      return nextSet;
    });
  }, []);

  const toggleBlock = useCallback((m: ChatMessage) => {
    const key = authorKeyOf(m);
    const on = !blocked.has(key);
    setBlockedKey(key, on);
    setActionMsg(null);
    const name = m.display_name?.trim() || 'Jemand';
    if (on) setSnack({ text: `${name} wurde blockiert`, undoKey: key });
    else setToast(`${name} ist nicht mehr blockiert.`);
  }, [blocked, setBlockedKey]);

  const undoBlock = useCallback(() => {
    if (snack) setBlockedKey(snack.undoKey, false);
    setSnack(null);
  }, [snack, setBlockedKey]);
  const dismissSnack = useCallback(() => setSnack(null), []);

  const share = useCallback(() => {
    const s = showRef.current;
    if (!s) return;
    void Share.share({ message: `${s.title}: jetzt live in der Röbel App. ${liveShareUrl(s.slug)}` }).catch(() => undefined);
  }, []);

  const openVote = useCallback(() => {
    setVoteError(null);
    setVoteOpen(true);
    if (signerRef.current) void ensureMyState();
  }, [ensureMyState]);

  const toggleReminder = useCallback(async (item: RundownItem) => {
    const account = signerRef.current;
    const s = showRef.current;
    if (!s) return;
    if (!account) { goLogin(); return; }
    const on = !reminders.has(item.id);
    setBusyItemId(item.id);
    const r = await liveActAs<{ on: boolean }>(account, s.id, { action: 'remind', item_id: item.id, on });
    setBusyItemId(null);
    if (r.ok) {
      const nowOn = typeof r.data?.on === 'boolean' ? r.data.on : on;
      setReminders((cur) => {
        const nextSet = new Set(cur);
        if (nowOn) nextSet.add(item.id); else nextSet.delete(item.id);
        return nextSet;
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (nowOn) setToast(`Wir erinnern dich an „${item.title}“.`);
      void ensureMyState();
    } else {
      setToast(liveErrorText(r.code, r.message));
    }
  }, [reminders, goLogin, ensureMyState]);

  const vote = useCallback(async (item: RundownItem) => {
    const account = signerRef.current;
    const s = showRef.current;
    if (!s) return;
    if (!account) { goLogin(); return; }
    setBusyItemId(item.id);
    setVoteError(null);
    const r = await liveActAs<{ ok: boolean }>(account, s.id, { action: 'vote', show_id: s.id, item_id: item.id });
    setBusyItemId(null);
    if (r.ok) {
      setMyVote(item.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      void fetchResults(s.slug).then((res) => { if (res) setResults(res); });
    } else {
      setVoteError(liveErrorText(r.code, r.message));
    }
  }, [goLogin]);

  // ─── Test show tools (show.is_test): fake support + advance on-stage; refused by the API on real shows ───
  const simulateSupport = useCallback(async () => {
    const account = signerRef.current;
    const s = showRef.current;
    if (!s || testBusy) return;
    if (!account) { setToast('Zum Testen bitte anmelden'); return; }
    setTestBusy('support');
    const pick = randomTestSupport();
    const r = await liveActAs<{ message: ChatMessage }>(account, s.id, {
      action: 'test_support', show_id: s.id, amount_cents: pick.amount_cents, body: pick.body,
    });
    setTestBusy(null);
    // The card itself arrives via Realtime, exactly like a real Unterstützung.
    if (r.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    else setToast(liveErrorText(r.code, r.message));
  }, [testBusy]);

  const nextGroup = useCallback(async () => {
    const account = signerRef.current;
    const s = showRef.current;
    if (!s || testBusy) return;
    if (!account) { setToast('Zum Testen bitte anmelden'); return; }
    setTestBusy('next');
    const r = await liveActAs<{ current?: RundownItem | null }>(account, s.id, { action: 'test_next', show_id: s.id });
    setTestBusy(null);
    if (r.ok) {
      const title = r.data?.current?.title;
      setToast(title ? `Jetzt auf der Bühne: ${title}` : 'Nächste Gruppe ist dran.');
      void refetchAll();
    } else {
      setToast(liveErrorText(r.code, r.message));
    }
  }, [testBusy, refetchAll]);

  // Real Stripe Checkout everywhere, the test show included (it tests the whole flow; the sheet says so).
  // "Unterstützung simulieren" in the test tools stays the free way to see an alert.
  const pressSupport = useCallback(() => {
    setSupportError(null);
    setSupportOpen(true);
  }, []);

  const openGuestJoin = useCallback(() => {
    const s = showRef.current;
    if (!s) return;
    router.push(`/live/join/${encodeURIComponent(s.slug)}` as any);
  }, [router]);

  const submitSupport = useCallback(async (d: SupportDraft) => {
    const s = showRef.current;
    if (!s) return;
    setSupportBusy(true);
    setSupportError(null);
    const r = await startSupport({
      show_id: s.id,
      slug: s.slug,
      amount_cents: d.amountCents,
      display_name: d.showName ? d.displayName : null,
      message: d.message || null,
      show_name: d.showName,
      wallet: signerRef.current?.address ?? null,
    });
    setSupportBusy(false);
    if (!r.ok || !r.data?.url) {
      setSupportError(r.ok ? 'Die Zahlung konnte nicht gestartet werden.' : liveErrorText(r.code, r.message));
      return;
    }
    setSupportOpen(false);
    const supportId = r.data.support_id;
    await openSupportCheckout(r.data.url, s.slug);
    // No snackbar: the support simply appears in the chat (and as the gold alert) once settled.
    // Confirm regardless of how the browser closed (a cancelled return is just 'pending' and ends quietly).
    if (supportId) void confirmSupport(supportId);
  }, []);

  // ─── Render ───
  if (loading || !show) {
    return (
      <View style={[styles.root, styles.centred, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        {loading ? <ActivityIndicator color="#fff" /> : (
          <View style={styles.notFound}>
            <LiveIcon name="videocam-off-outline" size={36} color={VIDEO.textTertiary} />
            <Text style={styles.notFoundTitle}>Livestream nicht gefunden</Text>
            <Text style={styles.notFoundSub}>Vielleicht ist die Übertragung schon vorbei oder der Link ist nicht mehr gültig.</Text>
            <Pressable onPress={goBack} style={({ pressed }) => [styles.notFoundBtn, pressed && styles.pressed]}>
              <Text style={styles.notFoundBtnText}>Zurück</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  const chatOpen = show.chat_enabled !== false;
  const isTest = show.is_test === true;
  const canJoinAsGuest = guestsNative && show.guests_enabled !== false && show.status === 'live';
  const sheetOpen = programOpen || supportOpen || voteOpen || loginOpen || !!actionMsg;

  return (
    <View style={styles.root}>
      <LivePlayer
        ref={reactionsRef}
        show={show}
        viewers={viewers}
        onClose={goBack}
        onDoubleTapReact={sendDoubleTapHeart}
        hold={sheetOpen}
        videoLayer={<SupportAlertLayer ref={supportAlertRef} />}
        overlay={(api: FullscreenOverlayApi) => (
          <FullscreenOverlay
            api={api}
            messages={chat}
            isOwn={isOwn}
            isBlocked={isBlocked}
            freshIds={freshIds.current}
            newDividerId={newDividerId}
            pinned={pinned}
            supporters={supporters}
            current={current}
            next={next}
            hasProgram={rundown.length > 0}
            listExtra={listExtra}
            loggedIn={loggedIn}
            chatOpen={chatOpen}
            votingOpen={show.voting_open}
            slowModeSeconds={show.slow_mode_seconds}
            canJoinAsGuest={canJoinAsGuest}
            isTest={isTest}
            testBusy={testBusy}
            onSend={sendChat}
            error={chatError}
            onDismissError={dismissChatError}
            toast={toast}
            snack={snack?.text ?? null}
            onUndoSnack={undoBlock}
            onDismissSnack={dismissSnack}
            onReact={react}
            onSupport={pressSupport}
            onVote={openVote}
            onShare={share}
            onOpenProgram={() => setProgramOpen(true)}
            onJoinAsGuest={openGuestJoin}
            onSimulateSupport={() => { void simulateSupport(); }}
            onNextGroup={() => { void nextGroup(); }}
            onLongPressMessage={openActions}
            onLogin={goLogin}
          />
        )}
      />

      {/* Sheets: BottomDrawer modals over the stage (the room never leaves the immersive view). */}
      <ProgramSheet
        visible={programOpen}
        onClose={() => setProgramOpen(false)}
        rundown={rundown}
        reminders={reminders}
        busyItemId={busyItemId}
        onToggleReminder={(item) => { void toggleReminder(item); }}
      />
      <SupportSheet
        visible={supportOpen}
        onClose={() => setSupportOpen(false)}
        defaultName={defaultName}
        busy={supportBusy}
        error={supportError}
        onSubmit={(d) => { void submitSupport(d); }}
        testMode={isTest}
      />
      <MessageActionsSheet
        message={actionMsg}
        onClose={() => setActionMsg(null)}
        blocked={actionMsg ? isBlocked(actionMsg) : false}
        reportBusy={reportBusy}
        onReport={(m, reason) => { void report(m, reason); }}
        onToggleBlock={toggleBlock}
      />
      <VoteSheet
        visible={voteOpen}
        onClose={() => setVoteOpen(false)}
        items={voteItems}
        results={results}
        myVote={myVote}
        busyItemId={busyItemId}
        loggedIn={loggedIn}
        error={voteError}
        onVote={(item) => { void vote(item); }}
        onLogin={goLogin}
      />
      <LoginDrawer visible={loginOpen} onClose={() => setLoginOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centred: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  notFound: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  notFoundTitle: { color: VIDEO.text, fontSize: 18, fontFamily: F.heading },
  notFoundSub: { color: VIDEO.textSecondary, fontSize: 14, fontFamily: F.regular, textAlign: 'center' },
  notFoundBtn: { marginTop: 8, height: 44, paddingHorizontal: 24, borderRadius: 22, backgroundColor: VIDEO.surfaceRaised, justifyContent: 'center' },
  notFoundBtnText: { color: VIDEO.text, fontSize: 15, fontFamily: F.semiBold },
});
