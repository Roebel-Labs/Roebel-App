import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { tierBadgeLabel, type InspirationTask } from '@/lib/chat/inspiration';
import { BOT_COLORS, BotAvatar } from './BotAvatar';
import { chatFont, haloShadow, useChatTokens } from './tokens';

const FALLBACK_AVATAR: BotAvatarSpec = { shape: 'circle', color: BOT_COLORS.black, eyes: 'dots' };

export type InspirationCardProps = {
  task: InspirationTask;
  onPress: () => void;
  /** "als Routine · …" pill; only shown for recurring, unlocked tasks. */
  onRoutinePress?: () => void;
  onLongPress?: () => void;
  /** Disables taps while the thread for this card is being opened. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** One "Für dich" idea: mascot, title, pitch, grey value chip, optional lock + tier badge and routine pill. */
export function InspirationCard({ task, onPress, onRoutinePress, onLongPress, busy, style }: InspirationCardProps) {
  const t = useChatTokens();
  const badge = task.locked ? tierBadgeLabel(task.tier) : null;
  const showRoutine = Boolean(task.recurring?.suggestion && onRoutinePress && !task.locked);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${task.pitch}${badge ? `. Verfügbar mit ${badge}` : ''}`}
      accessibilityHint="Lange drücken, um die Idee auszublenden"
      disabled={busy}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onLongPress={
        onLongPress
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.surface, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
        haloShadow(t),
        style,
      ]}
    >
      <View style={styles.row}>
        <BotAvatar spec={task.bot?.avatar ?? FALLBACK_AVATAR} size={44} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text numberOfLines={2} style={[styles.title, { color: t.textPrimary }]}>
              {task.title}
            </Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: t.primaryButton }]}>
                <Feather name="lock" size={11} color={t.primaryButtonText} />
                <Text style={[styles.badgeText, { color: t.primaryButtonText }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={2} style={[styles.pitch, { color: t.textSecondary }]}>
            {task.pitch}
          </Text>
          <View style={styles.footer}>
            <View style={[styles.valueChip, { backgroundColor: t.chipBackground }]}>
              <Text numberOfLines={1} style={[styles.valueText, { color: t.chipText }]}>
                {task.value.estimate}
              </Text>
            </View>
            {task.bot ? (
              <Text numberOfLines={1} style={[styles.botName, { color: t.textTertiary }]}>
                mit {task.bot.name}
              </Text>
            ) : null}
          </View>
          {showRoutine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Als Routine einrichten: ${task.recurring?.suggestion}`}
              disabled={busy}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onRoutinePress?.();
              }}
              hitSlop={6}
              style={({ pressed }) => [
                styles.routinePill,
                { borderColor: t.optionBorder, backgroundColor: pressed ? t.chipBackground : t.surface },
              ]}
            >
              <Feather name="repeat" size={13} color={t.textPrimary} />
              <Text numberOfLines={1} style={[styles.routineText, { color: t.textPrimary }]}>
                als Routine · {task.recurring?.suggestion}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontFamily: chatFont.semiBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    marginTop: 1,
  },
  badgeText: { fontFamily: chatFont.semiBold, fontSize: 12, letterSpacing: -0.1 },
  pitch: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 20, marginTop: 4, letterSpacing: -0.1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  valueChip: { height: 24, borderRadius: 7, paddingHorizontal: 8, justifyContent: 'center', flexShrink: 1 },
  valueText: { fontFamily: chatFont.medium, fontSize: 14, letterSpacing: -0.1 },
  botName: { fontFamily: chatFont.regular, fontSize: 14, flexShrink: 1 },
  routinePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 12,
    marginTop: 10,
    maxWidth: '100%',
  },
  routineText: { fontFamily: chatFont.medium, fontSize: 14, letterSpacing: -0.1, flexShrink: 1 },
});

export default InspirationCard;
