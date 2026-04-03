import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

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
      style={[styles.container, { backgroundColor: colors.primaryLight }]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.avatarEmoji}>🐟</Text>
      </View>
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
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    gap: 12,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  text: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  action: {
    fontFamily: 'Inter-SemiBold',
  },
});
