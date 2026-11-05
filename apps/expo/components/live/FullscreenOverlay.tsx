// The live room's overlay on the stage (TikTok / Instagram Live / eBay Live), rendered by LivePlayer through
// its `overlay` render prop in portrait: a compact "Jetzt auf der Bühne" chip (→ Programm), the pinned
// message, the supporters strip and the scrollable chat (Neu divider, long-press report / block), the
// composer at the bottom, and a narrow action column on the right (❤️ reactions, Unterstützen,
// Publikumsliebling, Dazuschalten, Teilen, ⋯ with Programm / Bild-in-Bild / Testlauf-Werkzeuge / Verlassen).
// Always visible; while typing the column steps aside and the composer + chat ride above the keyboard.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  CHAT_MAX_LENGTH, formatClock, type ChatMessage, type LiveReaction, type RundownItem, type Supporter,
} from '@/lib/live';
import ChatRow, { PinnedMessage } from './ChatRow';
import ReactionPicker from './chat/ReactionPicker';
import SupportersStrip from './chat/SupportersStrip';
import NewDivider from './chat/NewDivider';
import UndoSnackbar from './chat/UndoSnackbar';
import type { FullscreenOverlayApi } from './player/ImmersiveFullscreen';
import { F, VIDEO } from './tokens';

export type { FullscreenOverlayApi } from './player/ImmersiveFullscreen';

type Props = {
  api: FullscreenOverlayApi;
  /** Oldest first (the room's chat state, optimistic own messages included). */
  messages: ChatMessage[];
  isOwn: (m: ChatMessage) => boolean;
  isBlocked: (m: ChatMessage) => boolean;
  /** Ids of messages that arrived while watching (they animate in). */
  freshIds: Set<string>;
  newDividerId: string | null;
  pinned: ChatMessage | null;
  supporters: Supporter[];
  current: RundownItem | null;
  next: RundownItem | null;
  hasProgram: boolean;
  /** Anything the chat cells read besides the row (re-renders the list). */
  listExtra: unknown;
  loggedIn: boolean;
  chatOpen: boolean;
  votingOpen: boolean;
  slowModeSeconds: number;
  canJoinAsGuest: boolean;
  isTest: boolean;
  testBusy: 'support' | 'next' | null;
  /** Sends a chat message optimistically; returns a German error text right away, or null once queued. */
  onSend: (body: string) => string | null;
  /** Inline German error under the chat (precheck or a failed send). */
  error: string | null;
  onDismissError: () => void;
  toast: string | null;
  snack: string | null;
  onUndoSnack: () => void;
  onDismissSnack: () => void;
  onReact: (e: LiveReaction) => void;
  onSupport: () => void;
  onVote: () => void;
  onShare: () => void;
  onOpenProgram: () => void;
  onJoinAsGuest: () => void;
  onSimulateSupport: () => void;
  onNextGroup: () => void;
  onLongPressMessage: (m: ChatMessage) => void;
  onLogin: () => void;
};

/** Right action column: narrow, small gap to the chat. */
const COLUMN_W = 52;
const COLUMN_GAP = 8;
const COMPOSER_H = 42;

type ActionProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  gold?: boolean;
};

function ActionButton({ icon, label, onPress, gold }: ActionProps) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.actionCircle, gold && styles.actionGold]}>
        <Ionicons name={icon} size={21} color={gold ? '#1B1B1B' : '#FFFFFF'} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function MenuItem({ icon, label, onPress, busy, disabled }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; busy?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.menuItem, pressed && styles.menuPressed, disabled && styles.menuDisabled]}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={icon} size={17} color="#fff" />}
      <Text style={styles.menuText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Compact "now on stage" chip at the top of the chat area; tap opens the Programm. */
function NowChip({ current, next, onPress }: { current: RundownItem | null; next: RundownItem | null; onPress: () => void }) {
  const nextClock = next ? formatClock(next.planned_at) : null;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.nowChip, pressed && styles.nowChipPressed]}
      accessibilityRole="button"
      accessibilityLabel="Programm öffnen"
    >
      <View style={[styles.nowDot, !current && styles.nowDotIdle]} />
      <Animated.View key={current?.id ?? `next-${next?.id ?? 'none'}`} entering={FadeIn.duration(220)} style={styles.nowTextWrap}>
        <Text style={styles.nowText} numberOfLines={1}>
          {current ? (
            <>
              <Text style={styles.nowTitle}>{current.title}</Text>
              {next ? <Text style={styles.nowNext}>{`  ·  Danach: ${next.title}`}</Text> : null}
            </>
          ) : next ? (
            <Text style={styles.nowNext}>{`Als Nächstes: ${next.title}${nextClock ? ` · ca. ${nextClock}` : ''}`}</Text>
          ) : (
            <Text style={styles.nowNext}>Programm</Text>
          )}
        </Text>
      </Animated.View>
      <Ionicons name="list" size={14} color="#fff" />
    </Pressable>
  );
}

export default function FullscreenOverlay(props: Props) {
  const {
    api, messages, isOwn, isBlocked, freshIds, newDividerId, pinned, supporters, current, next, hasProgram, listExtra,
    loggedIn, chatOpen, votingOpen, slowModeSeconds, canJoinAsGuest, isTest, testBusy, onSend, error, onDismissError,
    toast, snack, onUndoSnack, onDismissSnack, onReact, onSupport, onVote, onShare, onOpenProgram, onJoinAsGuest,
    onSimulateSupport, onNextGroup, onLongPressMessage, onLogin,
  } = props;
  const { poke, close, startPip, videoTop, videoHeight } = api;
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Composer rides the keyboard: track the real keyboard top edge (KeyboardAvoidingView leaves gaps on
  // Android edge-to-edge), same measurement as the DM screen.
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
    // Android back closes the keyboard without blurring: blur so the room returns to its normal layout.
    const hideSub = Keyboard.addListener(hideEvt, () => { setKeyboardHeight(0); inputRef.current?.blur(); });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const keyboardUp = keyboardHeight > 0;
  const typing = keyboardUp || focused;

  // Inline errors go away on their own.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(onDismissError, 5000);
    return () => clearTimeout(t);
  }, [error, onDismissError]);

  const listData = useMemo(() => [...messages].reverse(), [messages]);

  const closeMenuThen = useCallback((fn: () => void) => {
    setMenuOpen(false);
    Keyboard.dismiss();
    fn();
  }, []);

  // Instant send: the room adds the message optimistically, so the input clears right away.
  const send = useCallback(() => {
    const body = text.trim();
    if (!body) return;
    poke();
    const err = onSend(body);
    if (!err) {
      setText('');
      try { listRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch { /* not laid out yet */ }
    }
  }, [text, poke, onSend]);

  const react = useCallback((e: LiveReaction) => {
    poke();
    onReact(e);
  }, [poke, onReact]);

  const scrollToSupporter = useCallback((sup: Supporter) => {
    const index = listData.findIndex((m) => m.id === sup.lastMessageId);
    if (index < 0) return;
    try { listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }); } catch { /* not laid out yet */ }
  }, [listData]);

  // ─── Geometry ───
  const left = Math.max(insets.left, 8);
  const right = Math.max(insets.right, 6);
  const bottom = keyboardUp ? keyboardHeight + 8 : Math.max(insets.bottom, 10);
  const chatRight = typing ? right : right + COLUMN_W + COLUMN_GAP;
  const areaBottom = bottom + COMPOSER_H + 8;
  // The chat area starts a little into the lower part of the video and never under the top bar.
  const topLimit = keyboardUp ? insets.top + 92 : Math.max(insets.top + 96, videoTop + Math.round(videoHeight * 0.7));
  const areaHeight = Math.max(120, Math.min(Math.round(H * 0.46), H - areaBottom - topLimit));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Bottom scrim for legibility of chat + composer over bright video. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
        style={[styles.scrim, { height: areaHeight + areaBottom + 24 }]}
        pointerEvents="none"
      />

      {/* Chat area: now-on-stage chip, pinned, supporters, then the list (newest at the bottom). */}
      <View style={[styles.chatArea, { left, right: chatRight, bottom: areaBottom, height: areaHeight }]} pointerEvents="box-none">
        {!keyboardUp && hasProgram ? <NowChip current={current} next={next} onPress={() => { poke(); onOpenProgram(); }} /> : null}
        {pinned && !keyboardUp ? <PinnedMessage m={pinned} variant="overlay" /> : null}
        {!keyboardUp ? <SupportersStrip supporters={supporters} onPress={scrollToSupporter} variant="overlay" /> : null}
        <FlatList
          ref={listRef}
          style={styles.list}
          data={listData}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const row = (
              <ChatRow
                m={item}
                own={isOwn(item)}
                animate={freshIds.has(item.id)}
                blocked={isBlocked(item)}
                onLongPress={onLongPressMessage}
                variant="overlay"
              />
            );
            if (item.id !== newDividerId) return row;
            // Cells of an inverted list are flipped back, so this order shows the line above the message.
            return <View><NewDivider />{row}</View>;
          }}
          extraData={listExtra}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          initialNumToRender={16}
          maxToRenderPerBatch={12}
          windowSize={7}
          onScrollBeginDrag={poke}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          ListFooterComponent={
            <Text style={styles.welcome}>
              {chatOpen ? 'Willkommen im Live-Chat. Bleib freundlich, wir moderieren.' : 'Der Chat ist gerade pausiert.'}
            </Text>
          }
        />
      </View>

      {/* Toast / undo snackbar / inline error, just above the composer. */}
      {toast ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(180)}
          style={[styles.toast, { left, right: chatRight, bottom: areaBottom }]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      ) : null}
      <UndoSnackbar message={snack} actionLabel="Rückgängig" onAction={onUndoSnack} onDismiss={onDismissSnack} bottom={areaBottom} />
      {error ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(140)} style={[styles.errorWrap, { left, right: chatRight, bottom: areaBottom }]}>
          <Pressable onPress={onDismissError} style={styles.error} accessibilityRole="button" accessibilityLabel="Hinweis schließen">
            <Ionicons name="information-circle-outline" size={15} color="#fff" />
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Composer */}
      <View style={[styles.composer, { left, right: chatRight, bottom }]}>
        {!loggedIn ? (
          <Pressable onPress={() => closeMenuThen(onLogin)} style={styles.pill} accessibilityRole="button">
            <Ionicons name="log-in-outline" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.pillPlaceholder} numberOfLines={1}>Anmelden zum Mitschreiben</Text>
          </Pressable>
        ) : !chatOpen ? (
          <View style={styles.pill}>
            <Ionicons name="pause-circle-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.pillPlaceholder} numberOfLines={1}>Chat pausiert</Text>
          </View>
        ) : (
          <View style={styles.pill}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={(t) => { setText(t.slice(0, CHAT_MAX_LENGTH)); if (error) onDismissError(); }}
              onFocus={() => { setFocused(true); setMenuOpen(false); poke(); }}
              onBlur={() => setFocused(false)}
              placeholder={slowModeSeconds > 0 ? `Kommentieren · alle ${slowModeSeconds} s` : 'Kommentieren …'}
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={styles.input}
              maxLength={CHAT_MAX_LENGTH}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={send}
            />
            {text.trim() ? (
              <Pressable onPress={send} hitSlop={6} style={styles.send} accessibilityRole="button" accessibilityLabel="Senden">
                <Ionicons name="arrow-up" size={17} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      {/* Right action column (steps aside while typing). */}
      {!typing ? (
        <View style={[styles.column, { right, bottom }]} pointerEvents="box-none">
          <View style={styles.action}>
            <ReactionPicker onReact={react} variant="overlay" onInteract={poke} />
            <Text style={styles.actionLabel} numberOfLines={1}>Herz</Text>
          </View>
          <ActionButton icon="heart" label="Unterstützen" gold onPress={() => closeMenuThen(onSupport)} />
          {votingOpen ? <ActionButton icon="trophy-outline" label="Liebling" onPress={() => closeMenuThen(onVote)} /> : null}
          {canJoinAsGuest ? <ActionButton icon="videocam-outline" label="Dazu" onPress={() => closeMenuThen(onJoinAsGuest)} /> : null}
          <ActionButton icon="share-outline" label="Teilen" onPress={() => { poke(); onShare(); }} />
          <ActionButton icon="ellipsis-horizontal" label="Mehr" onPress={() => { poke(); setMenuOpen((o) => !o); }} />
        </View>
      ) : null}

      {menuOpen && !typing ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Menü schließen" />
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(120)}
            style={[styles.menu, { right: right + COLUMN_W + COLUMN_GAP, bottom }]}
          >
            <MenuItem icon="list" label="Programm" onPress={() => closeMenuThen(onOpenProgram)} />
            {startPip ? <MenuItem icon="albums-outline" label="Bild-in-Bild" onPress={() => closeMenuThen(startPip)} /> : null}
            {isTest ? (
              <>
                <View style={styles.menuSection}>
                  <Ionicons name="construct-outline" size={12} color={VIDEO.gold} />
                  <Text style={styles.menuSectionText}>TESTLAUF</Text>
                </View>
                {loggedIn ? (
                  <>
                    <MenuItem
                      icon="heart-outline"
                      label="Unterstützung simulieren"
                      busy={testBusy === 'support'}
                      disabled={testBusy !== null}
                      onPress={() => { poke(); onSimulateSupport(); }}
                    />
                    <MenuItem
                      icon="play-skip-forward-outline"
                      label="Nächste Gruppe"
                      busy={testBusy === 'next'}
                      disabled={testBusy !== null}
                      onPress={() => { poke(); onNextGroup(); }}
                    />
                    <Text style={styles.menuHint}>„Nächste Gruppe“ schickt die Erinnerungen an alle, die „Erinnern“ gewählt haben, auch an dich.</Text>
                  </>
                ) : (
                  <MenuItem icon="log-in-outline" label="Zum Testen anmelden" onPress={() => closeMenuThen(onLogin)} />
                )}
              </>
            ) : null}
            <View style={styles.menuDivider} />
            <MenuItem icon="chevron-down" label="Live verlassen" onPress={() => closeMenuThen(close)} />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const SHADOW = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } as const;

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chatArea: { position: 'absolute', gap: 6 },
  list: { flex: 1 },
  listContent: { paddingVertical: 4 },
  welcome: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: F.medium, paddingHorizontal: 6, paddingVertical: 8, ...SHADOW },
  nowChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%', height: 30, paddingLeft: 10, paddingRight: 10,
    borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  nowChipPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: VIDEO.red },
  nowDotIdle: { backgroundColor: 'rgba(255,255,255,0.5)' },
  nowTextWrap: { flexShrink: 1 },
  nowText: { color: '#fff', fontSize: 13 },
  nowTitle: { color: '#fff', fontFamily: F.bold, fontSize: 13 },
  nowNext: { color: 'rgba(255,255,255,0.72)', fontFamily: F.medium, fontSize: 12 },
  column: { position: 'absolute', width: COLUMN_W, alignItems: 'center', gap: 10 },
  action: { alignItems: 'center', gap: 3, width: COLUMN_W },
  actionPressed: { transform: [{ scale: 0.92 }] },
  actionCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.38)',
  },
  actionGold: { backgroundColor: VIDEO.gold },
  actionLabel: { color: '#FFFFFF', fontSize: 10, fontFamily: F.semiBold, ...SHADOW },
  menu: { position: 'absolute', borderRadius: 12, paddingVertical: 4, backgroundColor: 'rgba(24,25,27,0.96)', width: 236 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 44 },
  menuPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  menuDisabled: { opacity: 0.5 },
  menuText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontFamily: F.medium },
  menuSection: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  menuSectionText: { color: VIDEO.gold, fontSize: 11, fontFamily: F.bold, letterSpacing: 1 },
  menuHint: { color: 'rgba(255,255,255,0.55)', fontSize: 11, lineHeight: 15, fontFamily: F.medium, paddingHorizontal: 14, paddingBottom: 6 },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 4 },
  toast: { position: 'absolute', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(30,107,184,0.96)' },
  toastText: { color: '#fff', fontSize: 13, fontFamily: F.semiBold, textAlign: 'center' },
  errorWrap: { position: 'absolute' },
  error: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(229,72,77,0.94)',
  },
  errorText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontFamily: F.medium },
  composer: { position: 'absolute', height: COMPOSER_H, justifyContent: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: COMPOSER_H, borderRadius: COMPOSER_H / 2, paddingLeft: 14, paddingRight: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)',
  },
  pillPlaceholder: { flex: 1, color: 'rgba(255,255,255,0.78)', fontSize: 14, fontFamily: F.medium },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15, fontFamily: F.regular, paddingVertical: 8 },
  send: { width: 34, height: 34, borderRadius: 17, backgroundColor: VIDEO.navyBright, alignItems: 'center', justifyContent: 'center' },
});
