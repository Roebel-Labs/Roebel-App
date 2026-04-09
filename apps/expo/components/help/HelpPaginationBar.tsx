// apps/expo/components/help/HelpPaginationBar.tsx

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  actionLabel?: string | null;
  onAction?: () => void;
};

export default function HelpPaginationBar({ onPrev, onNext, hasPrev, hasNext, actionLabel, onAction }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <Pressable
        onPress={onPrev}
        disabled={!hasPrev}
        style={[styles.arrowButton, { backgroundColor: colors.surface, opacity: hasPrev ? 1 : 0.3 }]}
      >
        <Text style={[styles.arrowText, { color: colors.textPrimary }]}>‹</Text>
      </Pressable>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.actionText, { color: colors.onPrimary }]}>{actionLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}

      <Pressable
        onPress={onNext}
        disabled={!hasNext}
        style={[styles.arrowButton, { backgroundColor: colors.surface, opacity: hasNext ? 1 : 0.3 }]}
      >
        <Text style={[styles.arrowText, { color: colors.textPrimary }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  spacer: {
    flex: 1,
  },
});
