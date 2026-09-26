import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useChatActions } from '@/context/ChatContext';
import type { ChatRoutine } from '@/lib/chat/api';
import { formatSchedule } from '@/lib/chat/routines';
import { chatFont, useChatTokens } from './tokens';
import { SettingsListSkeleton } from './Shimmer';

export type RoutinesSectionProps = {
  threadId: string;
  /** Show only this bot's routines (group chats); all routines of the thread when omitted. */
  botId?: string | null;
};

/** "Routinen" block in the bot sheet: title + schedule, pause/resume switch, delete with confirm. */
export function RoutinesSection({ threadId, botId }: RoutinesSectionProps) {
  const t = useChatTokens();
  const { fetchRoutines, updateRoutine, deleteRoutine } = useChatActions();
  const [routines, setRoutines] = useState<ChatRoutine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRoutines(await fetchRoutines(threadId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Routinen konnten nicht geladen werden.');
    }
  }, [fetchRoutines, threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (routine: ChatRoutine, enabled: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setBusyId(routine.id);
    setRoutines((list) => list?.map((r) => (r.id === routine.id ? { ...r, enabled } : r)) ?? null);
    try {
      const updated = await updateRoutine(routine.id, { enabled });
      setRoutines((list) => list?.map((r) => (r.id === updated.id ? updated : r)) ?? null);
      setError(null);
    } catch (err) {
      setRoutines((list) => list?.map((r) => (r.id === routine.id ? routine : r)) ?? null);
      setError(err instanceof Error && err.message ? err.message : 'Ändern fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (routine: ChatRoutine) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Routine löschen?', `„${routine.title}“ wird nicht mehr automatisch ausgeführt.`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          setBusyId(routine.id);
          try {
            await deleteRoutine(routine.id);
            setRoutines((list) => list?.filter((r) => r.id !== routine.id) ?? null);
            setError(null);
          } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'Löschen fehlgeschlagen.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const shown = routines?.filter((r) => !botId || r.botId === botId) ?? null;

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: t.textSecondary }]}>Routinen</Text>
      {shown === null && !error ? (
        <SettingsListSkeleton rows={2} style={styles.loading} />
      ) : shown && shown.length ? (
        <View style={[styles.box, { backgroundColor: t.groupedBackground }]}>
          {shown.map((r, i) => (
            <View
              key={r.id}
              style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator } : null]}
            >
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[styles.title, { color: r.enabled ? t.textPrimary : t.textSecondary }]}>
                  {r.title}
                </Text>
                <Text style={[styles.schedule, { color: t.textSecondary }]}>
                  {formatSchedule(r.schedule)}
                  {r.enabled ? '' : ' · pausiert'}
                </Text>
              </View>
              <Switch
                value={r.enabled}
                disabled={busyId === r.id}
                onValueChange={(v) => toggle(r, v)}
                trackColor={{ true: t.online, false: t.separator }}
                accessibilityLabel={`Routine ${r.title} ${r.enabled ? 'pausieren' : 'aktivieren'}`}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Routine ${r.title} löschen`}
                hitSlop={8}
                disabled={busyId === r.id}
                onPress={() => confirmDelete(r)}
                style={styles.delete}
              >
                <Feather name="trash-2" size={18} color={t.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : !error ? (
        <Text style={[styles.empty, { color: t.textTertiary }]}>
          Noch keine Routinen. Schreib zum Beispiel „Erinnere mich jeden Sonntag um 8:41 an den Wochenplan“.
        </Text>
      ) : null}
      {error ? <Text style={[styles.error, { color: t.recordingRed }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 22 },
  label: { fontFamily: chatFont.medium, fontSize: 14, marginBottom: 10 },
  loading: { borderRadius: 20 },
  box: { borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  rowText: { flex: 1, minWidth: 0 },
  title: { fontFamily: chatFont.medium, fontSize: 16 },
  schedule: { fontFamily: chatFont.regular, fontSize: 14, marginTop: 2 },
  delete: { padding: 4 },
  empty: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 20 },
  error: { fontFamily: chatFont.regular, fontSize: 14, marginTop: 10 },
});

export default RoutinesSection;
