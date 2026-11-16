// Newsletter sign-up inside the news screen. Double opt-in runs on the server;
// the card only collects the address and shows the server's answer.
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { isValidEmail, subscribeToNewsletter } from '@/lib/newsletter';

export default function NewsletterSignupCard() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const canSubmit = isValidEmail(email) && !busy;

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    const res = await subscribeToNewsletter(email);
    setResult(res);
    if (res.success) setEmail('');
    setBusy(false);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Newsletter</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Einmal pro Woche Neues aus Röbel und aus der App per E-Mail. Kostenlos, jederzeit abbestellbar.
      </Text>
      <View style={styles.row}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="deine@email.de"
          placeholderTextColor={colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={onSubmit}
          editable={!busy}
          accessibilityLabel="E-Mail-Adresse für den Newsletter"
          style={[
            styles.input,
            { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
          ]}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Newsletter abonnieren"
          style={[styles.button, { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Anmelden</Text>
          )}
        </Pressable>
      </View>
      {result && (
        <Text style={[styles.note, { color: result.success ? colors.success : colors.error }]}>{result.message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'MonaSans-Regular',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
  },
  button: {
    height: 44,
    minWidth: 96,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'MonaSans-SemiBold',
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'MonaSans-Regular',
    marginTop: 10,
  },
});
