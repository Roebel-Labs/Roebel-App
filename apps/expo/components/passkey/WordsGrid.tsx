/**
 * The 12 recovery words, numbered 1–12 in two columns, large type. Display only: no copy button,
 * no selectable text (the words go on paper, never to the clipboard).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

export default function WordsGrid({ words }: { words: readonly string[] }) {
  const { colors } = useTheme();
  const half = Math.ceil(words.length / 2);
  const columns = [words.slice(0, half), words.slice(half)];
  return (
    <View style={[styles.grid, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Deine 12 Wörter">
      {columns.map((col, c) => (
        <View key={c} style={styles.column}>
          {col.map((w, i) => {
            const n = c * half + i + 1;
            return (
              <View key={n} style={styles.cell}>
                <Text style={[styles.number, { color: colors.textTertiary }]}>{n}</Text>
                <Text style={[styles.word, { color: colors.textPrimary }]} selectable={false}>
                  {w}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, gap: 16 },
  column: { flex: 1, gap: 12 },
  cell: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  number: { fontFamily: fontFamily.medium, fontSize: 14, width: 22, textAlign: 'right' },
  word: { fontFamily: fontFamily.semiBold, fontSize: 22, flexShrink: 1 },
});
