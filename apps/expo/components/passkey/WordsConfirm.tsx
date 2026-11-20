/**
 * Asks for three of the words (positions from `pickConfirmPositions`) so the person proves they
 * wrote them down. Calls `onConfirmed` only when all three match.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { confirmMatches } from '@/lib/passkey/words';
import { BigButton, Notice } from './PasskeyUi';

export default function WordsConfirm({
  phrase,
  positions,
  onConfirmed,
  busy = false,
}: {
  phrase: string;
  positions: readonly number[];
  onConfirmed: () => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [wrong, setWrong] = useState(false);
  const complete = positions.every((p) => (answers[p] ?? '').trim().length > 0);

  const onCheck = () => {
    const subset = Object.fromEntries(positions.map((p) => [p, answers[p] ?? '']));
    if (confirmMatches(phrase, subset)) {
      setWrong(false);
      onConfirmed();
    } else {
      setWrong(true);
    }
  };

  return (
    <View style={styles.wrap}>
      {positions.map((p) => (
        <View key={p} style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{`Gib Wort ${p + 1} ein`}</Text>
          <TextInput
            value={answers[p] ?? ''}
            onChangeText={(t) => setAnswers((a) => ({ ...a, [p]: t }))}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            contextMenuHidden
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
        </View>
      ))}
      {wrong ? <Notice tone="error" text="Das passt noch nicht. Schau auf deinem Zettel nach." /> : null}
      <BigButton label="Weiter" onPress={onCheck} disabled={!complete} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  field: { gap: 6 },
  label: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontFamily: fontFamily.medium, fontSize: 20 },
});
