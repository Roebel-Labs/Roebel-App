import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatEventWhen } from '@/lib/chat/calendar';
import type { CalendarEventStatus } from '@/lib/chat/types';
import { chatFont, chatSize, chatType, useChatTokens } from './tokens';

export type CalendarEventCardProps = {
  title: string;
  start: string;
  end: string;
  location?: string;
  status: CalendarEventStatus;
  /** Opens the OS event sheet; resolves when it closed. */
  onAdd?: () => Promise<unknown> | void;
  onDismiss?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

function DayTile({ start }: { start: string }) {
  const d = new Date(start);
  return (
    <View style={styles.tile}>
      <View style={styles.tileTop} />
      <Text style={styles.tileDay}>{Number.isFinite(d.getTime()) ? d.getDate() : ''}</Text>
    </View>
  );
}

/** Bot-proposed calendar event, styled like the integration card (ref 8). */
export function CalendarEventCard({
  title,
  start,
  end,
  location,
  status,
  onAdd,
  onDismiss,
  onLongPress,
  style,
}: CalendarEventCardProps) {
  const t = useChatTokens();
  const [busy, setBusy] = useState(false);
  const dismissed = status === 'dismissed';

  const add = async () => {
    if (busy || !onAdd) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true);
    try {
      await onAdd();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.card, { backgroundColor: t.bubbleBot }, dismissed && styles.faded, style]}
    >
      <View style={styles.head}>
        <DayTile start={start} />
        <Text numberOfLines={2} style={[styles.title, { color: t.textPrimary }]}>
          {title}
        </Text>
      </View>
      <Text style={[chatType.secondary, styles.when, { color: t.textSecondary }]}>{formatEventWhen(start, end)}</Text>
      {location ? (
        <View style={styles.locRow}>
          <Feather name="map-pin" size={13} color={t.textSecondary} />
          <Text numberOfLines={1} style={[chatType.secondary, styles.loc, { color: t.textSecondary }]}>
            {location}
          </Text>
        </View>
      ) : null}

      {status === 'added' ? (
        <View style={styles.doneRow}>
          <Feather name="check" size={18} color={t.check} />
          <Text style={[styles.doneText, { color: t.textSecondary }]}>Im Kalender</Text>
        </View>
      ) : dismissed ? (
        <Text style={[styles.dismissedText, { color: t.textTertiary }]}>verworfen</Text>
      ) : (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zum Kalender hinzufügen"
            disabled={busy}
            onPress={add}
            style={({ pressed }) => [styles.btn, { backgroundColor: t.primaryButton, opacity: pressed ? 0.85 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={t.primaryButtonText} />
            ) : (
              <Text style={[styles.btnText, { color: t.primaryButtonText }]}>Zum Kalender hinzufügen</Text>
            )}
          </Pressable>
          {onDismiss ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Termin verwerfen"
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onDismiss();
              }}
              style={styles.dismissBtn}
            >
              <Text style={[styles.dismissBtnText, { color: t.textSecondary }]}>Verwerfen</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start', width: chatSize.bubbleMaxWidth, borderRadius: chatSize.bubbleRadius, padding: 14 },
  faded: { opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  tile: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
  },
  tileTop: { alignSelf: 'stretch', height: 6, backgroundColor: '#E5483E' },
  tileDay: { color: '#000000', fontFamily: chatFont.semiBold, fontSize: 11, lineHeight: 16 },
  title: { fontFamily: chatFont.medium, fontSize: 18, letterSpacing: -0.2, flexShrink: 1 },
  when: { marginTop: 8 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  loc: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  btn: { height: 37, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center', minWidth: 60, alignItems: 'center' },
  btnText: { fontFamily: chatFont.medium, fontSize: 16 },
  dismissBtn: { height: 37, justifyContent: 'center' },
  dismissBtnText: { fontFamily: chatFont.medium, fontSize: 15 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  doneText: { fontFamily: chatFont.medium, fontSize: 15 },
  dismissedText: { fontFamily: chatFont.regular, fontSize: 15, marginTop: 12, marginBottom: 2 },
});

export default CalendarEventCard;
