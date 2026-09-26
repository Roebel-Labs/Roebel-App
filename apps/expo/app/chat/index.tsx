import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import PagerView from 'react-native-pager-view';
import Animated, { FadeIn, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import LoginDrawer from '@/components/LoginDrawer';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatActions, useChatBootstrap } from '@/context/ChatContext';
import { ChatApiError } from '@/lib/chat/api';
import { showChatMenu } from '@/lib/chat/menu';
import { threadTitle } from '@/lib/chat/format';
import type { BotAvatarSpec, ChatBot, ChatThread } from '@/lib/chat/types';
import {
  BOT_COLOR_LIST,
  BOT_EYES,
  BOT_SHAPES,
  BlackPillButton,
  BotAvatar,
  ChatListRow,
  FloatingMascots,
  GlassCircleButton,
  PagerDots,
  chatFont,
  formatListTime,
  haloShadow,
  useChatTokens,
} from '@/components/chat';

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomAvatar(): BotAvatarSpec {
  return {
    shape: pick(BOT_SHAPES),
    color: pick(BOT_COLOR_LIST),
    eyes: pick(BOT_EYES),
  };
}

function errorText(err: unknown): string {
  if (err instanceof ChatApiError) return err.message;
  return 'Es ist ein Fehler aufgetreten.';
}

function initialsOf(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/^@/, '').trim();
  if (!clean || clean.startsWith('0x')) return '?';
  const words = clean.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 2);
  return letters.toUpperCase();
}

/** Entry of the Mecky chat suite: login → Welcome → Onboarding → Chat list. */
export default function ChatIndexScreen() {
  const t = useChatTokens();
  const boot = useChatBootstrap();
  const [skippedOnboarding, setSkippedOnboarding] = useState(false);
  const [createMode, setCreateMode] = useState(false);

  let body: React.ReactNode;
  if (!boot.isConnected) body = <LoginGate />;
  else if (boot.hasSession === null) body = <CenterLoader />;
  else if (!boot.hasSession) body = <Welcome onStart={boot.startSession} error={boot.error} />;
  else if (boot.status === 'error') body = <ErrorState message={boot.error} onRetry={boot.refresh} />;
  else if (boot.status !== 'ready') body = <CenterLoader />;
  else if (createMode || (boot.threads.length === 0 && !skippedOnboarding))
    body = (
      <Onboarding
        presets={boot.presets}
        startOnCreate={createMode}
        onSkip={() => {
          setCreateMode(false);
          setSkippedOnboarding(true);
        }}
        onDone={() => setCreateMode(false)}
      />
    );
  else
    body = (
      <ChatList threads={boot.threads} presets={boot.presets} bots={boot.bots} onNewBot={() => setCreateMode(true)} />
    );

  return <View style={[styles.root, { backgroundColor: t.background }]}>{body}</View>;
}

function CenterLoader() {
  const t = useChatTokens();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={t.textSecondary} />
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
      <View style={[styles.welcomeFooter, { paddingBottom: insets.bottom + 16 }]}>{footer}</View>
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

function Onboarding({
  presets,
  startOnCreate,
  onSkip,
  onDone,
}: {
  presets: ChatBot[];
  startOnCreate: boolean;
  onSkip: () => void;
  onDone: () => void;
}) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const { createBot, createThread } = useChatActions();
  const pagerRef = useRef<PagerView>(null);
  const nameRef = useRef<TextInput>(null);
  const lastIndex = presets.length;
  const [index, setIndex] = useState(startOnCreate ? lastIndex : 0);
  const [name, setName] = useState('');
  const [avatar] = useState<BotAvatarSpec>(randomAvatar);
  const [busy, setBusy] = useState(false);
  const onCreateSlide = index === lastIndex;

  const goToCreate = () => {
    Haptics.selectionAsync().catch(() => {});
    pagerRef.current?.setPage(lastIndex);
  };

  const openThread = async (botIds: string[]) => {
    const res = await createThread(botIds);
    onDone();
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

  const createOwn = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const bot = await createBot({ name: trimmed, avatar });
      await openThread([bot.id]);
      setName('');
    } catch (err) {
      showSnackbar({ message: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const openMenu = () =>
    showChatMenu([
      { label: startOnCreate ? 'Abbrechen' : 'Überspringen', run: onSkip },
      { label: 'Mecky Ultra', run: () => router.push('/chat/ultra' as Href) },
    ]);

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
        initialPage={startOnCreate ? lastIndex : 0}
        onPageSelected={(e) => {
          const i = e.nativeEvent.position;
          setIndex(i);
          if (i === lastIndex) setTimeout(() => nameRef.current?.focus(), 250);
        }}
      >
        {presets.map((p) => (
          <View key={p.id} style={styles.slide}>
            <View style={styles.slideHero}>
              <BotAvatar spec={p.avatar} size={120} />
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
          <BotAvatar spec={avatar} size={58} />
          <TextInput
            ref={nameRef}
            value={name}
            onChangeText={setName}
            placeholder="Benenne deinen Bot"
            placeholderTextColor={t.placeholder}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={createOwn}
            selectionColor={t.link}
            style={[styles.createInput, { color: t.textPrimary }]}
            accessibilityLabel="Name deines Bots"
          />
          <Text style={[styles.createHint, { color: t.textSecondary }]}>
            Starte bei null und sag ihm, was er tun soll
          </Text>
        </View>
      </PagerView>

      <View style={[styles.onboardingFooter, { paddingBottom: onCreateSlide ? 16 : insets.bottom + 8 }]}>
        <PagerDots count={presets.length + 1} index={index} style={styles.dots} />
        {onCreateSlide ? (
          <BlackPillButton
            label="Erstellen"
            onPress={createOwn}
            loading={busy}
            variant={name.trim() ? 'primary' : 'disabled'}
          />
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

function ChatList({
  threads,
  presets,
  bots,
  onNewBot,
}: {
  threads: ChatThread[];
  presets: ChatBot[];
  bots: ChatBot[];
  onNewBot: () => void;
}) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const initials = initialsOf(user?.display_name || user?.username);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...threads].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
    if (!q) return sorted;
    return sorted.filter((th) =>
      [threadTitle(th), th.topic ?? '', th.lastMessagePreview ?? '', ...th.bots.map((b) => b.name)].some((s) =>
        s.toLowerCase().includes(q)
      )
    );
  }, [threads, query]);

  const toggleSearch = () => {
    setSearchOpen((o) => {
      if (o) setQuery('');
      return !o;
    });
  };

  return (
    <View style={styles.flex}>
      <View style={[styles.listHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück zum Profil"
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            router.back();
          }}
          style={({ pressed }) => [
            styles.initials,
            {
              backgroundColor: t.initialsBg,
              borderColor: t.surface,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
            haloShadow(t),
          ]}
        >
          <Text style={[styles.initialsText, { color: t.initialsText }]}>{initials}</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <GlassCircleButton accessibilityLabel={searchOpen ? 'Suche schließen' : 'Suchen'} onPress={toggleSearch}>
            <Feather name={searchOpen ? 'x' : 'search'} size={22} color={t.icon} />
          </GlassCircleButton>
          <GlassCircleButton accessibilityLabel="Neuer Chat" onPress={() => setSheetOpen(true)}>
            <Feather name="plus" size={26} color={t.icon} />
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
        keyExtractor={(th) => th.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 24,
        }}
        renderItem={({ item }) => (
          <Animated.View entering={FadeIn.duration(180)}>
            <ChatListRow
              title={threadTitle(item)}
              topic={item.topic}
              time={item.lastMessageAt ? formatListTime(item.lastMessageAt) : ''}
              preview={item.lastMessagePreview}
              avatars={item.bots.map((b) => b.avatar)}
              online={item.hasActiveRoutine}
              unread={item.unread}
              onPress={() => router.push(`/chat/${item.id}` as Href)}
            />
          </Animated.View>
        )}
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
          onNewBot={() => {
            setSheetOpen(false);
            onNewBot();
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
  onNewBot,
}: {
  visible: boolean;
  onClose: () => void;
  bots: ChatBot[];
  onNewBot: () => void;
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
          onPress={onNewBot}
          style={({ pressed }) => [styles.pickRow, pressed ? { opacity: 0.6 } : null]}
        >
          <View style={[styles.newBotCircle, { backgroundColor: t.chipBackground }]}>
            <Feather name="plus" size={22} color={t.icon} />
          </View>
          <View style={styles.pickBody}>
            <Text style={[styles.pickName, { color: t.textPrimary }]}>Neuer Bot</Text>
            <Text style={[styles.pickDesc, { color: t.textSecondary }]} numberOfLines={1}>
              Starte bei null und sag ihm, was er tun soll
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
              <BotAvatar spec={b.avatar} size={42} />
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
  createInput: {
    fontFamily: chatFont.medium,
    fontSize: 24,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginTop: 34,
    paddingVertical: 6,
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
  initials: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: { fontFamily: chatFont.semiBold, fontSize: 16 },
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
