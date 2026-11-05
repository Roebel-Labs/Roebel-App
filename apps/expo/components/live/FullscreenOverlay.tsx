// Immersive fullscreen layer (TikTok / Instagram Live / eBay Live style), rendered by LivePlayer through its
// `fullscreenOverlay` render prop: translucent chat bottom-left, a "Kommentieren …" pill, and an action column
// on the right (❤️, Unterstützen, Publikumsliebling, Teilen, ⋯). Everything fades with the player controls; the
// input stays reachable while focused. Sheets open after leaving fullscreen (they are room-level modals).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CHAT_MAX_LENGTH, formatSupportAmount, type ChatMessage, type LiveReaction } from '@/lib/live';
import { F, VIDEO } from './tokens';

export type FullscreenOverlayApi = { controlsVisible: boolean; poke: () => void; exit: () => void };

type Props = {
  api: FullscreenOverlayApi;
  /** Oldest first (the room's chat state). */
  messages: ChatMessage[];
  isBlocked: (m: ChatMessage) => boolean;
  ownIds: Set<string>;
  loggedIn: boolean;
  chatOpen: boolean;
  votingOpen: boolean;
  slowModeSeconds: number;
  /** Sends a chat message; resolves to a German error text, or null on success. */
  onSend: (body: string) => Promise<string | null>;
  onReact: (e: LiveReaction) => void;
  onSupport: () => void;
  onVote: () => void;
  onShare: () => void;
  onOpenProgram: () => void;
  onLogin: () => void;
};

const VISIBLE_MESSAGES = 8;
/** Sheets are room-level modals: leave fullscreen first, then open them once the player has settled. */
const AFTER_EXIT_MS = 280;

type ActionProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  gold?: boolean;
  emoji?: string;
};

function ActionButton({ icon, label, onPress, gold, emoji }: ActionProps) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.actionCircle, gold && styles.actionGold]}>
        {emoji ? <Text style={styles.actionEmoji}>{emoji}</Text> : <Ionicons name={icon} size={22} color={gold ? '#1B1B1B' : '#FFFFFF'} />}
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Floating hearts are drawn by the player (its reactions ref spawns into whichever view is showing). */
export default function FullscreenOverlay(props: Props) {
  const {
    api, messages, isBlocked, ownIds, loggedIn, chatOpen, votingOpen, slowModeSeconds,
    onSend, onReact, onSupport, onVote, onShare, onOpenProgram, onLogin,
  } = props;
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { controlsVisible, poke, exit } = api;

  // Composer rides the keyboard, same measurement as the room.
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
    const hideSub = Keyboard.addListener(hideEvt, () => { setKeyboardHeight(0); inputRef.current?.blur(); });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const keyboardUp = keyboardHeight > 0;

  // Keep the controls awake while typing.
  useEffect(() => {
    if (!focused) return;
    poke();
    const t = setInterval(poke, 2000);
    return () => clearInterval(t);
  }, [focused, poke]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const visible = controlsVisible || focused || keyboardUp || menuOpen;
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: visible ? 160 : 320 });
  }, [visible, opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const recent = useMemo(() => messages.slice(-VISIBLE_MESSAGES), [messages]);

  const afterExit = useCallback((fn: () => void) => {
    Keyboard.dismiss();
    setMenuOpen(false);
    exit();
    setTimeout(fn, AFTER_EXIT_MS);
  }, [exit]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    poke();
    setSending(true);
    const err = await onSend(body);
    setSending(false);
    if (err) { setError(err); return; }
    setText('');
  }, [text, sending, poke, onSend]);

  const react = useCallback((e: LiveReaction) => {
    poke();
    onReact(e);
  }, [poke, onReact]);

  const bottom = keyboardUp ? keyboardHeight + 8 : Math.max(insets.bottom, 12);
  const left = Math.max(insets.left, 12);
  const right = Math.max(insets.right, 10);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Bottom scrim for legibility of the chat + input over bright video. */}
      <Animated.View style={[styles.scrim, fadeStyle]} pointerEvents="none">
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View style={[styles.fill, fadeStyle]} pointerEvents={visible ? 'box-none' : 'none'}>
        {/* Chat (read-only, newest at the bottom; upper rows fade out). */}
        <View style={[styles.chat, { left, bottom: bottom + 52 }]} pointerEvents="none">
          {recent.map((m, i) => {
            const fade = Math.min(1, 0.35 + (i + VISIBLE_MESSAGES - recent.length) * 0.13);
            const name = m.display_name?.trim() || 'Jemand';
            if (m.kind === 'system') {
              return <Text key={m.id} style={[styles.chatSystem, { opacity: fade }]} numberOfLines={2}>{m.body}</Text>;
            }
            const blocked = isBlocked(m);
            return (
              <Text key={m.id} style={[styles.chatLine, { opacity: fade }]} numberOfLines={3}>
                <Text style={styles.chatName}>{ownIds.has(m.id) ? `${name} (du)` : name}</Text>
                {m.kind === 'support' ? <Text style={styles.chatChip}>{`  ${formatSupportAmount(m.amount_cents)}  `}</Text> : null}
                {'  '}
                {blocked ? <Text style={styles.chatHidden}>[Nachricht ausgeblendet]</Text> : <Text>{m.body}</Text>}
              </Text>
            );
          })}
        </View>

        {/* Right action column. */}
        <View style={[styles.column, { right, bottom: bottom + 4 }]}>
          <ActionButton icon="heart" emoji="❤️" label="Herz" onPress={() => react('❤️')} />
          <ActionButton icon="heart" label="Unterstützen" gold onPress={() => afterExit(onSupport)} />
          {votingOpen ? <ActionButton icon="trophy-outline" label="Liebling" onPress={() => afterExit(onVote)} /> : null}
          <ActionButton icon="share-outline" label="Teilen" onPress={() => { poke(); onShare(); }} />
          <ActionButton icon="ellipsis-horizontal" label="Mehr" onPress={() => { poke(); setMenuOpen((o) => !o); }} />
        </View>

        {menuOpen ? (
          <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={[styles.menu, { right: right + 60, bottom: bottom + 4 }]}>
            <Pressable onPress={() => afterExit(onOpenProgram)} style={({ pressed }) => [styles.menuItem, pressed && styles.menuPressed]}>
              <Ionicons name="list" size={17} color="#fff" />
              <Text style={styles.menuText}>Programm</Text>
            </Pressable>
            <Pressable onPress={() => { setMenuOpen(false); exit(); }} style={({ pressed }) => [styles.menuItem, pressed && styles.menuPressed]}>
              <Ionicons name="contract-outline" size={17} color="#fff" />
              <Text style={styles.menuText}>Vollbild beenden</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {error ? (
          <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(140)} style={[styles.error, { left, bottom: bottom + 50 }]} pointerEvents="none">
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      {/* Composer: outside the fading layer so a focused input never disappears. */}
      <Animated.View
        style={[styles.composer, { left, bottom }, focused || keyboardUp ? null : fadeStyle]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        {!loggedIn ? (
          <Pressable onPress={() => afterExit(onLogin)} style={styles.pill} accessibilityRole="button">
            <Text style={styles.pillPlaceholder} numberOfLines={1}>Anmelden zum Kommentieren</Text>
          </Pressable>
        ) : !chatOpen ? (
          <View style={styles.pill}>
            <Text style={styles.pillPlaceholder} numberOfLines={1}>Chat pausiert</Text>
          </View>
        ) : (
          <View style={styles.pill}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={(t) => { setText(t.slice(0, CHAT_MAX_LENGTH)); if (error) setError(null); poke(); }}
              onFocus={() => { setFocused(true); poke(); }}
              onBlur={() => setFocused(false)}
              placeholder={slowModeSeconds > 0 ? `Kommentieren · alle ${slowModeSeconds} s` : 'Kommentieren …'}
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={styles.input}
              maxLength={CHAT_MAX_LENGTH}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={() => { void send(); }}
            />
            {text.trim() ? (
              <Pressable onPress={() => { void send(); }} disabled={sending} hitSlop={6} style={styles.send} accessibilityRole="button" accessibilityLabel="Senden">
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={17} color="#fff" />}
              </Pressable>
            ) : null}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const SHADOW = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } as const;

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  chat: { position: 'absolute', width: '62%', maxWidth: 360, gap: 4 },
  chatLine: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontFamily: F.regular, ...SHADOW },
  chatName: { color: 'rgba(255,255,255,0.78)', fontFamily: F.semiBold, fontSize: 13 },
  chatChip: { color: '#1B1B1B', backgroundColor: VIDEO.gold, fontFamily: F.bold, fontSize: 12, textShadowRadius: 0 },
  chatHidden: { color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' },
  chatSystem: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontStyle: 'italic', fontFamily: F.regular, ...SHADOW },
  column: { position: 'absolute', alignItems: 'center', gap: 12 },
  action: { alignItems: 'center', gap: 3, width: 58 },
  actionPressed: { transform: [{ scale: 0.92 }] },
  actionCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.38)',
  },
  actionGold: { backgroundColor: VIDEO.gold },
  actionEmoji: { fontSize: 22 },
  actionLabel: { color: '#FFFFFF', fontSize: 11, fontFamily: F.semiBold, ...SHADOW },
  menu: { position: 'absolute', borderRadius: 12, paddingVertical: 4, backgroundColor: 'rgba(24,25,27,0.94)', minWidth: 190 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 44 },
  menuPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  menuText: { color: '#FFFFFF', fontSize: 14, fontFamily: F.medium },
  error: { position: 'absolute', maxWidth: 320, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(229,72,77,0.92)' },
  errorText: { color: '#FFFFFF', fontSize: 13, fontFamily: F.medium },
  composer: { position: 'absolute', width: '58%', maxWidth: 340 },
  pill: {
    flexDirection: 'row', alignItems: 'center', minHeight: 40, borderRadius: 20, paddingLeft: 16, paddingRight: 4,
    backgroundColor: 'rgba(0,0,0,0.42)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)',
  },
  pillPlaceholder: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: F.medium, paddingVertical: 10 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 14, fontFamily: F.regular, paddingVertical: 9 },
  send: { width: 32, height: 32, borderRadius: 16, backgroundColor: VIDEO.navyBright, alignItems: 'center', justifyContent: 'center' },
});
