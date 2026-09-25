import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatFont, useChatTokens } from './tokens';

export type ReplyQuoteProps = {
  preview: string;
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
};

/** "↪ preview…" line above a bubble that answers another message (refs 8, 14). */
export function ReplyQuote({ preview, align = 'left', style }: ReplyQuoteProps) {
  const t = useChatTokens();
  return (
    <View style={[styles.row, align === 'right' ? styles.right : null, style]}>
      <Ionicons name="arrow-redo-outline" size={13} color={t.textTertiary} />
      <Text numberOfLines={1} style={[styles.text, { color: t.textTertiary }]}>
        {preview}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, maxWidth: '84%' },
  right: { alignSelf: 'flex-end' },
  text: { fontFamily: chatFont.regular, fontSize: 14, flexShrink: 1 },
});

export default ReplyQuote;
