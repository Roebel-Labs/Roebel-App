import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatClock, type RundownItem } from '@/lib/live';
import LiveSheet from './LiveSheet';
import { F, LIVE } from './tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  rundown: RundownItem[];
  reminders: Set<string>;
  busyItemId: string | null;
  onToggleReminder: (item: RundownItem) => void;
};

export default function ProgramSheet({ visible, onClose, rundown, reminders, busyItemId, onToggleReminder }: Props) {
  return (
    <LiveSheet
      visible={visible}
      onClose={onClose}
      title="Programm"
      subtitle="Tippe auf die Glocke und wir sagen dir Bescheid, wenn es auf der Fläche losgeht."
    >
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {rundown.length === 0 ? <Text style={styles.empty}>Das Programm folgt in Kürze.</Text> : null}
        {rundown.map((item, i) => {
          const onStage = item.status === 'on_stage';
          const done = item.status === 'done';
          const on = reminders.has(item.id);
          const time = formatClock(item.planned_at);
          return (
            <View key={item.id} style={[styles.item, onStage && styles.itemOnStage, done && styles.itemDone]}>
              <View style={styles.rail}>
                <View style={[styles.railDot, onStage && styles.railDotLive, done && styles.railDotDone]} />
                {i < rundown.length - 1 ? <View style={styles.railLine} /> : null}
              </View>
              <View style={styles.body}>
                <View style={styles.metaRow}>
                  {onStage ? <Text style={styles.liveTag}>JETZT</Text> : null}
                  {time ? <Text style={styles.time}>{`${time} Uhr`}</Text> : null}
                </View>
                <Text style={[styles.title, done && styles.textDone]} numberOfLines={2}>{item.title}</Text>
                {item.subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{item.subtitle}</Text> : null}
              </View>
              {item.status === 'upcoming' ? (
                <Pressable
                  onPress={() => onToggleReminder(item)}
                  disabled={busyItemId === item.id}
                  hitSlop={8}
                  style={({ pressed }) => [styles.bell, on && styles.bellOn, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={on ? 'Erinnerung ausschalten' : 'Erinnern'}
                >
                  {busyItemId === item.id ? (
                    <ActivityIndicator size="small" color={LIVE.text} />
                  ) : (
                    <>
                      <Ionicons name={on ? 'notifications' : 'notifications-outline'} size={15} color={on ? '#fff' : LIVE.text} />
                      <Text style={styles.bellText}>{on ? 'Erinnert' : 'Erinnern'}</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </LiveSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingBottom: 12 },
  empty: { color: LIVE.textSecondary, fontFamily: F.medium, fontSize: 14, padding: 20, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 14 },
  itemOnStage: { backgroundColor: 'rgba(0,73,139,0.45)', borderWidth: 1, borderColor: 'rgba(122,187,242,0.35)' },
  itemDone: { opacity: 0.45 },
  rail: { width: 14, alignItems: 'center', alignSelf: 'stretch', paddingTop: 6 },
  railDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: LIVE.textTertiary },
  railDotLive: { backgroundColor: LIVE.red, borderColor: LIVE.red },
  railDotDone: { backgroundColor: LIVE.textTertiary },
  railLine: { flex: 1, width: 2, marginTop: 4, marginBottom: -16, backgroundColor: LIVE.border },
  body: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveTag: { color: LIVE.red, fontSize: 11, fontFamily: F.bold, letterSpacing: 1 },
  time: { color: LIVE.textTertiary, fontSize: 12, fontFamily: F.medium, fontVariant: ['tabular-nums'] },
  title: { color: LIVE.text, fontSize: 16, fontFamily: F.semiBold },
  textDone: { color: LIVE.textSecondary },
  subtitle: { color: LIVE.textSecondary, fontSize: 13, fontFamily: F.regular },
  bell: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 32, minWidth: 92, justifyContent: 'center',
    borderRadius: 16, backgroundColor: LIVE.surfaceRaised, alignSelf: 'center',
  },
  bellOn: { backgroundColor: LIVE.navy },
  bellText: { color: LIVE.text, fontSize: 12, fontFamily: F.semiBold },
});
