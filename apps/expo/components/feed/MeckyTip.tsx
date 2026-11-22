import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

import { AnimatedMascot } from '@/components/chat/AnimatedMascot';
import { meckyAnimationUrl } from '@/lib/chat/avatar-picture';

const MECKY_AVATAR = require('@/assets/illustration/mecky/welcome.png');
const MECKY_IDLE = meckyAnimationUrl('idle');

interface MeckyTipProps {
  text: string;
  actionLabel?: string;
  actionRoute?: string;
}

export default function MeckyTip({ text, actionLabel, actionRoute }: MeckyTipProps) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={actionRoute ? () => router.push(actionRoute as any) : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AnimatedMascot
        uri={MECKY_IDLE}
        size={40}
        mode="idle"
        placeholder={MECKY_AVATAR}
        style={[styles.avatar, { backgroundColor: colors.primaryLight }]}
      />
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.primary }]}>MECKY TIPP</Text>
        <Text style={[styles.text, { color: colors.textPrimary }]}>
          {text}
          {actionLabel && (
            <Text style={[styles.action, { color: colors.primary }]}> {actionLabel} →</Text>
          )}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: 'MonaSans-SemiBold',
    marginBottom: 4,
  },
  text: {
    fontSize: 13,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 19,
  },
  action: {
    fontFamily: 'MonaSans-SemiBold',
  },
});
