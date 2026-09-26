import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatActions, useChatBootstrap, useThread } from '@/context/ChatContext';
import { ChatApiError } from '@/lib/chat/api';
import { isTempId } from '@/lib/chat/reducer';
import { threadTitle } from '@/lib/chat/format';
import { showChatMenu } from '@/lib/chat/menu';
import type { BotAvatarSpec, ChatBot, ChatMessage, ChatPart } from '@/lib/chat/types';
import {
  BOT_COLORS,
  BotSheet,
  Composer,
  DayStamp,
  FileSheet,
  GlassCircleButton,
  GlassPillHeader,
  MessageActionSheet,
  MessageParts,
  NewDivider,
  ScrollToBottomButton,
  TypingIndicator,
  chatFont,
  chatSize,
  formatDayStamp,
  haloShadow,
  messagePreview,
  useChatTokens,
  type ComposerImage,
  type MentionCandidate,
} from '@/components/chat';

type FilePart = Extract<ChatPart, { type: 'file' }>;

type Item =
  | { kind: 'day'; key: string; iso: string }
  | { kind: 'new'; key: string }
  | { kind: 'msg'; key: string; message: ChatMessage; botName: string | null }
  | { kind: 'typing'; key: string; spec: BotAvatarSpec }
  | { kind: 'failed'; key: string };

const FALLBACK_AVATAR: BotAvatarSpec = {
  shape: 'circle',
  color: BOT_COLORS.black,
  eyes: 'dots',
};
const MAX_RECORDING_SECONDS = 180;

const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function copyText(message: ChatMessage): string {
  return message.parts
    .map((p) => (p.type === 'text' ? p.text : p.type === 'options' ? p.question : p.type === 'file' ? p.name : ''))
    .filter(Boolean)
    .join('\n\n');
}

/** First bot message after the user's last message = where unread replies start. */
function firstUnreadId(messages: ChatMessage[]): string | null {
  let lastUser = -1;
  messages.forEach((m, i) => {
    if (m.role === 'user') lastUser = i;
  });
  const next = messages.slice(lastUser + 1).find((m) => m.role === 'bot');
  return next ? next.id : null;
}

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      // screenY = the keyboard's absolute top edge; exact on both platforms (see app/messages).
      const screenY = e.endCoordinates?.screenY;
      const overlap =
        typeof screenY === 'number'
          ? Math.max(0, Dimensions.get('screen').height - screenY)
          : (e.endCoordinates?.height ?? 0);
      setHeight(overlap);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return height;
}

/** One Mecky chat (refs 4, 7–16). */
export default function ChatThreadScreen() {
  const params = useLocalSearchParams<{ threadId: string }>();
  const threadId = typeof params.threadId === 'string' ? params.threadId : '';
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const boot = useChatBootstrap();
  const th = useThread(threadId);
  const actions = useChatActions();
  const thread = th.thread;
  const bots: ChatBot[] = useMemo(() => thread?.bots ?? [], [thread]);

  const listRef = useRef<FlatList<Item>>(null);
  const keyboardHeight = useKeyboardHeight();
  const [overlayHeight, setOverlayHeight] = useState(80);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // ── Composer state ──
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [mentions, setMentions] = useState<MentionCandidate[]>([]);

  // ── Sheets ──
  const [actionTarget, setActionTarget] = useState<ChatMessage | null>(null);
  const [botSheetOpen, setBotSheetOpen] = useState(false);
  const [file, setFile] = useState<{
    name: string;
    content: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  // ── "NEU" divider: captured once on open (render-phase adjust), then the thread is marked read ──
  const { loaded, messages, markRead } = th;
  const [divider, setDivider] = useState<{
    captured: boolean;
    beforeId: string | null;
  }>({ captured: false, beforeId: null });
  if (!divider.captured && loaded && thread) {
    setDivider({
      captured: true,
      beforeId: thread.unread ? firstUnreadId(messages) : null,
    });
  }
  const newBeforeId = divider.beforeId;
  const setNewBeforeId = (id: string | null) => setDivider({ captured: true, beforeId: id });
  useEffect(() => {
    if (divider.captured) markRead();
  }, [divider.captured, markRead]);

  // Replies that arrive while the chat is open are read immediately.
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !th.isStreaming) markRead();
    wasStreaming.current = th.isStreaming;
  }, [th.isStreaming, markRead]);

  // Quota exhausted → paywall (once per error).
  const quotaShownFor = useRef<unknown>(null);
  useEffect(() => {
    const err = th.error;
    if (err && err.code === 'quota' && quotaShownFor.current !== err) {
      quotaShownFor.current = err;
      router.push('/chat/ultra' as Href);
    }
  }, [th.error, router]);

  // ── Voice recording ──
  // Mono 64 kbit/s AAC (.m4a): speech stays clear and 3 minutes fit well under
  // Vercel's 4.5 MB request limit.
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const finishRecording = useCallback(
    async (keep: boolean) => {
      if (!recordingRef.current) return;
      recordingRef.current = false;
      clearTimer();
      setRecording(false);
      let uri: string | null = null;
      try {
        await recorder.stop();
        uri = recorder.uri;
      } catch {
        uri = null;
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (!keep) return;
      if (!uri) {
        showSnackbar({ message: 'Aufnahme fehlgeschlagen.' });
        return;
      }
      setTranscribing(true);
      try {
        const text = (await actions.transcribe(uri)).trim();
        if (!text) {
          showSnackbar({ message: 'Ich konnte nichts verstehen.' });
          return;
        }
        const typed = draftRef.current.trim();
        const full = typed ? `${typed} ${text}` : text;
        if (isStreamingRef.current) {
          // A bot is still answering — keep the words in the composer instead of dropping them.
          setDraft(full);
          showSnackbar({ message: 'Text eingefügt – sende ihn, sobald die Antwort fertig ist.' });
          return;
        }
        sendRef.current({ text: full, images: imagesRef.current });
      } catch (err) {
        showSnackbar({
          message: err instanceof ChatApiError ? err.message : 'Transkription fehlgeschlagen.',
        });
      } finally {
        setTranscribing(false);
      }
    },
    [recorder, actions, showSnackbar]
  );

  const startRecording = async () => {
    if (recordingRef.current || transcribing) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        showSnackbar({
          message: 'Bitte erlaube den Mikrofon-Zugriff in den Einstellungen.',
        });
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
      setRecordingSeconds(0);
      clearTimer();
      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds += 1;
        setRecordingSeconds(seconds);
        // Hard cap so a forgotten recording doesn't run forever.
        if (seconds >= MAX_RECORDING_SECONDS) finishRecording(true);
      }, 1000);
    } catch {
      recordingRef.current = false;
      setRecording(false);
      showSnackbar({ message: 'Aufnahme konnte nicht gestartet werden.' });
    }
  };

  // Stop a running recording when leaving the screen.
  useEffect(
    () => () => {
      clearTimer();
      if (recordingRef.current) {
        recordingRef.current = false;
        recorder.stop().catch(() => {});
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    },
    [recorder]
  );

  // ── Images ──
  const pickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 0.8,
      });
      if (res.canceled) return;
      setImages((prev) =>
        [
          ...prev,
          ...res.assets.map((a) => ({
            uri: a.uri,
            width: a.width,
            height: a.height,
          })),
        ].slice(0, 4)
      );
    } catch {
      showSnackbar({ message: 'Bild konnte nicht geladen werden.' });
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showSnackbar({
          message: 'Bitte erlaube den Kamera-Zugriff in den Einstellungen.',
        });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      if (a) setImages((prev) => [...prev, { uri: a.uri, width: a.width, height: a.height }].slice(0, 4));
    } catch {
      showSnackbar({ message: 'Kamera konnte nicht geöffnet werden.' });
    }
  };

  // ── Mentions ──
  const mentionCandidates: MentionCandidate[] = useMemo(() => {
    const seen = new Set<string>();
    const out: MentionCandidate[] = [];
    for (const b of [...bots, ...boot.presets, ...boot.bots]) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      out.push({ id: b.id, name: b.name, avatar: b.avatar });
    }
    return out;
  }, [bots, boot.presets, boot.bots]);

  // ── Send ──
  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const onSend = ({ text, images: imgs }: { text: string; images: ComposerImage[] }) => {
    // A free-text answer supersedes an open options card (ref 13: "verworfen").
    for (let i = th.messages.length - 1; i >= 0; i--) {
      const m = th.messages[i];
      if (m.role === 'user') break;
      const opt = m.parts.find((p) => p.type === 'options');
      if (opt && opt.type === 'options' && !opt.selected && !opt.dismissed && !isTempId(m.id)) {
        th.dismissOptions(m.id).catch(() => {});
        break;
      }
    }
    const mentionBotIds = mentions.filter((c) => text.includes(`@${c.name}`)).map((c) => c.id);
    const reply = replyTarget && !isTempId(replyTarget.id) ? replyTarget.id : undefined;
    th.send({
      text,
      ...(imgs.length ? { imageUris: imgs.map((i) => i.uri) } : {}),
      ...(reply ? { replyToId: reply } : {}),
      ...(mentionBotIds.length ? { mentionBotIds } : {}),
    }).catch((err: unknown) => {
      showSnackbar({
        message: err instanceof ChatApiError ? err.message : 'Senden fehlgeschlagen.',
      });
    });
    setImages([]);
    setReplyTarget(null);
    setMentions([]);
    setDraft('');
    setTimeout(scrollToBottom, 50);
  };

  // The recorder callback outlives renders; it reads the latest composer state through refs.
  const sendRef = useRef(onSend);
  sendRef.current = onSend;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const isStreamingRef = useRef(th.isStreaming);
  isStreamingRef.current = th.isStreaming;

  // ── Message interactions ──
  const openLink = useCallback((url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    WebBrowser.openBrowserAsync(url).catch(() => {});
  }, []);

  const openFile = useCallback(
    async (part: FilePart) => {
      setFile({ name: part.name, content: null, loading: true, error: null });
      try {
        const f = await actions.fetchFile(part.fileId);
        setFile({
          name: f.name || part.name,
          content: f.content,
          loading: false,
          error: null,
        });
      } catch (err) {
        setFile({
          name: part.name,
          content: null,
          loading: false,
          error: err instanceof ChatApiError ? err.message : 'Datei konnte nicht geladen werden.',
        });
      }
    },
    [actions]
  );

  const onLongPress = useCallback((m: ChatMessage) => {
    if (isTempId(m.id)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActionTarget(m);
  }, []);

  const { answerOption, react } = th;
  const onOptionSelect = useCallback(
    (m: ChatMessage, key: string) => {
      answerOption(m.id, key).catch(() => {});
      setTimeout(scrollToBottom, 50);
    },
    [answerOption, scrollToBottom]
  );

  const soon = useCallback((message = 'Bald verfügbar') => showSnackbar({ message }), [showSnackbar]);

  // ── List items (chronological, then reversed for the inverted list) ──
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    let prevDay = '';
    let prev: ChatMessage | null = null;
    const isGroup = thread?.kind === 'group' || bots.length > 1;
    for (const m of th.messages) {
      if (m.role === 'bot' && m.parts.length === 0) continue; // streaming bubble before its first delta
      const dk = dayKey(m.createdAt);
      if (dk !== prevDay) {
        out.push({ kind: 'day', key: `day-${m.id}`, iso: m.createdAt });
        prevDay = dk;
      }
      if (m.id === newBeforeId) out.push({ kind: 'new', key: 'new' });
      const showName = isGroup && m.role === 'bot' && (!prev || prev.role !== 'bot' || prev.botId !== m.botId);
      const botName = showName ? (bots.find((b) => b.id === m.botId)?.name ?? null) : null;
      out.push({ kind: 'msg', key: m.id, message: m, botName });
      prev = m;
    }
    if (th.error && th.error.retry) out.push({ kind: 'failed', key: 'failed' });
    if (th.isStreaming) {
      const streamingMsg = th.streamingMessageId ? th.messages.find((m) => m.id === th.streamingMessageId) : null;
      if (!streamingMsg || streamingMsg.parts.length === 0) {
        const lastBot = [...th.messages].reverse().find((m) => m.role === 'bot');
        const botId = th.streamingBotId ?? lastBot?.botId ?? bots[0]?.id ?? null;
        const spec = bots.find((b) => b.id === botId)?.avatar ?? bots[0]?.avatar ?? FALLBACK_AVATAR;
        out.push({ kind: 'typing', key: 'typing', spec });
      }
    }
    return out.reverse();
  }, [th.messages, th.error, th.isStreaming, th.streamingMessageId, th.streamingBotId, thread, bots, newBeforeId]);

  const { retry, discardFailed } = th;
  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      switch (item.kind) {
        case 'day':
          return <DayStamp label={formatDayStamp(item.iso)} />;
        case 'new':
          return <NewDivider />;
        case 'typing':
          return <TypingIndicator spec={item.spec} style={styles.typing} />;
        case 'failed':
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nicht gesendet, erneut versuchen"
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                retry().catch(() => {});
              }}
              onLongPress={() =>
                showChatMenu([
                  {
                    label: 'Nachricht verwerfen',
                    destructive: true,
                    run: discardFailed,
                  },
                ])
              }
              style={styles.failedRow}
            >
              <Ionicons name="alert-circle" size={15} color={t.recordingRed} />
              <Text style={[styles.failedText, { color: t.recordingRed }]}>
                Nicht gesendet · <Text style={styles.failedAction}>Erneut versuchen</Text>
              </Text>
            </Pressable>
          );
        case 'msg':
          return (
            <View style={styles.msg}>
              {item.botName ? <Text style={[styles.botName, { color: t.textSecondary }]}>{item.botName}</Text> : null}
              <MessageParts
                message={item.message}
                onLongPress={onLongPress}
                onOptionSelect={onOptionSelect}
                onFilePress={openFile}
                onIntegrationAuthorize={() => soon('Kalender-Verbindung kommt bald')}
                onImagePress={openLink}
                onLinkPress={openLink}
                onReactionPress={(emoji) => {
                  if (!isTempId(item.message.id)) react(item.message.id, emoji).catch(() => {});
                }}
              />
            </View>
          );
      }
    },
    [t, retry, discardFailed, onLongPress, onOptionSelect, openFile, openLink, react, soon]
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setShowScrollDown(e.nativeEvent.contentOffset.y > 280);
  }, []);

  // ── Layout ──
  const bottomOffset = keyboardHeight > 0 ? keyboardHeight + 8 : Math.max(insets.bottom - 4, 12);
  const headerHeight = insets.top + 6 + chatSize.control;
  const title = thread ? threadTitle(thread) : '';
  const botName = bots.length > 1 ? 'alle' : (bots[0]?.name ?? 'Mecky');
  const transparent = `${t.background}00`;

  const actionMessage = actionTarget;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <FlatList
        ref={listRef}
        inverted
        data={items}
        keyExtractor={(i) => i.key}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onEndReached={() => {
          if (th.hasMore) th.loadOlder();
        }}
        onEndReachedThreshold={0.4}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<View style={{ height: overlayHeight + bottomOffset + 10 }} />}
        ListFooterComponent={
          <View
            style={{
              height: headerHeight + 18,
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            {th.loadingOlder ? <ActivityIndicator color={t.textTertiary} style={styles.olderLoader} /> : null}
          </View>
        }
        ListEmptyComponent={
          !th.loaded ? (
            <ActivityIndicator color={t.textTertiary} style={styles.firstLoader} />
          ) : th.error && !th.error.retry ? (
            <View style={styles.loadError}>
              <Text style={[styles.loadErrorText, { color: t.textSecondary }]}>{th.error.message}</Text>
              <Pressable accessibilityRole="button" onPress={() => th.refresh()} hitSlop={8}>
                <Text style={[styles.loadErrorAction, { color: t.link }]}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {/* Top fade + floating glass header (content scrolls underneath, ref 8). */}
      <LinearGradient
        pointerEvents="none"
        colors={[t.background, t.background, transparent]}
        locations={[0, 0.55, 1]}
        style={[styles.topFade, { height: headerHeight + 34 }]}
      />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <GlassCircleButton accessibilityLabel="Zurück" onPress={() => router.back()}>
          <Feather name="chevron-left" size={26} color={t.icon} />
        </GlassCircleButton>
        {thread ? (
          <GlassPillHeader
            avatars={bots.map((b) => b.avatar)}
            title={title}
            onPress={() => setBotSheetOpen(true)}
            style={styles.pill}
          />
        ) : (
          <View style={styles.flex} />
        )}
        <View style={styles.flex} />
        <GlassCircleButton
          accessibilityLabel="Computer"
          onPress={() => router.push(`/chat/computer/${encodeURIComponent(threadId)}` as Href)}
        >
          <Feather name="monitor" size={21} color={t.icon} />
        </GlassCircleButton>
      </View>

      {/* Bottom fade + composer. */}
      <LinearGradient
        pointerEvents="none"
        colors={[transparent, t.background]}
        locations={[0, 0.45]}
        style={[styles.bottomFade, { height: overlayHeight + bottomOffset + 24 }]}
      />
      {showScrollDown ? (
        <ScrollToBottomButton
          onPress={scrollToBottom}
          style={[styles.scrollDown, { bottom: overlayHeight + bottomOffset + 12 }]}
        />
      ) : null}
      <View
        style={[styles.bottom, { bottom: bottomOffset }]}
        onLayout={(e) => setOverlayHeight(Math.round(e.nativeEvent.layout.height))}
      >
        {transcribing ? (
          <View style={styles.transcribing}>
            <ActivityIndicator size="small" color={t.textSecondary} />
            <Text style={[styles.transcribingText, { color: t.textSecondary }]}>Wird transkribiert …</Text>
          </View>
        ) : null}
        {replyTarget ? (
          <View style={[styles.replyBar, { backgroundColor: t.surface }, haloShadow(t)]}>
            <Feather name="corner-up-left" size={16} color={t.textSecondary} />
            <Text numberOfLines={1} style={[styles.replyText, { color: t.textSecondary }]}>
              {messagePreview(replyTarget.parts)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Antwort abbrechen"
              hitSlop={8}
              onPress={() => setReplyTarget(null)}
            >
              <Feather name="x" size={18} color={t.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        <Composer
          botName={botName}
          value={draft}
          onChangeText={setDraft}
          onSend={onSend}
          images={images}
          onRemoveImage={(i) => setImages((prev) => prev.filter((_, idx) => idx !== i))}
          onPickImage={pickImage}
          onTakePhoto={takePhoto}
          onPickFile={() => soon()}
          recording={recording}
          recordingSeconds={recordingSeconds}
          onStartRecording={startRecording}
          onStopRecording={() => finishRecording(true)}
          onCancelRecording={() => finishRecording(false)}
          mentionCandidates={mentionCandidates}
          onMention={(c) => setMentions((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]))}
          sendDisabled={th.isStreaming || transcribing}
        />
      </View>

      <MessageActionSheet
        visible={!!actionMessage}
        onClose={() => setActionTarget(null)}
        onReact={(emoji) => {
          const m = actionMessage;
          if (m) react(m.id, emoji).catch(() => {});
        }}
        onMoreReactions={() => soon()}
        onReply={() => {
          const m = actionMessage;
          if (m) setReplyTarget(m);
        }}
        onStartThread={() => soon()}
        onMarkUnread={() => {
          const m = actionMessage;
          if (m) setNewBeforeId(m.id);
        }}
        onCopy={() => {
          const m = actionMessage;
          if (!m) return;
          Clipboard.setStringAsync(copyText(m))
            .then(() => showSnackbar({ message: 'Kopiert', duration: 1500 }))
            .catch(() => {});
        }}
      />
      <FileSheet
        visible={!!file}
        onClose={() => setFile(null)}
        name={file?.name ?? ''}
        content={file?.content ?? null}
        loading={file?.loading}
        error={file?.error}
      />
      {botSheetOpen ? (
        <BotSheet
          visible
          onClose={() => setBotSheetOpen(false)}
          bots={bots}
          onSave={async (id, patch) => {
            await actions.updateBot(id, patch);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  listContent: { paddingHorizontal: chatSize.screenPadH, flexGrow: 1 },
  msg: { marginBottom: 8 },
  botName: {
    fontFamily: chatFont.medium,
    fontSize: 13,
    marginLeft: 6,
    marginBottom: 4,
    marginTop: 6,
  },
  typing: { marginTop: 8, marginBottom: 6 },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: -2,
    marginBottom: 10,
  },
  failedText: { fontFamily: chatFont.regular, fontSize: 13 },
  failedAction: { fontFamily: chatFont.semiBold },
  olderLoader: { marginBottom: 8 },
  firstLoader: { marginTop: 40 },
  loadError: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
    gap: 10,
  },
  loadErrorText: {
    fontFamily: chatFont.regular,
    fontSize: 15,
    textAlign: 'center',
  },
  loadErrorAction: { fontFamily: chatFont.semiBold, fontSize: 15 },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: chatSize.controlInset,
  },
  pill: { marginLeft: 8, flexShrink: 1 },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', left: 0, right: 0 },
  scrollDown: { position: 'absolute', right: 30 },
  transcribing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  transcribingText: { fontFamily: chatFont.regular, fontSize: 14 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: chatSize.controlInset + chatSize.control + 10,
    marginBottom: 8,
    marginRight: chatSize.controlInset,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
  },
  replyText: { flex: 1, fontFamily: chatFont.regular, fontSize: 14 },
});
