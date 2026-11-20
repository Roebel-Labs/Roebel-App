/**
 * One field for all 12 words (restore flows). Shows what is wrong once 12 words are there: an
 * unknown word or a failed checksum, before anything is created.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { normalizePhrase, phraseErrorMessage, validatePhrase, WORD_COUNT } from '@/lib/passkey/words';
import { BigButton } from './PasskeyUi';

export default function WordsInput({ onValid, busy = false }: { onValid: (phrase: string) => void; busy?: boolean }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const count = normalizePhrase(text).split(' ').filter(Boolean).length;
  const check = validatePhrase(text);
  const error = count >= WORD_COUNT && !check.ok ? phraseErrorMessage(check) : null;

  return (
    <View style={styles.wrap}>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        secureTextEntry={false}
        placeholder="Die 12 Wörter, mit Leerzeichen getrennt"
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: error ? colors.error : colors.border, backgroundColor: colors.surface }]}
      />
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      <BigButton label="Weiter" onPress={() => check.ok && onValid(check.phrase)} disabled={!check.ok} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  input: { minHeight: 140, borderWidth: 1, borderRadius: 14, padding: 16, fontFamily: fontFamily.medium, fontSize: 18, textAlignVertical: 'top' },
  error: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 21 },
});
