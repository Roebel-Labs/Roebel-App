import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { AttachMenu } from './AttachMenu';
import { GlassCircleButton } from './GlassCircleButton';
import { MentionPopover, type MentionCandidate } from './MentionPopover';
import { chatFont, chatSize, haloShadow, useChatTokens } from './tokens';

export type ComposerImage = { uri: string; width?: number; height?: number };

export type ComposerProps = {
  /** Placeholder becomes "Frag {botName}". */
  botName: string;
  /** Called with the trimmed text and the attached images; the composer clears its text. */
  onSend: (payload: { text: string; images: ComposerImage[] }) => void;
  /** Attached images (owned by the parent — it adds them from the pickers). */
  images?: ComposerImage[];
  onRemoveImage?: (index: number) => void;
  onPickImage?: () => void;
  onTakePhoto?: () => void;
  onPickFile?: () => void;
  /** Voice: when `recording` is true the red "■ 0:10" pill + send are shown. */
  recording?: boolean;
  recordingSeconds?: number;
  onStartRecording?: () => void;
  /** Send tapped while recording → stop and transcribe/send. */
  onStopRecording?: () => void;
  /** Red pill tapped → discard the recording. Falls back to onStopRecording. */
  onCancelRecording?: () => void;
  /** Bots offered after typing "@". */
  mentionCandidates?: MentionCandidate[];
  onMention?: (candidate: MentionCandidate) => void;
  /** Controlled text (optional). */
  value?: string;
  onChangeText?: (text: string) => void;
  /** Blocks sending (e.g. while a bot turn streams). */
  sendDisabled?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
};

const MENTION_RE = /(^|\s)@([^\s@]*)$/;

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/**
 * Chat composer (refs 4, 9, 10, 11, 12, 14): "+" circle, white pill input
 * "Frag {botName}", mic in a grey circle → recording pill, black ↑ send when
 * there's text or an image, image previews with ✕, "@" mention popover.
 */
export function Composer({
  botName,
  onSend,
  images = [],
  onRemoveImage,
  onPickImage,
  onTakePhoto,
  onPickFile,
  recording = false,
  recordingSeconds = 0,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  mentionCandidates = [],
  onMention,
  value,
  onChangeText,
  sendDisabled,
  autoFocus,
  style,
}: ComposerProps) {
  const t = useChatTokens();
  const win = useWindowDimensions();
  const [inner, setInner] = useState('');
  const text = value ?? inner;
  const setText = useCallback(
    (v: string) => {
      if (value === undefined) setInner(v);
      onChangeText?.(v);
    },
    [value, onChangeText],
  );
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBottom, setMenuBottom] = useState(24);
  const rowRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);

  const mentionQuery = useMemo(() => {
    const m = MENTION_RE.exec(text);
    return m ? m[2].toLowerCase() : null;
  }, [text]);
  const mentionList = useMemo(
    () =>
      mentionQuery === null
        ? []
        : mentionCandidates.filter((c) => c.name.toLowerCase().startsWith(mentionQuery) || mentionQuery === ''),
    [mentionCandidates, mentionQuery],
  );

  const hasContent = text.trim().length > 0 || images.length > 0;
  const showSend = hasContent || recording;

  const send = () => {
    if (recording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onStopRecording?.();
      return;
    }
    if (!hasContent || sendDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSend({ text: text.trim(), images });
    setText('');
  };

  const pickMention = (c: MentionCandidate) => {
    setText(text.replace(MENTION_RE, (_all, lead: string) => `${lead}@${c.name} `));
    onMention?.(c);
  };

  const openMenu = () => {
    Haptics.selectionAsync().catch(() => {});
    rowRef.current?.measureInWindow((_x, y, _w, h) => {
      if (typeof y === 'number' && typeof h === 'number' && h > 0) {
        setMenuBottom(Math.max(8, win.height - (y + h) - 2));
      }
      setMenuOpen(true);
    });
  };

  const padH = focused ? chatSize.controlInset : 30;
  const hasImages = images.length > 0;

  return (
    <View style={[styles.wrap, style]}>
      {mentionList.length ? (
        <MentionPopover
          candidates={mentionList}
          onSelect={pickMention}
          style={{ marginLeft: padH + chatSize.control + 10, marginRight: padH, marginBottom: 7 }}
        />
      ) : null}

      <View ref={rowRef} style={[styles.row, { paddingHorizontal: padH }]}>
        <GlassCircleButton accessibilityLabel="Anhängen" onPress={openMenu}>
          <Feather name="plus" size={26} color={t.icon} />
        </GlassCircleButton>

        <View
          style={[
            styles.pill,
            hasImages ? styles.pillWithImages : null,
            { backgroundColor: t.surface },
            haloShadow(t),
          ]}
        >
          {hasImages ? (
            <View style={styles.images}>
              {images.map((img, i) => (
                <View key={`${img.uri}-${i}`} style={styles.thumbWrap}>
                  <Image source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Bild entfernen"
                    hitSlop={8}
                    onPress={() => onRemoveImage?.(i)}
                    style={styles.thumbClose}
                  >
                    <Feather name="x" size={15} color="#000000" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={`Frag ${botName}`}
              placeholderTextColor={t.placeholder}
              style={[styles.input, { color: t.textPrimary }]}
              multiline
              autoFocus={autoFocus}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              selectionColor={t.textPrimary}
              accessibilityLabel={`Nachricht an ${botName}`}
            />

            {recording ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Aufnahme verwerfen"
                onPress={() => (onCancelRecording ?? onStopRecording)?.()}
                style={[styles.recPill, { backgroundColor: t.recordingBg }]}
              >
                <View style={[styles.recSquare, { backgroundColor: t.recordingRed }]} />
                <Text style={[styles.recText, { color: t.recordingRed }]}>{formatSeconds(recordingSeconds)}</Text>
              </Pressable>
            ) : null}

            {showSend ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Senden"
                disabled={!recording && !!sendDisabled}
                onPress={send}
                style={({ pressed }) => [
                  styles.round,
                  { backgroundColor: t.primaryButton, opacity: !recording && sendDisabled ? 0.4 : pressed ? 0.8 : 1 },
                ]}
              >
                <Feather name="arrow-up" size={21} color={t.primaryButtonText} />
              </Pressable>
            ) : onStartRecording ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sprachnachricht aufnehmen"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  onStartRecording();
                }}
                style={({ pressed }) => [styles.round, styles.mic, { backgroundColor: t.micBackground, opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="mic" size={19} color={t.micIcon} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <AttachMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onPickImage={onPickImage}
        onTakePhoto={onTakePhoto}
        onPickFile={onPickFile}
        anchorBottom={menuBottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  pill: {
    flex: 1,
    minHeight: chatSize.control,
    borderRadius: chatSize.control / 2,
    justifyContent: 'center',
  },
  pillWithImages: { borderRadius: 26 },
  images: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, paddingHorizontal: 10 },
  thumbWrap: { width: 88, height: 88, borderRadius: 14, overflow: 'hidden' },
  thumb: { width: 88, height: 88 },
  thumbClose: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', minHeight: chatSize.control, paddingRight: 4 },
  input: {
    flex: 1,
    fontFamily: chatFont.regular,
    fontSize: 17,
    lineHeight: 22,
    paddingLeft: 17,
    paddingRight: 8,
    paddingTop: 11,
    paddingBottom: 11,
    maxHeight: 140,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  mic: {},
  recPill: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
    marginRight: 8,
  },
  recSquare: { width: 10, height: 10, borderRadius: 2 },
  recText: { fontFamily: chatFont.medium, fontSize: 17, fontVariant: ['tabular-nums'] },
});

export default Composer;
