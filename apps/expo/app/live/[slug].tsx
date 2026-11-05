// Live room: native livestream (expo-video, PiP, background audio) with the rundown,
// chat, floating reactions, Unterstützen (Stripe Checkout) and the Publikumsliebling Meinungsbild.
// Spec: docs/superpowers/specs/2026-11-05-live-room-design.md. Deep link: roebel://live/<slug>.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Dimensions, FlatList, Keyboard, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useGoBack } from '@/hooks/useGoBack';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import {
  CHAT_MAX_LENGTH, LIVE_REACTIONS, fetchChat, fetchResults, fetchRundown, fetchShow, joinLiveRoom, liveAct, liveActAs,
  liveErrorText, openSupportCheckout, peekLiveSession, randomTestSupport, startSupport, subscribeShowChanges,
  type ChatMessage, type LiveReaction, type LiveRoomChannel, type LiveShow, type MyLiveState, type RundownItem, type VoteResults,
} from '@/lib/live';
import LivePlayer from '@/components/live/LivePlayer';
import NowOnStageCard from '@/components/live/NowOnStageCard';
import ChatRow, { PinnedMessage } from '@/components/live/ChatRow';
import ProgramSheet from '@/components/live/ProgramSheet';
import SupportSheet, { type SupportDraft } from '@/components/live/SupportSheet';
import VoteSheet from '@/components/live/VoteSheet';
import TestPanel from '@/components/live/TestPanel';
import SupportAlertLayer, { type SupportAlertHandle } from '@/components/live/SupportAlertLayer';
import LoginDrawer from '@/components/LoginDrawer';
// Guard only (no LiveKit import): the join route itself is reached via router.push, never imported.
import { hasLiveKitNative } from '@/lib/live-guest-support';
import type { FloatingReactionsHandle } from '@/components/live/FloatingReactions';
import { F, liveStyles, useLivePalette, type LivePalette } from '@/components/live/tokens';

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

export default function LiveRoomScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
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

  // Chat input
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

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

  const reactionsRef = useRef<FloatingReactionsHandle>(null);
  const inputRef = useRef<TextInput>(null);
  const supportAlertRef = useRef<SupportAlertHandle>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  // Close the login drawer as soon as the account is there; the room continues where you were.
  useEffect(() => {
    if (loggedIn) setLoginOpen(false);
  }, [loggedIn]);

  // Composer rides on the keyboard (same approach as the DM screen): track the real keyboard top edge
  // instead of KeyboardAvoidingView, which leaves gaps on Android edge-to-edge. While it is up, only
  // video + chat + composer show, so your message lands right above the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      const screenY = e.endCoordinates?.screenY;
      const overlap = typeof screenY === 'number'
        ? Math.max(0, Dimensions.get('screen').height - screenY)
        : e.endCoordinates?.height ?? 0;
      setKeyboardHeight(overlap);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
      // Android back closes the keyboard without blurring: blur so the room returns to its normal layout.
      inputRef.current?.blur();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
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
        const history = await fetchChat(r.show.id);
        if (alive) setChat(history);
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
        setChat((cur) => upsertById(cur, m).slice(-MAX_CHAT));
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

  // ─── Personal state from a cached session (never prompts for a signature on open) ───
  const applyMyState = useCallback((s: MyLiveState | null | undefined) => {
    if (!s) return;
    setMyVote(s.vote_item_id ?? null);
    setReminders(new Set(s.reminder_item_ids ?? []));
  }, []);

  const wallet = thirdwebAccount?.address ?? null;
  useEffect(() => {
    if (!showId || !wallet) { setMyVote(null); setReminders(new Set()); return; }
    let alive = true;
    void (async () => {
      const session = await peekLiveSession(wallet, showId);
      if (!session || !alive) return;
      const r = await liveAct<MyLiveState>(session.token, { action: 'my_state', show_id: showId });
      if (alive && r.ok) applyMyState(r.data);
    })();
    return () => { alive = false; };
  }, [showId, wallet, applyMyState]);

  /** After the first session-creating action: pull vote + reminders once. */
  const myStateLoaded = useRef(false);
  const ensureMyState = useCallback(async () => {
    const account = signerRef.current;
    const s = showRef.current;
    if (myStateLoaded.current || !account || !s) return;
    myStateLoaded.current = true;
    const r = await liveActAs<MyLiveState>(account, s.id, { action: 'my_state', show_id: s.id });
    if (r.ok) applyMyState(r.data);
  }, [applyMyState]);

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
  const listData = useMemo(() => [...chat].reverse(), [chat]);
  const pinned = useMemo(() => {
    const id = show?.overlay?.featured_message_id;
    if (!id) return null;
    return chat.find((m) => m.id === id) ?? null;
  }, [chat, show?.overlay?.featured_message_id]);

  // ─── Actions ───
  // Login opens in place (the app's login drawer), so the stream keeps playing.
  const goLogin = useCallback(() => {
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

  const sendChat = useCallback(async () => {
    const account = signerRef.current;
    const s = showRef.current;
    const body = text.trim();
    if (!s || !body || sending) return;
    if (!account) { goLogin(); return; }
    setSending(true);
    setChatError(null);
    const r = await liveActAs<{ message: ChatMessage }>(account, s.id, { action: 'chat', show_id: s.id, body });
    setSending(false);
    if (r.ok) {
      const m = r.data?.message;
      if (m?.id) {
        freshIds.current.add(m.id);
        setOwnIds((cur) => new Set(cur).add(m.id));
        setChat((cur) => upsertById(cur, m).slice(-MAX_CHAT));
      }
      setText('');
      void Haptics.selectionAsync().catch(() => undefined);
      void ensureMyState();
    } else {
      setChatError(liveErrorText(r.code, r.message));
    }
  }, [text, sending, goLogin, ensureMyState]);

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
    const result = await openSupportCheckout(r.data.url, s.slug);
    if (result?.type === 'success') setToast('Danke für deine Unterstützung! Dein Gruß erscheint gleich im Chat.');
  }, []);

  // ─── Render ───
  if (loading || !show) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={{ width, height: (width * 9) / 16, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? <ActivityIndicator color="#fff" /> : null}
        </View>
        {!loading ? (
          <View style={styles.notFound}>
            <Ionicons name="videocam-off-outline" size={36} color={L.textTertiary} />
            <Text style={styles.notFoundTitle}>Livestream nicht gefunden</Text>
            <Text style={styles.notFoundSub}>Vielleicht ist die Übertragung schon vorbei oder der Link ist nicht mehr gültig.</Text>
            <Pressable onPress={goBack} style={({ pressed }) => [styles.notFoundBtn, pressed && { opacity: 0.8 }]}>
              <Text style={styles.notFoundBtnText}>Zurück</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  const chatOpen = show.chat_enabled !== false;
  const isTest = show.is_test === true;
  const canJoinAsGuest = guestsNative && show.guests_enabled !== false && show.status === 'live';
  const typing = focused || text.length > 0;
  const keyboardUp = keyboardHeight > 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LivePlayer ref={reactionsRef} show={show} width={width} topInset={insets.top} viewers={viewers} onClose={goBack} />
      <SupportAlertLayer ref={supportAlertRef} top={insets.top} height={Math.round((width * 9) / 16)} />

      <View style={styles.flex}>
        {!keyboardUp ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
            <NowOnStageCard current={current} next={next} showTitle={show.title} onOpenProgram={() => setProgramOpen(true)} />
            <View style={styles.actions}>
              <Pressable
                onPress={pressSupport}
                style={({ pressed }) => [styles.supportBtn, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Ionicons name="heart" size={16} color="#1B1B1B" />
                <Text style={styles.supportText}>Unterstützen</Text>
              </Pressable>
              {show.voting_open ? (
                <Animated.View entering={FadeIn} style={styles.flex}>
                  <Pressable
                    onPress={() => { setVoteError(null); setVoteOpen(true); if (loggedIn) void ensureMyState(); }}
                    style={({ pressed }) => [styles.voteBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="trophy-outline" size={16} color={L.onNavy} />
                    <Text style={[styles.voteText, styles.onNavyText]} numberOfLines={1}>Publikumsliebling</Text>
                  </Pressable>
                </Animated.View>
              ) : null}
              {canJoinAsGuest ? (
                <Pressable
                  onPress={openGuestJoin}
                  style={({ pressed }) => [show.voting_open ? styles.guestRound : styles.guestBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Live dazuschalten"
                >
                  <Ionicons name="videocam-outline" size={17} color={L.text} />
                  {!show.voting_open ? <Text style={styles.voteText} numberOfLines={1}>Dazuschalten</Text> : null}
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {isTest && !keyboardUp ? (
          <TestPanel
            loggedIn={loggedIn}
            busy={testBusy}
            onSimulateSupport={() => { void simulateSupport(); }}
            onNextGroup={() => { void nextGroup(); }}
            onLogin={goLogin}
          />
        ) : null}

        {pinned && !keyboardUp ? <PinnedMessage m={pinned} /> : null}

        <View style={styles.chatWrap}>
          <FlatList
            data={listData}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <ChatRow m={item} own={ownIds.has(item.id)} animate={freshIds.current.has(item.id)} />}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            initialNumToRender={20}
            maxToRenderPerBatch={12}
            windowSize={9}
            ListFooterComponent={
              <Text style={styles.chatWelcome}>
                {chatOpen ? 'Willkommen im Live-Chat. Bleib freundlich, wir moderieren.' : 'Der Chat ist gerade pausiert.'}
              </Text>
            }
          />
          {toast ? (
            <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{toast}</Text>
            </Animated.View>
          ) : null}
        </View>

        {chatError ? (
          <Pressable onPress={() => setChatError(null)} style={styles.chatError}>
            <Ionicons name="information-circle-outline" size={15} color={L.errorText} />
            <Text style={styles.chatErrorText}>{chatError}</Text>
          </Pressable>
        ) : null}

        <View style={[styles.inputBar, { paddingBottom: keyboardUp ? keyboardHeight + 8 : Math.max(insets.bottom, 10) }]}>
          {!loggedIn ? (
            <Pressable onPress={goLogin} style={({ pressed }) => [styles.loginBtn, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.loginText} numberOfLines={1}>Anmelden zum Mitschreiben</Text>
            </Pressable>
          ) : !chatOpen ? (
            <View style={[styles.inputPill, styles.inputDisabled]}>
              <Ionicons name="pause-circle-outline" size={16} color={L.textTertiary} />
              <Text style={styles.disabledText} numberOfLines={1}>Chat pausiert</Text>
            </View>
          ) : (
            <View style={styles.inputPill}>
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={(t) => { setText(t.slice(0, CHAT_MAX_LENGTH)); if (chatError) setChatError(null); }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={show.slow_mode_seconds > 0 ? `Nachricht · alle ${show.slow_mode_seconds} s` : 'Nachricht schreiben …'}
                placeholderTextColor={L.textTertiary}
                style={styles.input}
                maxLength={CHAT_MAX_LENGTH}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={() => { void sendChat(); }}
              />
              {typing ? (
                <Pressable
                  onPress={() => { void sendChat(); }}
                  disabled={!text.trim() || sending}
                  hitSlop={6}
                  style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Senden"
                >
                  {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
                </Pressable>
              ) : null}
            </View>
          )}
          {!typing ? (
            <View style={styles.reactions}>
              {LIVE_REACTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => react(e)}
                  hitSlop={4}
                  style={({ pressed }) => [styles.reactBtn, pressed && styles.reactPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Reaktion ${e}`}
                >
                  <Text style={styles.reactEmoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

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
      <LoginDrawer visible={loginOpen} onClose={() => setLoginOpen(false)} />
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
    </View>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 10 },
  supportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, paddingHorizontal: 18, borderRadius: 21,
    backgroundColor: L.gold,
  },
  supportText: { color: '#1B1B1B', fontSize: 15, fontFamily: F.bold },
  voteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderRadius: 21,
    backgroundColor: L.navy, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(122,187,242,0.4)',
  },
  voteText: { color: L.text, fontSize: 15, fontFamily: F.semiBold },
  onNavyText: { color: L.onNavy },
  guestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, paddingHorizontal: 16,
    borderRadius: 21, backgroundColor: L.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: L.borderStrong,
  },
  guestRound: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: L.borderStrong,
  },
  chatWrap: { flex: 1, marginTop: 6 },
  chatContent: { paddingVertical: 8 },
  chatWelcome: { color: L.textTertiary, fontSize: 12, fontFamily: F.medium, textAlign: 'center', paddingHorizontal: 24, paddingVertical: 12 },
  toast: {
    position: 'absolute', left: 16, right: 16, bottom: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(30,107,184,0.95)',
  },
  toastText: { color: '#fff', fontSize: 13, fontFamily: F.semiBold, textAlign: 'center' },
  chatError: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: L.errorSoft,
  },
  chatErrorText: { flex: 1, color: L.errorText, fontSize: 13, fontFamily: F.medium },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border, backgroundColor: L.bg,
  },
  inputPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 42, borderRadius: 21, paddingLeft: 16, paddingRight: 4,
    backgroundColor: L.surfaceRaised,
  },
  inputDisabled: { gap: 6, paddingRight: 16 },
  disabledText: { color: L.textTertiary, fontSize: 14, fontFamily: F.medium },
  input: { flex: 1, color: L.text, fontSize: 15, fontFamily: F.regular, paddingVertical: 10 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: L.navyBright, alignItems: 'center', justifyContent: 'center' },
  loginBtn: {
    flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
    backgroundColor: L.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: L.borderStrong,
  },
  loginText: { color: L.text, fontSize: 13, fontFamily: F.semiBold },
  reactions: { flexDirection: 'row' },
  reactBtn: { width: 33, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  reactPressed: { backgroundColor: L.surfaceRaised, transform: [{ scale: 1.2 }] },
  reactEmoji: { fontSize: 22 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  notFoundTitle: { color: L.text, fontSize: 18, fontFamily: F.heading },
  notFoundSub: { color: L.textSecondary, fontSize: 14, fontFamily: F.regular, textAlign: 'center' },
  notFoundBtn: { marginTop: 8, height: 44, paddingHorizontal: 24, borderRadius: 22, backgroundColor: L.surfaceRaised, justifyContent: 'center' },
  notFoundBtnText: { color: L.text, fontSize: 15, fontFamily: F.semiBold },
});
