import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ChatPart, ScheduleItem } from '@/lib/chat/types';
import { chatFont, chatSize, chatType, useChatTokens } from './tokens';

type SchedulePart = Extract<ChatPart, { type: 'schedule' }>;

export type ScheduleCardProps = {
  part: SchedulePart;
  onItemPress?: (url: string) => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Heute", "Morgen" or "Donnerstag, 26.11." for a YYYY-MM-DD day. */
function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  if (iso === localIso(today)) return 'Heute';
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (iso === localIso(tomorrow)) return 'Morgen';
  return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${m[3]}.${m[2]}.`;
}

function Row({ item, onPress, last }: { item: ScheduleItem; onPress?: (url: string) => void; last: boolean }) {
  const t = useChatTokens();
  const meta = [item.location, item.tag].filter(Boolean).join(' · ');
  const press = item.url && onPress
    ? () => {
        Haptics.selectionAsync().catch(() => {});
        onPress(item.url!);
      }
    : undefined;
  return (
    <Pressable
      onPress={press}
      disabled={!press}
      accessibilityRole={press ? 'link' : undefined}
      style={({ pressed }) => [styles.row, !last && { borderBottomColor: t.separator, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}
    >
      <Text style={[styles.time, { color: item.time ? t.textPrimary : t.textTertiary }]}>{item.time ?? 'ganztags'}</Text>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.itemTitle, { color: t.textPrimary }]}>
          {item.title}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={[chatType.secondary, { color: t.textSecondary }]}>
            {meta}
          </Text>
        ) : null}
      </View>
      {press ? <Feather name="chevron-right" size={16} color={t.textTertiary} style={styles.chevron} /> : null}
    </Pressable>
  );
}

/** Agent-built day-by-day plan (e.g. the week's marked events). Read-only. */
export function ScheduleCard({ part, onItemPress, onLongPress, style }: ScheduleCardProps) {
  const t = useChatTokens();
  return (
    <Pressable onLongPress={onLongPress} style={[styles.card, { backgroundColor: t.bubbleBot }, style]}>
      <View style={styles.head}>
        <Feather name="calendar" size={16} color={t.textPrimary} />
        <Text numberOfLines={1} style={[styles.title, { color: t.textPrimary }]}>
          {part.title}
        </Text>
      </View>
      {part.subtitle ? (
        <Text style={[chatType.secondary, styles.subtitle, { color: t.textSecondary }]}>{part.subtitle}</Text>
      ) : null}

      {part.days.length === 0 ? (
        <Text style={[chatType.secondary, styles.empty, { color: t.textSecondary }]}>
          {part.empty ?? 'Nichts geplant.'}
        </Text>
      ) : (
        part.days.map((day) => (
          <View key={day.date} style={styles.day}>
            <Text style={[styles.dayLabel, { color: t.textSecondary }]}>{dayLabel(day.date)}</Text>
            <View style={[styles.dayBox, { backgroundColor: t.surface }]}>
              {day.items.map((item, i) => (
                <Row key={`${day.date}-${i}`} item={item} onPress={onItemPress} last={i === day.items.length - 1} />
              ))}
            </View>
          </View>
        ))
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start', width: chatSize.bubbleMaxWidth, borderRadius: chatSize.bubbleRadius, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: chatFont.medium, fontSize: 18, letterSpacing: -0.2, flexShrink: 1 },
  subtitle: { marginTop: 2 },
  empty: { marginTop: 10 },
  day: { marginTop: 12 },
  dayLabel: { fontFamily: chatFont.semiBold, fontSize: 13, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  dayBox: { borderRadius: 10, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 10 },
  pressed: { opacity: 0.6 },
  time: { fontFamily: chatFont.medium, fontSize: 14, width: 58, paddingTop: 1, fontVariant: ['tabular-nums'] },
  rowBody: { flex: 1, gap: 2 },
  itemTitle: { fontFamily: chatFont.medium, fontSize: 15, lineHeight: 20 },
  chevron: { alignSelf: 'center' },
});

export default ScheduleCard;
