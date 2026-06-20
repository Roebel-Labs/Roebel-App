import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { RewardTask } from '@/lib/supabase-rewards';
import CheckIcon from '@/assets/icons/check.svg';
import BellIcon from '@/assets/icons/notification-01.svg';
import ImageIcon from '@/assets/icons/image-01.svg';
import UserIcon from '@/assets/icons/user.svg';
import SparklesIcon from '@/assets/icons/sparkles.svg';
import CalendarIcon from '@/assets/icons/calendar.svg';
import TicketIcon from '@/assets/icons/ticket.svg';
import BookIcon from '@/assets/icons/book.svg';
import ShareIcon from '@/assets/icons/share-02.svg';
import StarIcon from '@/assets/icons/star.svg';

interface TaskCardProps {
  task: RewardTask;
  completed?: boolean;
  eligible?: boolean;
  claiming?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

const COIN_ICON = require('../../assets/illustration/gamification/single.png');

// A matching black icon per mission, shown in the yellow thumb square.
type IconCmp = React.FC<{ width?: number; height?: number; color?: string }>;
const TASK_ICON: Record<string, IconCmp> = {
  verify_citizen: CheckIcon,
  activate_push: BellIcon,
  add_profile_picture: ImageIcon,
  complete_profile: UserIcon,
  first_login: SparklesIcon,
  attend_event: CalendarIcon,
  join_first_event: TicketIcon,
  read_help_hub: BookIcon,
  refer_friend: ShareIcon,
  vote_on_proposal: StarIcon,
};
function taskIcon(key: string): IconCmp {
  if (TASK_ICON[key]) return TASK_ICON[key];
  if (/push|notif/.test(key)) return BellIcon;
  if (/picture|photo|avatar/.test(key)) return ImageIcon;
  if (/profile/.test(key)) return UserIcon;
  if (/citizen|verif/.test(key)) return CheckIcon;
  if (/referr|invite|friend/.test(key)) return ShareIcon;
  if (/event|veranst/.test(key)) return CalendarIcon;
  if (/help|hilfe|tipp/.test(key)) return BookIcon;
  if (/vote|poll|wahl/.test(key)) return StarIcon;
  if (/login|welcome|willkommen/.test(key)) return SparklesIcon;
  return StarIcon;
}

const YELLOW = '#E9B949';
const YELLOW_DARK = '#8A5A00';
const YELLOW_BG = '#FFFBEA';

export default function TaskCard({
  task,
  completed,
  eligible,
  claiming,
  disabled,
  onPress,
}: TaskCardProps) {
  const { colors, isDark } = useTheme();
  const primary = colors.primary;

  const variant: 'completed' | 'eligible' | 'default' = completed
    ? 'completed'
    : eligible
      ? 'eligible'
      : 'default';

  const borderColor =
    variant === 'completed' ? primary : variant === 'eligible' ? YELLOW : primary;
  const textColor =
    variant === 'completed' ? primary : variant === 'eligible' ? YELLOW_DARK : primary;
  const fillColor =
    variant === 'eligible' ? YELLOW : variant === 'completed' ? 'transparent' : 'transparent';
  const pressedFill =
    variant === 'eligible'
      ? YELLOW
      : variant === 'completed'
        ? isDark ? colors.surfaceSecondary : '#F3F4F6'
        : isDark ? '#22324c' : '#EEF4FB';

  const label = completed ? 'Erhalten ✓' : eligible ? 'Erhalten' : task.cta_label;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.thumb,
          { backgroundColor: isDark ? colors.surfaceSecondary : '#F1F2F4' },
        ]}
      >
        {React.createElement(taskIcon(task.key), { width: 22, height: 22, color: colors.textPrimary })}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {task.description}
        </Text>
        <View style={styles.footer}>
          <View style={styles.coinRow}>
            <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
            <Text style={[styles.coinAmount, { color: colors.textPrimary }]}>
              {task.coin_amount}
            </Text>
          </View>
          <Pressable
            onPress={onPress}
            disabled={disabled || claiming || completed}
            style={({ pressed }) => [
              styles.cta,
              {
                borderColor,
                backgroundColor: pressed ? pressedFill : fillColor,
                opacity: disabled ? 0.4 : 1,
              },
            ]}
          >
            {claiming ? (
              <ActivityIndicator color={variant === 'eligible' ? '#fff' : textColor} size="small" />
            ) : (
              <Text
                style={[
                  styles.ctaText,
                  { color: variant === 'eligible' ? '#fff' : textColor },
                ]}
              >
                {label}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbEmoji: {
    fontSize: 30,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  description: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coinIcon: {
    width: 20,
    height: 20,
  },
  coinAmount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  cta: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minWidth: 96,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
});
