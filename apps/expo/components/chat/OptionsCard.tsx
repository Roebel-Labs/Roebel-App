import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatFont, chatSize, chatType, useChatTokens } from './tokens';

export type OptionsCardProps = {
  question: string;
  options: { key: string; label: string }[];
  selected?: string | null;
  dismissed?: boolean;
  onSelect?: (key: string) => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const LETTERS = 'ABCDEFGHIJ';

/**
 * Lettered options card (ref 7). Answered → one row with green check
 * (ref 11); dismissed → faded rows + "verworfen" (ref 13).
 */
export function OptionsCard({ question, options, selected, dismissed, onSelect, onLongPress, style }: OptionsCardProps) {
  const t = useChatTokens();
  const chosen = selected ? options.find((o) => o.key === selected) : undefined;
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[styles.card, { backgroundColor: t.bubbleBot }, style]}
    >
      <Text style={[chatType.bodyMedium, styles.question, { color: t.textPrimary }]}>{question}</Text>
      <View style={[styles.box, { backgroundColor: t.optionBox, borderColor: t.optionBorder }]}>
        {chosen ? (
          <View style={styles.selectedRow}>
            <Text style={[chatType.body, styles.label, { color: t.textPrimary }]}>{chosen.label}</Text>
            <Feather name="check" size={20} color={t.check} />
          </View>
        ) : (
          options.map((o, i) => (
            <Pressable
              key={o.key}
              disabled={dismissed || !onSelect}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect?.(o.key);
              }}
              style={({ pressed }) => [
                styles.row,
                i > 0 ? { borderTopWidth: 1, borderTopColor: t.optionBorder } : null,
                pressed ? { backgroundColor: t.chipBackground } : null,
              ]}
            >
              <View style={[styles.letter, { backgroundColor: t.optionLetterBg }, dismissed && styles.faded]}>
                <Text style={[styles.letterText, { color: t.optionLetterText }]}>{LETTERS[i] ?? '•'}</Text>
              </View>
              <Text
                numberOfLines={2}
                style={[chatType.body, styles.label, { color: dismissed ? t.textSecondary : t.textPrimary }]}
              >
                {o.label}
              </Text>
            </Pressable>
          ))
        )}
      </View>
      {dismissed && !chosen ? <Text style={[styles.dismissed, { color: t.textTertiary }]}>verworfen</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    width: chatSize.bubbleMaxWidth,
    borderRadius: chatSize.bubbleRadius,
    padding: 14,
    paddingTop: 12,
  },
  question: { marginBottom: 12 },
  box: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: { minHeight: 41, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  letter: { width: 23, height: 23, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  letterText: { fontFamily: chatFont.regular, fontSize: 14 },
  faded: { opacity: 0.6 },
  label: { flex: 1 },
  selectedRow: { minHeight: 41, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9 },
  dismissed: { fontFamily: chatFont.regular, fontSize: 15, marginTop: 12, marginBottom: 2 },
});

export default OptionsCard;
