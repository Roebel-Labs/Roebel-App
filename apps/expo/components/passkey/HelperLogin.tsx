/**
 * The thirdweb login buttons for a recovery helper (Google / Apple / E-Mail code, no phone).
 * Only collects the choice (and sends the E-Mail code); the caller runs the login through
 * lib/passkey/recovery-helper-runtime.ts, outside the connection manager.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { HelperLogin as HelperLoginChoice } from '@/lib/passkey/recovery-helper-runtime';

type Props = {
  onLogin: (login: HelperLoginChoice) => Promise<void> | void;
  busy?: boolean;
  disabled?: boolean;
};

export default function HelperLogin({ onLogin, busy = false, disabled = false }: Props) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'choose' | 'email' | 'code'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const off = busy || sending || disabled;
  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }];

  const sendCode = async () => {
    if (off) return;
    setSending(true);
    setError(null);
    try {
      const rt = await import('@/lib/passkey/recovery-helper-runtime');
      await rt.sendHelperEmailCode(email.trim());
      setMode('code');
    } catch {
      setError('Der Code konnte nicht gesendet werden. Bitte prüfe die Adresse.');
    } finally {
      setSending(false);
    }
  };

  const button = (label: string, onPress: () => void, primary: boolean, enabled = true) => (
    <Pressable
      onPress={onPress}
      disabled={off || !enabled}
      accessibilityRole="button"
      style={[
        styles.button,
        primary ? { backgroundColor: colors.primary } : [styles.secondary, { borderColor: colors.border }],
        { opacity: off || !enabled ? 0.5 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? colors.onPrimary : colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      {mode === 'choose' && (
        <>
          {button('Mit Google', () => onLogin({ strategy: 'google' }), true)}
          {button('Mit Apple', () => onLogin({ strategy: 'apple' }), false)}
          {button('Mit E-Mail', () => setMode('email'), false)}
        </>
      )}
      {mode === 'email' && (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="E-Mail-Adresse"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={input}
          />
          {sending ? <ActivityIndicator color={colors.primary} /> : null}
          {button('Code senden', sendCode, true, email.includes('@'))}
          {button('Zurück', () => setMode('choose'), false)}
        </>
      )}
      {mode === 'code' && (
        <>
          <Text style={[styles.small, { color: colors.textSecondary }]}>Wir haben dir einen Code per E-Mail geschickt.</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Code"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            style={input}
          />
          {button(
            'Bestätigen',
            () => onLogin({ strategy: 'email', email: email.trim(), verificationCode: code.trim() }),
            true,
            code.trim().length >= 4,
          )}
          {button('Zurück', () => setMode('email'), false)}
        </>
      )}
      {error ? <Text style={[styles.small, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  button: { borderRadius: 16, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondary: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  small: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 56, paddingHorizontal: 16, fontFamily: fontFamily.regular, fontSize: 17 },
});
