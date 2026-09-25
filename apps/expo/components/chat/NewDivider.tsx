import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { chatFont, useChatTokens } from './tokens';

export type NewDividerProps = { label?: string; style?: StyleProp<ViewStyle> };

/** Blue unread divider "NEU" (ref 16). */
export function NewDivider({ label = 'NEU', style }: NewDividerProps) {
  const t = useChatTokens();
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.line, { backgroundColor: t.newDividerLine }]} />
      <Text style={[styles.text, { color: t.newDivider }]}>{label}</Text>
      <View style={[styles.line, { backgroundColor: t.newDividerLine }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 16 },
  line: { flex: 1, height: 1 },
  text: { fontFamily: chatFont.semiBold, fontSize: 13, letterSpacing: 1 },
});

export default NewDivider;
