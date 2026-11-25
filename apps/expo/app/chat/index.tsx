import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import PagerView from 'react-native-pager-view';
import Animated, { FadeIn, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import LoginDrawer from '@/components/LoginDrawer';
import { useChatHomeChrome } from '@/components/chat/ChatHomeChrome';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatActions, useChatBootstrap, useInspiration } from '@/context/ChatContext';
import { useMessaging } from '@/context/MessagingContext';
import ConversationListItem from '@/components/messages/ConversationListItem';
import { safeDisplayName, type ConversationWithLastMessage } from '@/lib/supabase-messages';
import { ChatApiError } from '@/lib/chat/api';
import { threadTitle } from '@/lib/chat/format';
import type { BotAvatarSpec, ChatBot, ChatThread } from '@/lib/chat/types';
import { AGENT_CHARACTERS } from '@/lib/chat/characters';
import { MECKY_AVATAR_SPEC } from '@/lib/chat/avatar-picture';
import {
  BlackPillButton,
  BotAvatar,
  InspirationEntryRow,
  ChatListRow,
  ChatListSkeleton,
  FloatingMascots,
  GlassCircleButton,
  PagerDots,
  chatFont,
  useChatSheets,
  formatListTime,
  useChatTokens,
} from '@/components/chat';

/** Pictures teased on the onboarding's "build your own" slide: Mecky plus three characters. */
const BUILD_TEASER: BotAvatarSpec[] = [
  MECKY_AVATAR_SPEC,
  ...AGENT_CHARACTERS.slice(0, 3).map((c): BotAvatarSpec => ({ shape: 'circle', eyes: 'dots', color: c.color, character: c.id })),
];

function errorText(err: unknown): string {
  if (err instanceof ChatApiError) return err.message;
  return 'Es ist ein Fehler aufgetreten.';
}

/** Entry of the Mecky chat suite: login → Welcome → Onboarding → Chat list. */
export default function ChatIndexScreen() {
  const t = useChatTokens();
  const boot = useChatBootstrap();
  const [skippedOnboarding, setSkippedOnboarding] = useState(false);
  // The Chat tab (no back button) lists the person's direct chats too; they must not hide behind onboarding.
  const inTab = !useChatHomeChrome().showBack;
  const hasDirectChats = useMessaging().conversations.length > 0;

  let body: React.ReactNode;
  if (!boot.isConnected) body = <LoginGate />;
  else if (boot.hasSession === null) body = <CenterLoader />;
  else if (!boot.hasSession) body = <Welcome onStart={boot.startSession} error={boot.error} />;
  else if (boot.status === 'error') body = <ErrorState message={boot.error} onRetry={boot.refresh} />;
  else if (boot.status !== 'ready') body = <CenterLoader />;
  else if (boot.threads.length === 0 && !skippedOnboarding && !(inTab && hasDirectChats))
    body = <Onboarding presets={boot.presets} onSkip={() => setSkippedOnboarding(true)} />;
  else body = <ChatList threads={boot.threads} presets={boot.presets} bots={boot.bots} />;

  return <View style={[styles.root, { backgroundColor: t.background }]}>{body}</View>;
}

/** Bootstrap placeholder: mirrors the chat list so the real list fades in in place. */
function CenterLoader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { paddingTop: insets.top + 72 }]}>
      <ChatListSkeleton />
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassCircleButton accessibilityLabel="Zurück" onPress={() => router.back()}>
          <Feather name="chevron-left" size={26} color={t.icon} />
        </GlassCircleButton>
      </View>
      <View style={styles.center}>
        <Text style={[styles.errorTitle, { color: t.textPrimary }]}>Mecky ist gerade nicht erreichbar</Text>
        {message ? <Text style={[styles.errorText, { color: t.textSecondary }]}>{message}</Text> : null}
        <BlackPillButton label="Erneut versuchen" onPress={onRetry} style={styles.errorBtn} />
      </View>
    </View>
  );
}

// ─── Login gate + Welcome (ref 1) ────────────────────────────────────────────

function WelcomeFrame({ children, footer }: { children?: React.ReactNode; footer: React.ReactNode }) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chrome = useChatHomeChrome();
  return (
    <View style={styles.flex}>
      <FloatingMascots />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassCircleButton accessibilityLabel="Zurück" onPress={() => router.back()}>
          <Feather name="chevron-left" size={26} color={t.icon} />
        </GlassCircleButton>
      </View>
      <View style={styles.welcomeCopy} pointerEvents="none">
        <Text style={[styles.welcomeTitle, { color: t.textPrimary }]}>Mecky</Text>
        <Text style={[styles.welcomeSubtitle, { color: t.textSecondary }]}>
          Dein Team aus Agenten, die immer für dich da sind.
        </Text>
        {children}
      </View>
      <View style={[styles.welcomeFooter, { paddingBottom: insets.bottom + 16 + chrome.bottomExtra }]}>{footer}</View>
    </View>
  );
}

function LoginGate() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <WelcomeFrame footer={<BlackPillButton label="Anmelden" onPress={() => setOpen(true)} />} />
      <LoginDrawer visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Welcome({ onStart, error }: { onStart: () => Promise<boolean>; error: string | null }) {
  const t = useChatTokens();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    setLoading(true);
    setFailed(false);
    const ok = await onStart();
    setLoading(false);
    if (!ok) setFailed(true);
  };
  return (
    <WelcomeFrame footer={<BlackPillButton label="Los geht's" onPress={start} loading={loading} />}>
      {failed ? (
        <Text style={[styles.welcomeError, { color: t.recordingRed }]}>
          {error ?? 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'}
        </Text>
      ) : null}
    </WelcomeFrame>
  );
}

// ─── Onboarding pager (refs 2, 3) ────────────────────────────────────────────

function Onboarding({ presets, onSkip }: { presets: ChatBot[]; onSkip: () => void }) {
  const t = useChatTokens();
  const router = useRouter();
  const { openMenu: openSheetMenu } = useChatSheets();
  const insets = useSafeAreaInsets();
  const chrome = useChatHomeChrome();
  const { showSnackbar } = useSnackbar();
  const { createThread } = useChatActions();
  const pagerRef = useRef<PagerView>(null);
  const lastIndex = presets.length;
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const onCreateSlide = index === lastIndex;

  const goToCreate = () => {
    Haptics.selectionAsync().catch(() => {});
    pagerRef.current?.setPage(lastIndex);
  };

  const openThread = async (botIds: string[]) => {
    const res = await createThread(botIds);
    router.push(`/chat/${res.thread.id}` as Href);
  };

  const startPreset = async () => {
    const preset = presets[index];
    if (!preset || busy) return;
    setBusy(true);
    try {
      await openThread([preset.id]);
    } catch (err) {
      showSnackbar({ message: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  // Own agents are built on the agent screen: own picture or a character, name, task and how it works.
  const createOwn = () => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/chat/agents/new' as Href);
  };

  const openMenu = (e: GestureResponderEvent) =>
    openSheetMenu({
      anchor: e,
      items: [
        [{ label: 'Überspringen', icon: 'play-skip-forward-outline', onPress: onSkip }],
        [{ label: 'Mecky Ultra', icon: 'diamond-outline', onPress: () => router.push('/chat/ultra' as Href) }],
      ],
    });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, styles.topBarEnd, { paddingTop: insets.top + 8 }]}>
        <GlassCircleButton accessibilityLabel="Mehr" onPress={openMenu}>
          <Feather name="more-horizontal" size={24} color={t.icon} />
        </GlassCircleButton>
      </View>
      <Text style={[styles.onboardingTitle, { color: t.textPrimary }]}>Lerne deinen ersten Bot kennen</Text>

      <PagerView
        ref={pagerRef}
        style={styles.flex}
        initialPage={0}
        onPageSelected={(e) => setIndex(e.nativeEvent.position)}
      >
        {presets.map((p) => (
          <View key={p.id} style={styles.slide}>
            <View style={styles.slideHero}>
              <BotAvatar spec={p.avatar} name={p.name} size={120} />
            </View>
            <View style={styles.slideCopy}>
              <Text style={[styles.slideName, { color: t.textPrimary }]}>{p.name}</Text>
              <Text style={[styles.slideDescription, { color: t.textSecondary }]} numberOfLines={3}>
                {p.description}
              </Text>
            </View>
          </View>
        ))}
        <View key="create" style={[styles.slide, styles.createSlide]}>
          <View style={styles.teaserRow}>
            {BUILD_TEASER.map((spec, i) => (
              <BotAvatar
                key={i}
                spec={spec}
                size={58}
                style={[styles.teaserItem, i > 0 ? styles.teaserOverlap : null, { borderColor: t.background }]}
              />
            ))}
          </View>
          <Text style={[styles.createTitle, { color: t.textPrimary }]}>Bau dir deinen eigenen Agenten</Text>
          <Text style={[styles.createHint, { color: t.textSecondary }]}>
            Mit eigenem Bild oder einer Figur, einem Namen und einer Aufgabe
          </Text>
        </View>
      </PagerView>

      <View style={[styles.onboardingFooter, { paddingBottom: (onCreateSlide ? 16 : insets.bottom + 8) + chrome.bottomExtra }]}>
        <PagerDots count={presets.length + 1} index={index} style={styles.dots} />
        {onCreateSlide ? (
          <BlackPillButton label="Agent erstellen" onPress={createOwn} />
        ) : (
          <>
            <BlackPillButton label="Chat starten" onPress={startPreset} loading={busy} />
            <Pressable accessibilityRole="button" onPress={goToCreate} hitSlop={8} style={styles.linkBtn}>
              <Text style={[styles.link, { color: t.textSecondary }]}>Eigenen erstellen</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Chat list (refs 5, 6) ───────────────────────────────────────────────────

type ListEntry =
  | { kind: 'agent'; key: string; at: string; thread: ChatThread }
  | { kind: 'direct'; key: string; at: string; convo: ConversationWithLastMessage };
const EMPTY_DIRECT: ConversationWithLastMessage[] = [];

function ChatList({
  threads,
  presets,
  bots,
}: {
  threads: ChatThread[];
  presets: ChatBot[];
  bots: ChatBot[];
}) {
  const t = useChatTokens();
  const router = useRouter();
  const { openMenu: openSheetMenu } = useChatSheets();
  const insets = useSafeAreaInsets();
  const chrome = useChatHomeChrome();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Chat tab: direct chats (people/orgs) sit in the same list as the agent threads, newest first.
  const { conversations } = useMessaging();
  const directChats = chrome.showBack ? EMPTY_DIRECT : conversations;
  const filtered = useMemo((): ListEntry[] => {
    const q = query.trim().toLowerCase();
    const entries: ListEntry[] = [
      ...threads
        .filter(
          (th) =>
            !q ||
            [threadTitle(th), th.topic ?? '', th.lastMessagePreview ?? '', ...th.bots.map((b) => b.name)].some((s) =>
              s.toLowerCase().includes(q)
            )
        )
        .map((th): ListEntry => ({ kind: 'agent', key: th.id, at: th.lastMessageAt ?? '', thread: th })),
      ...directChats
        .filter(
          (c) =>
            !q ||
            [safeDisplayName(c.peerName), c.peerUsername ?? '', c.lastMessage?.content ?? ''].some((s) =>
              String(s).toLowerCase().includes(q)
            )
        )
        .map((c): ListEntry => ({ kind: 'direct', key: `dm-${c.id}`, at: c.lastMessage?.created_at ?? c.created_at, convo: c })),
    ];
    return entries.sort((a, b) => (Date.parse(a.at) || 0) < (Date.parse(b.at) || 0) ? 1 : -1);
  }, [threads, directChats, query]);

  const toggleSearch = () => {
    setSearchOpen((o) => {
      if (o) setQuery('');
      return !o;
    });
  };

  return (
    <View style={styles.flex}>
      <View style={[styles.listHeader, { paddingTop: insets.top + 8 }]}>
        {chrome.showBack ? (
          <GlassCircleButton
            accessibilityLabel="Zurück"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile' as Href))}
          >
            <Feather name="chevron-left" size={26} color={t.icon} />
          </GlassCircleButton>
        ) : (
          <Text style={[styles.tabTitle, { color: t.textPrimary }]}>Chat</Text>
        )}
        <View style={styles.headerRight}>
          <GlassCircleButton accessibilityLabel={searchOpen ? 'Suche schließen' : 'Suchen'} onPress={toggleSearch}>
            <Feather name={searchOpen ? 'x' : 'search'} size={22} color={t.icon} />
          </GlassCircleButton>
          <GlassCircleButton accessibilityLabel="Neuer Chat" onPress={() => setSheetOpen(true)}>
            <Feather name="plus" size={26} color={t.icon} />
          </GlassCircleButton>
          <GlassCircleButton
            accessibilityLabel="Mehr"
            onPress={(e) =>
              openSheetMenu({
                anchor: e,
                items: [
                  [
                    { label: 'Meine Agenten', icon: 'people-outline', onPress: () => router.push('/chat/agents' as Href) },
                    { label: 'Dein Tag', icon: 'sunny-outline', onPress: () => router.push('/chat/today' as Href) },
                    { label: 'Bibliothek', icon: 'folder-open-outline', onPress: () => router.push('/chat/library' as Href) },
                  ],
                  [
                    { label: 'Gedächtnis', icon: 'bulb-outline', onPress: () => router.push('/chat/settings/memory' as Href) },
                    { label: 'Aktivität', icon: 'pulse-outline', onPress: () => router.push('/chat/settings/activity' as Href) },
                    { label: 'Verbindungen', icon: 'link-outline', onPress: () => router.push('/chat/settings/connections' as Href) },
                  ],
                  [{ label: 'Mecky Ultra', icon: 'diamond-outline', onPress: () => router.push('/chat/ultra' as Href) }],
                ],
              })
            }
          >
            <Feather name="more-horizontal" size={24} color={t.icon} />
          </GlassCircleButton>
        </View>
      </View>

      {searchOpen ? (
        <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(150)} style={styles.searchWrap}>
          <View style={[styles.searchField, { backgroundColor: t.chipBackground }]}>
            <Feather name="search" size={17} color={t.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Chats durchsuchen"
              placeholderTextColor={t.placeholder}
              style={[styles.searchInput, { color: t.textPrimary }]}
              returnKeyType="search"
              accessibilityLabel="Chats durchsuchen"
            />
          </View>
        </Animated.View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(e) => e.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 24 + chrome.bottomExtra,
        }}
        ListHeaderComponent={
          query.trim() ? null : (
            <>
              <ChatShortcuts />
              <ForYouEntry />
            </>
          )
        }
        renderItem={({ item: entry }) => {
          if (entry.kind === 'direct') {
            return (
              <Animated.View entering={FadeIn.duration(180)}>
                <ConversationListItem
                  conversation={entry.convo}
                  onPress={() => router.push(`/messages/${entry.convo.id}` as Href)}
                />
              </Animated.View>
            );
          }
          const item = entry.thread;
          return (
          <Animated.View entering={FadeIn.duration(180)}>
            <ChatListRow
              title={threadTitle(item)}
              topic={item.topic}
              time={item.lastMessageAt ? formatListTime(item.lastMessageAt) : ''}
              preview={item.lastMessagePreview}
              avatars={item.bots.map((b) => b.avatar)}
              names={item.bots.map((b) => b.name)}
              online={item.hasActiveRoutine}
              unread={item.unread}
              onPress={() => router.push(`/chat/${item.id}` as Href)}
            />
          </Animated.View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              {query.trim() ? 'Keine Treffer' : 'Noch keine Chats. Tippe auf +, um zu starten.'}
            </Text>
          </View>
        }
      />

      {sheetOpen ? (
        <NewChatSheet
          visible
          onClose={() => setSheetOpen(false)}
          bots={[...presets, ...bots]}
          onNewAgent={() => {
            setSheetOpen(false);
            router.push('/chat/agents/new' as Href);
          }}
        />
      ) : null}
    </View>
  );
}

function NewChatSheet({
  visible,
  onClose,
  bots,
  onNewAgent,
}: {
  visible: boolean;
  onClose: () => void;
  bots: ChatBot[];
  /** Opens the agent builder (own picture or an illustrated character). */
  onNewAgent: () => void;
}) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { showSnackbar } = useSnackbar();
  const { createThread } = useChatActions();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const snapPoints = useMemo(
    () => [Math.min(win.height * 0.8, 180 + bots.length * 64 + insets.bottom)],
    [win.height, bots.length, insets.bottom]
  );

  const backdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.25} pressBehavior="close" />
    ),
    []
  );

  if (!visible) return null;

  const toggle = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const start = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const res = await createThread(selected);
      onClose();
      router.push(`/chat/${res.thread.id}` as Href);
    } catch (err) {
      showSnackbar({ message: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={onClose}
      detached
      bottomInset={Math.max(8, insets.bottom - 18)}
      style={styles.sheet}
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: t.sheetBackground, borderRadius: 40 }}
      handleIndicatorStyle={[styles.handle, { backgroundColor: t.textTertiary }]}
    >
      <Text style={[styles.sheetTitle, { color: t.textPrimary }]}>Neuer Chat</Text>
      <BottomSheetScrollView contentContainerStyle={styles.sheetList}>
        <Pressable
          accessibilityRole="button"
          onPress={onNewAgent}
          style={({ pressed }) => [styles.pickRow, pressed ? { opacity: 0.6 } : null]}
        >
          <View style={[styles.newBotCircle, { backgroundColor: t.chipBackground }]}>
            <Feather name="plus" size={22} color={t.icon} />
          </View>
          <View style={styles.pickBody}>
            <Text style={[styles.pickName, { color: t.textPrimary }]}>Neuer Agent</Text>
            <Text style={[styles.pickDesc, { color: t.textSecondary }]} numberOfLines={1}>
              Eigenes Bild oder eine Figur, Name und Aufgabe
            </Text>
          </View>
        </Pressable>
        {bots.map((b) => {
          const on = selected.includes(b.id);
          return (
            <Pressable
              key={b.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(b.id)}
              style={({ pressed }) => [styles.pickRow, pressed ? { opacity: 0.6 } : null]}
            >
              <BotAvatar spec={b.avatar} name={b.name} size={42} />
              <View style={styles.pickBody}>
                <Text style={[styles.pickName, { color: t.textPrimary }]}>{b.name}</Text>
                {b.description ? (
                  <Text style={[styles.pickDesc, { color: t.textSecondary }]} numberOfLines={1}>
                    {b.description}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.check,
                  on
                    ? {
                        backgroundColor: t.primaryButton,
                        borderColor: t.primaryButton,
                      }
                    : { borderColor: t.textTertiary },
                ]}
              >
                {on ? <Ionicons name="checkmark" size={16} color={t.primaryButtonText} /> : null}
              </View>
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
      <View style={[styles.sheetFooter, { paddingBottom: 18 }]}>
        <BlackPillButton
          label={selected.length > 1 ? 'Gruppenchat starten' : 'Chat starten'}
          onPress={start}
          loading={busy}
          variant={selected.length ? 'primary' : 'disabled'}
        />
      </View>
    </BottomSheet>
  );
}

const SHORTCUTS: { label: string; icon: keyof typeof Feather.glyphMap; href: string }[] = [
  { label: 'Agenten', icon: 'users', href: '/chat/agents' },
  { label: 'Dein Tag', icon: 'sun', href: '/chat/today' },
  { label: 'Bibliothek', icon: 'folder', href: '/chat/library' },
];

/** Entry points above the threads: the agent roster, the daily briefing and the library. */
function ChatShortcuts() {
  const t = useChatTokens();
  const router = useRouter();
  return (
    <View style={styles.shortcuts}>
      {SHORTCUTS.map((s) => (
        <Pressable
          key={s.href}
          accessibilityRole="button"
          accessibilityLabel={s.label}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            router.push(s.href as Href);
          }}
          style={({ pressed }) => [styles.shortcut, { backgroundColor: t.chipBackground, opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name={s.icon} size={16} color={t.textPrimary} />
          <Text numberOfLines={1} style={[styles.shortcutText, { color: t.textPrimary }]}>
            {s.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** "Für dich · N Ideen" above the threads; hidden until the first feed arrives. */
function ForYouEntry() {
  const router = useRouter();
  const { status, tasks } = useInspiration('me');
  const avatars = useMemo(() => {
    const seen = new Set<string>();
    const out: BotAvatarSpec[] = [];
    for (const task of tasks) {
      if (!task.bot || seen.has(task.bot.id)) continue;
      seen.add(task.bot.id);
      out.push(task.bot.avatar);
    }
    return out;
  }, [tasks]);
  if (status !== 'ready' || !tasks.length) return null;
  return (
    <InspirationEntryRow
      count={tasks.length}
      avatars={avatars}
      preview={tasks[0]?.title}
      onPress={() => router.push('/chat/inspiration' as Href)}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  topBar: { flexDirection: 'row', paddingHorizontal: 18, zIndex: 2 },
  topBarEnd: { justifyContent: 'flex-end' },
  errorTitle: {
    fontFamily: chatFont.semiBold,
    fontSize: 20,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: chatFont.regular,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  errorBtn: { marginTop: 24, alignSelf: 'stretch' },

  welcomeCopy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  welcomeTitle: {
    fontFamily: chatFont.semiBold,
    fontSize: 44,
    letterSpacing: -1,
  },
  welcomeSubtitle: {
    fontFamily: chatFont.regular,
    fontSize: 19,
    lineHeight: 25,
    textAlign: 'center',
    marginTop: 12,
  },
  welcomeError: {
    fontFamily: chatFont.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  welcomeFooter: { paddingHorizontal: 22 },

  onboardingTitle: {
    fontFamily: chatFont.semiBold,
    fontSize: 28,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 26,
    paddingHorizontal: 24,
  },
  slide: { flex: 1, alignItems: 'center', paddingHorizontal: 30 },
  slideHero: { flex: 1.25, alignItems: 'center', justifyContent: 'center' },
  slideCopy: { flex: 1, alignItems: 'center' },
  slideName: {
    fontFamily: chatFont.semiBold,
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  slideDescription: {
    fontFamily: chatFont.regular,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 8,
  },
  createSlide: { justifyContent: 'center' },
  teaserRow: { flexDirection: 'row', alignItems: 'center' },
  teaserItem: { borderWidth: 3, borderRadius: 32, width: 64, height: 64, padding: 0 },
  teaserOverlap: { marginLeft: -14 },
  createTitle: {
    fontFamily: chatFont.semiBold,
    fontSize: 24,
    textAlign: 'center',
    marginTop: 28,
  },
  createHint: {
    fontFamily: chatFont.regular,
    fontSize: 17,
    textAlign: 'center',
    marginTop: 6,
  },
  onboardingFooter: { paddingHorizontal: 22 },
  dots: { marginBottom: 18 },
  linkBtn: { alignSelf: 'center', paddingVertical: 14 },
  link: { fontFamily: chatFont.medium, fontSize: 18 },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 6,
    zIndex: 2,
  },
  headerRight: { flexDirection: 'row', gap: 10 },
  tabTitle: { fontFamily: chatFont.bold, fontSize: 30 },
  searchWrap: { paddingHorizontal: 18, paddingTop: 8 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: chatFont.regular,
    fontSize: 17,
    paddingVertical: 0,
  },
  shortcuts: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10 },
  shortcut: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 10,
  },
  shortcutText: { fontFamily: chatFont.medium, fontSize: 15, letterSpacing: -0.1, flexShrink: 1 },
  empty: { paddingTop: 80, paddingHorizontal: 40, alignItems: 'center' },
  emptyText: {
    fontFamily: chatFont.regular,
    fontSize: 16,
    textAlign: 'center',
  },

  sheet: { marginHorizontal: 8 },
  handle: { width: 36, height: 5 },
  sheetTitle: {
    fontFamily: chatFont.semiBold,
    fontSize: 20,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  sheetList: { paddingHorizontal: 12, paddingBottom: 8 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 14,
  },
  newBotCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBody: { flex: 1, minWidth: 0 },
  pickName: { fontFamily: chatFont.medium, fontSize: 17 },
  pickDesc: { fontFamily: chatFont.regular, fontSize: 14, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetFooter: { paddingHorizontal: 18, paddingTop: 8 },
});
