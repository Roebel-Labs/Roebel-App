// Long-press on someone else's chat message: report it (server) or block the person (this device only).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LiveIcon from '@/components/live/LiveIcon';
import { formatSupportAmount, type ChatMessage, type ReportReason } from '@/lib/live';
import LiveSheet from '../LiveSheet';
import { Avatar } from '../ChatRow';
import { F, liveStyles, useLivePalette, type LivePalette } from '../tokens';

type Props = {
  message: ChatMessage | null;
  onClose: () => void;
  blocked: boolean;
  reportBusy: boolean;
  onReport: (m: ChatMessage, reason: ReportReason) => void;
  onToggleBlock: (m: ChatMessage) => void;
};

const REASONS: { reason: ReportReason; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { reason: 'spam', label: 'Spam', icon: 'mail-unread-outline' },
  { reason: 'abuse', label: 'Beleidigung', icon: 'hand-left-outline' },
  { reason: 'other', label: 'Anderes', icon: 'ellipsis-horizontal-circle-outline' },
];

export default function MessageActionsSheet({ message, onClose, blocked, reportBusy, onReport, onToggleBlock }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const [choosing, setChoosing] = useState(false);
  // Keep the last message while the sheet slides out.
  const [shown, setShown] = useState<ChatMessage | null>(message);
  useEffect(() => {
    if (message) { setShown(message); setChoosing(false); }
  }, [message]);

  const m = shown;
  const name = m?.display_name?.trim() || 'Jemand';
  return (
    <LiveSheet visible={!!message} onClose={onClose} title="Nachricht" maxHeight="70%">
      {m ? (
        <View style={styles.body}>
          <View style={styles.preview}>
            <Avatar uri={blocked ? null : m.avatar_url} name={name} size={28} />
            <View style={styles.previewText}>
              <Text style={styles.previewName} numberOfLines={1}>
                {name}
                {m.kind === 'support' ? <Text style={styles.previewAmount}>{`  ${formatSupportAmount(m.amount_cents)}`}</Text> : null}
              </Text>
              <Text style={blocked ? styles.previewHidden : styles.previewBody} numberOfLines={4}>
                {blocked ? '[Nachricht ausgeblendet]' : m.body || '–'}
              </Text>
            </View>
          </View>

          <Text style={styles.section}>Nachricht</Text>
          {!choosing ? (
            <Pressable onPress={() => setChoosing(true)} style={({ pressed }) => [styles.item, pressed && styles.pressed]} accessibilityRole="button">
              <LiveIcon name="flag-outline" size={19} color={L.text} />
              <Text style={styles.itemText}>Melden</Text>
              <LiveIcon name="chevron-forward" size={16} color={L.textTertiary} />
            </Pressable>
          ) : (
            <View style={styles.reasons}>
              <Text style={styles.reasonHint}>Warum meldest du diese Nachricht?</Text>
              {REASONS.map((r) => (
                <Pressable
                  key={r.reason}
                  onPress={() => onReport(m, r.reason)}
                  disabled={reportBusy}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed, reportBusy && styles.disabled]}
                  accessibilityRole="button"
                >
                  <LiveIcon name={r.icon} size={19} color={L.text} />
                  <Text style={styles.itemText}>{r.label}</Text>
                  {reportBusy ? <ActivityIndicator size="small" color={L.textSecondary} /> : null}
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.section}>Person</Text>
          <Pressable onPress={() => onToggleBlock(m)} style={({ pressed }) => [styles.item, pressed && styles.pressed]} accessibilityRole="button">
            <LiveIcon name={blocked ? 'person-add-outline' : 'remove-circle-outline'} size={19} color={blocked ? L.text : L.errorText} />
            <Text style={[styles.itemText, !blocked && styles.danger]}>{blocked ? 'Blockierung aufheben' : 'Blockieren'}</Text>
          </Pressable>
          <Text style={styles.note}>Blockieren gilt nur auf diesem Gerät: Du siehst die Nachrichten dieser Person nicht mehr.</Text>
        </View>
      ) : null}
    </LiveSheet>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  preview: {
    flexDirection: 'row', gap: 10, marginHorizontal: 8, marginBottom: 6, padding: 12, borderRadius: 12, backgroundColor: L.surfaceRaised,
  },
  previewText: { flex: 1, gap: 3 },
  previewName: { color: L.textSecondary, fontSize: 13, fontFamily: F.semiBold },
  previewAmount: { color: L.goldText, fontFamily: F.bold },
  previewBody: { color: L.text, fontSize: 14, lineHeight: 20, fontFamily: F.regular },
  previewHidden: { color: L.textTertiary, fontSize: 13, fontStyle: 'italic', fontFamily: F.regular },
  section: {
    color: L.textTertiary, fontSize: 12, fontFamily: F.semiBold, letterSpacing: 0.3, paddingHorizontal: 8, marginTop: 14, marginBottom: 4,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingHorizontal: 8, borderRadius: 10 },
  itemText: { flex: 1, color: L.text, fontSize: 15, fontFamily: F.medium },
  danger: { color: L.errorText },
  pressed: { backgroundColor: L.surfaceRaised },
  disabled: { opacity: 0.5 },
  reasons: { gap: 0 },
  reasonHint: { color: L.textSecondary, fontSize: 13, fontFamily: F.regular, paddingHorizontal: 8, paddingVertical: 4 },
  note: { color: L.textTertiary, fontSize: 12, lineHeight: 16, fontFamily: F.regular, paddingHorizontal: 8, marginTop: 6 },
});
