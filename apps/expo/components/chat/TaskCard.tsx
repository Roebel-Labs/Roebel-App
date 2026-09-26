import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ChatPart } from '@/lib/chat/types';
import { chatFont, chatSize, useChatTokens, type ChatTokens } from './tokens';

export type TaskPart = Extract<ChatPart, { type: 'task' }>;

export type TaskCardProps = {
  part: TaskPart;
  onLongPress?: () => void;
  /** "Abbrechen" on live tasks; omitted → no button. */
  onCancel?: () => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
};

const LIVE: readonly TaskPart['status'][] = ['queued', 'running', 'waiting_approval'];

const STATUS_LABEL: Record<TaskPart['status'], string> = {
  queued: 'Wartet',
  running: 'Läuft',
  waiting_approval: 'Wartet auf Freigabe',
  done: 'Fertig',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
};

function StatusChip({ status, t }: { status: TaskPart['status']; t: ChatTokens }) {
  const color = status === 'done' ? t.check : status === 'failed' ? t.recordingRed : t.chipText;
  return (
    <View style={[styles.chip, { backgroundColor: t.surface }]}>
      {status === 'running' ? <View style={[styles.dot, { backgroundColor: t.online }]} /> : null}
      <Text style={[styles.chipText, { color }]}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

function StepIcon({ status, t }: { status: TaskPart['steps'][number]['status']; t: ChatTokens }) {
  if (status === 'running') return <ActivityIndicator size="small" color={t.textSecondary} style={styles.stepIcon} />;
  if (status === 'done') return <Feather name="check" size={17} color={t.check} style={styles.stepIcon} />;
  if (status === 'failed') return <Feather name="x" size={17} color={t.recordingRed} style={styles.stepIcon} />;
  return (
    <View style={[styles.stepIcon, styles.pendingWrap]}>
      <View style={[styles.pendingCircle, { borderColor: t.textTertiary }]} />
    </View>
  );
}

/** Durable agent task (spec 2026-09-26 §6): title, status, step list and "Abbrechen" while live. */
export function TaskCard({ part, onLongPress, onCancel, style }: TaskCardProps) {
  const t = useChatTokens();
  const faded = part.status === 'cancelled';
  const [cancelling, setCancelling] = React.useState(false);
  const live = LIVE.includes(part.status);
  const cancel = React.useCallback(async () => {
    if (!onCancel || cancelling) return;
    setCancelling(true);
    try {
      await onCancel();
    } catch {
      // The caller shows the error; the button becomes tappable again.
    } finally {
      setCancelling(false);
    }
  }, [onCancel, cancelling]);
  return (
    <Pressable onLongPress={onLongPress} style={[styles.card, { backgroundColor: t.bubbleBot }, faded && styles.faded, style]}>
      <View style={styles.head}>
        <Text numberOfLines={2} style={[styles.title, { color: t.textPrimary }]}>
          {part.title}
        </Text>
        <StatusChip status={part.status} t={t} />
      </View>
      {part.steps.length ? (
        <View style={styles.steps}>
          {part.steps.map((s, i) => (
            <View key={`${i}-${s.label}`} style={styles.stepRow}>
              <StepIcon status={s.status} t={t} />
              <Text
                style={[
                  styles.stepText,
                  { color: s.status === 'pending' ? t.textSecondary : t.textPrimary },
                  s.status === 'failed' ? { color: t.recordingRed } : null,
                ]}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {live && onCancel ? (
        <Pressable
          onPress={cancel}
          disabled={cancelling}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Aufgabe abbrechen"
          style={styles.cancel}
        >
          <Text style={[styles.cancelText, { color: t.textSecondary }, cancelling && styles.faded]}>
            {cancelling ? 'Wird abgebrochen …' : 'Abbrechen'}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start', width: chatSize.bubbleMaxWidth, borderRadius: chatSize.bubbleRadius, padding: 14 },
  faded: { opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontFamily: chatFont.medium, fontSize: 18, letterSpacing: -0.2, flex: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, borderRadius: 12, paddingHorizontal: 9 },
  chipText: { fontFamily: chatFont.medium, fontSize: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  steps: { marginTop: 12, gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepIcon: { width: 20, height: 20, marginTop: 1 },
  pendingWrap: { alignItems: 'center', justifyContent: 'center' },
  pendingCircle: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  stepText: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 22, flex: 1 },
  cancel: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 2 },
  cancelText: { fontFamily: chatFont.medium, fontSize: 15 },
});

export default TaskCard;
