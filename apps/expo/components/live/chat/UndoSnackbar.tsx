import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { F } from '../tokens';

type Props = {
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** Auto-hide after this long (ms). */
  duration?: number;
  bottom?: number;
};

/** Dark snackbar with one action ("Rückgängig"), same look in every theme. */
export default function UndoSnackbar({ message, actionLabel, onAction, onDismiss, duration = 5000, bottom = 12 }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);
  if (!message) return null;
  return (
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} style={[styles.bar, { bottom }]}>
      <Text style={styles.text} numberOfLines={2}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.action} accessibilityRole="button">
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46,
    paddingLeft: 16, paddingRight: 8, borderRadius: 10, backgroundColor: '#26282C',
  },
  text: { flex: 1, color: '#FFFFFF', fontSize: 14, fontFamily: F.medium },
  action: { paddingHorizontal: 10, paddingVertical: 8 },
  actionText: { color: '#7ABBF2', fontSize: 14, fontFamily: F.bold },
});
