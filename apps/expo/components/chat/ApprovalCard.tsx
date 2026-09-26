import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import type { ApprovalPreview, ChatPart } from '@/lib/chat/types';
import { chatFont, chatSize, chatType, useChatTokens, type ChatTokens } from './tokens';

export type ApprovalPart = Extract<ChatPart, { type: 'approval' }>;

export type ApprovalCardProps = {
  part: ApprovalPart;
  /** "Freigeben" / "Mit Wallet bestätigen". Resolves when the continuation stream ended. */
  onApprove?: (opts: { alwaysAllow: boolean }) => Promise<unknown> | void;
  /** "Ablehnen". */
  onReject?: () => Promise<unknown> | void;
  /** True while another turn streams in this thread (buttons inactive). */
  disabled?: boolean;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const ADDRESS = /0x[a-fA-F0-9]{40}/g;

/** Wallet addresses are never shown: any 0x… address in model-provided text is masked. */
function clean(value: string): string {
  return value.replace(ADDRESS, 'Wallet');
}

const KIND_ICON: Record<ApprovalPreview['kind'], React.ComponentProps<typeof Feather>['name']> = {
  text: 'file-text',
  post: 'edit-3',
  event: 'calendar',
  listing: 'tag',
  message: 'message-circle',
  email: 'mail',
  transfer: 'send',
  generic: 'shield',
};

function fieldValue(preview: ApprovalPreview, ...labels: string[]): string | null {
  const wanted = labels.map((l) => l.toLowerCase());
  const hit = preview.fields.find((f) => wanted.includes(f.label.trim().toLowerCase()));
  return hit ? clean(hit.value) : null;
}

function Fields({ fields, t }: { fields: ApprovalPreview['fields']; t: ChatTokens }) {
  if (!fields.length) return null;
  return (
    <View style={styles.fields}>
      {fields.map((f, i) => (
        <View key={`${f.label}-${i}`} style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: t.textSecondary }]} numberOfLines={1}>
            {f.label}
          </Text>
          <Text style={[styles.fieldValue, { color: t.textPrimary }]}>{clean(f.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function PreviewBlock({ part, t }: { part: ApprovalPart; t: ChatTokens }) {
  const { preview } = part;
  const box = [styles.preview, { backgroundColor: t.optionBox, borderColor: t.optionBorder }];

  if (preview.kind === 'transfer' || part.signRequest) {
    const amount = part.signRequest?.amount ?? fieldValue(preview, 'Betrag', 'Menge', 'amount') ?? '';
    const to = part.signRequest?.toName ?? fieldValue(preview, 'An', 'Empfänger', 'Empfängerin', 'to') ?? '';
    const rest = preview.fields.filter(
      (f) => !['betrag', 'menge', 'amount', 'an', 'empfänger', 'empfängerin', 'to'].includes(f.label.trim().toLowerCase()),
    );
    return (
      <View style={box}>
        <Text style={[styles.amount, { color: t.textPrimary }]}>{clean(amount)}</Text>
        <Text style={[styles.amountUnit, { color: t.textSecondary }]}>Röbel Münzen</Text>
        {to ? (
          <Text style={[styles.amountTo, { color: t.textPrimary }]} numberOfLines={2}>
            an {clean(to)}
          </Text>
        ) : null}
        {rest.length ? <Fields fields={rest} t={t} /> : null}
        {preview.body ? <Text style={[styles.body, { color: t.textSecondary }]}>{clean(preview.body)}</Text> : null}
      </View>
    );
  }

  if (preview.kind === 'post') {
    return (
      <View style={box}>
        {preview.body ? (
          <Text style={[styles.body, { color: t.textPrimary }]} numberOfLines={12}>
            {clean(preview.body)}
          </Text>
        ) : null}
        {preview.imageUrl ? (
          <Image source={{ uri: preview.imageUrl }} style={styles.image} contentFit="cover" transition={150} />
        ) : null}
        <Fields fields={preview.fields} t={t} />
      </View>
    );
  }

  if (preview.kind === 'message' || preview.kind === 'email') {
    const to = fieldValue(preview, 'An', 'Empfänger', 'Empfängerin', 'to');
    const others = preview.fields.filter(
      (f) => !['an', 'empfänger', 'empfängerin', 'to'].includes(f.label.trim().toLowerCase()),
    );
    return (
      <View style={box}>
        {to ? (
          <View style={styles.toRow}>
            <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>An</Text>
            <Text style={[styles.toValue, { color: t.textPrimary }]} numberOfLines={1}>
              {to}
            </Text>
          </View>
        ) : null}
        <Fields fields={others} t={t} />
        {preview.body ? (
          <Text style={[styles.body, styles.bodyAfterFields, { color: t.textPrimary }]} numberOfLines={14}>
            {clean(preview.body)}
          </Text>
        ) : null}
      </View>
    );
  }

  // event · listing · text · generic: fields (+ optional body / image)
  if (!preview.fields.length && !preview.body && !preview.imageUrl) return null;
  return (
    <View style={box}>
      {preview.imageUrl ? (
        <Image source={{ uri: preview.imageUrl }} style={styles.image} contentFit="cover" transition={150} />
      ) : null}
      <Fields fields={preview.fields} t={t} />
      {preview.body ? (
        <Text
          style={[styles.body, preview.fields.length ? styles.bodyAfterFields : null, { color: t.textPrimary }]}
          numberOfLines={10}
        >
          {clean(preview.body)}
        </Text>
      ) : null}
    </View>
  );
}

function Checkbox({ checked, t }: { checked: boolean; t: ChatTokens }) {
  return (
    <View
      style={[
        styles.checkbox,
        checked
          ? { backgroundColor: t.primaryButton, borderColor: t.primaryButton }
          : { backgroundColor: 'transparent', borderColor: t.textTertiary },
      ]}
    >
      {checked ? <Feather name="check" size={13} color={t.primaryButtonText} /> : null}
    </View>
  );
}

/**
 * Agent approval request (spec 2026-09-26 §6), styled like the integration card (ref 8): title,
 * summary, a preview block per kind, black "Freigeben", text "Ablehnen", optional "Immer erlauben".
 */
export function ApprovalCard({ part, onApprove, onReject, disabled, onLongPress, style }: ApprovalCardProps) {
  const t = useChatTokens();
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const isMoney = part.risk === 'money' || !!part.signRequest;
  const status = part.status;
  const faded = status === 'rejected' || status === 'expired';
  const inactive = !!busy || !!disabled;

  const run = async (which: 'approve' | 'reject') => {
    if (inactive) return;
    const fn = which === 'approve' ? onApprove : onReject;
    if (!fn) return;
    if (which === 'approve') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else Haptics.selectionAsync().catch(() => {});
    setBusy(which);
    try {
      await (which === 'approve' ? onApprove?.({ alwaysAllow: !isMoney && part.canAlwaysAllow && alwaysAllow }) : onReject?.());
    } catch {
      // The screen surfaces errors (snackbar); the card falls back to the part status.
    } finally {
      setBusy(null);
    }
  };

  let footer: React.ReactNode;
  if (status === 'pending') {
    footer = (
      <>
        {part.canAlwaysAllow && !isMoney ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alwaysAllow }}
            accessibilityLabel="Immer erlauben"
            hitSlop={6}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setAlwaysAllow((v) => !v);
            }}
            style={styles.checkRow}
          >
            <Checkbox checked={alwaysAllow} t={t} />
            <Text style={[styles.checkText, { color: t.textSecondary }]}>Immer erlauben</Text>
          </Pressable>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isMoney ? 'Mit Wallet bestätigen' : 'Freigeben'}
            accessibilityState={{ disabled: inactive }}
            disabled={inactive}
            onPress={() => run('approve')}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: inactive && !busy ? t.disabledButton : t.primaryButton, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {busy === 'approve' ? (
              <ActivityIndicator size="small" color={t.primaryButtonText} />
            ) : (
              <Text style={[styles.btnText, { color: t.primaryButtonText }]}>
                {isMoney ? 'Mit Wallet bestätigen' : 'Freigeben'}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ablehnen"
            hitSlop={8}
            disabled={inactive}
            onPress={() => run('reject')}
            style={styles.rejectBtn}
          >
            {busy === 'reject' ? (
              <ActivityIndicator size="small" color={t.textSecondary} />
            ) : (
              <Text style={[styles.rejectText, { color: inactive ? t.textTertiary : t.textSecondary }]}>Ablehnen</Text>
            )}
          </Pressable>
        </View>
      </>
    );
  } else if (status === 'approved') {
    footer = (
      <View style={styles.stateRow}>
        <ActivityIndicator size="small" color={t.textSecondary} />
        <Text style={[styles.stateText, { color: t.textSecondary }]}>Wird ausgeführt …</Text>
      </View>
    );
  } else if (status === 'executed') {
    footer = (
      <View style={styles.stateRow}>
        <Feather name="check" size={18} color={t.check} />
        <Text style={[styles.stateText, { color: t.textSecondary }]}>{part.resultNote ? clean(part.resultNote) : 'Erledigt'}</Text>
      </View>
    );
  } else if (status === 'failed') {
    footer = (
      <View style={styles.stateRow}>
        <Feather name="alert-circle" size={17} color={t.recordingRed} />
        <Text style={[styles.stateText, { color: t.recordingRed }]}>
          {part.resultNote ? clean(part.resultNote) : 'Hat nicht geklappt.'}
        </Text>
      </View>
    );
  } else {
    footer = (
      <Text style={[styles.fadedText, { color: t.textTertiary }]}>{status === 'rejected' ? 'abgelehnt' : 'abgelaufen'}</Text>
    );
  }

  return (
    <Pressable onLongPress={onLongPress} style={[styles.card, { backgroundColor: t.bubbleBot }, faded && styles.faded, style]}>
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <Feather name={KIND_ICON[part.preview?.kind ?? 'generic'] ?? 'shield'} size={14} color="#000000" />
        </View>
        <Text numberOfLines={2} style={[styles.title, { color: t.textPrimary }]}>
          {clean(part.title)}
        </Text>
      </View>
      {part.summary ? (
        <Text style={[chatType.secondary, styles.summary, { color: t.textSecondary }]}>{clean(part.summary)}</Text>
      ) : null}
      {part.preview ? <PreviewBlock part={part} t={t} /> : null}
      {footer}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start', width: chatSize.bubbleMaxWidth, borderRadius: chatSize.bubbleRadius, padding: 14 },
  faded: { opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconTile: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: chatFont.medium, fontSize: 18, letterSpacing: -0.2, flexShrink: 1 },
  summary: { marginTop: 8 },
  preview: { marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  body: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 22 },
  bodyAfterFields: { marginTop: 10 },
  image: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10, marginTop: 10 },
  fields: { gap: 6 },
  fieldRow: { gap: 1 },
  fieldLabel: { fontFamily: chatFont.medium, fontSize: 13, lineHeight: 17 },
  fieldValue: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 20 },
  toRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  toValue: { fontFamily: chatFont.medium, fontSize: 15, flexShrink: 1 },
  amount: { fontFamily: chatFont.semiBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  amountUnit: { fontFamily: chatFont.medium, fontSize: 14, marginTop: -2 },
  amountTo: { fontFamily: chatFont.medium, fontSize: 16, marginTop: 8, marginBottom: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, alignSelf: 'flex-start' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily: chatFont.regular, fontSize: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  btn: { height: 37, borderRadius: 18.5, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', minWidth: 96 },
  btnText: { fontFamily: chatFont.medium, fontSize: 16 },
  rejectBtn: { height: 37, justifyContent: 'center' },
  rejectText: { fontFamily: chatFont.medium, fontSize: 15 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  stateText: { fontFamily: chatFont.medium, fontSize: 15, flexShrink: 1 },
  fadedText: { fontFamily: chatFont.regular, fontSize: 15, marginTop: 12, marginBottom: 2 },
});

export default ApprovalCard;
