import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { chatFont, useChatTokens } from './tokens';

export type TopicChipProps = { label: string; style?: StyleProp<ViewStyle> };

/** Grey topic chip next to the thread name (ref 6, "Meal prepping"). */
export function TopicChip({ label, style }: TopicChipProps) {
  const t = useChatTokens();
  return (
    <View style={[styles.chip, { backgroundColor: t.chipBackground }, style]}>
      <Text numberOfLines={1} style={[styles.text, { color: t.chipText }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 22, borderRadius: 7, paddingHorizontal: 7, justifyContent: 'center', flexShrink: 1, minWidth: 0 },
  text: { fontFamily: chatFont.medium, fontSize: 15, letterSpacing: -0.1 },
});

export default TopicChip;
