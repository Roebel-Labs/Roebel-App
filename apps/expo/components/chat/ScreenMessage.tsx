import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlackPillButton } from './BlackPillButton';
import { chatFont, useChatTokens } from './tokens';

export type ScreenMessageProps = {
  title?: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Centred empty / error state of a chat screen, with an optional retry button. */
export function ScreenMessage({ title, text, actionLabel, onAction }: ScreenMessageProps) {
  const t = useChatTokens();
  return (
    <View style={styles.center}>
      {title ? <Text style={[styles.title, { color: t.textPrimary }]}>{title}</Text> : null}
      <Text style={[styles.text, { color: t.textSecondary }]}>{text}</Text>
      {actionLabel && onAction ? <BlackPillButton label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 8 },
  title: { fontFamily: chatFont.semiBold, fontSize: 18, textAlign: 'center' },
  text: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  action: { marginTop: 14, alignSelf: 'stretch' },
});

export default ScreenMessage;
