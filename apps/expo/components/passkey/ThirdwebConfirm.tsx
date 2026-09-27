/**
 * "Einmal mit Google/E-Mail bestätigen": the existing thirdweb login, run on the stored wallet
 * instance OUTSIDE the connection manager (key-completion-runtime.confirmWithThirdweb), so the
 * app keeps running on the passkey session afterwards. Used only to re-derive keys that come
 * from the deterministic thirdweb signature (MACI, salt). Preview-gated screens only.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Account } from 'thirdweb/wallets';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

type Props = {
  /** Called with the thirdweb account once the login succeeded. */
  onConfirmed: (account: Account) => void;
  disabled?: boolean;
};

export default function ThirdwebConfirm({ onConfirmed, disabled }: Props) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'choose' | 'email' | 'code'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const rt = () => import('@/lib/passkey/key-completion-runtime');
  const google = () => run(async () => onConfirmed(await (await rt()).confirmWithThirdweb({ strategy: 'google' })));
  const sendCode = () =>
    run(async () => {
      await (await rt()).sendThirdwebEmailCode(email.trim());
      setMode('code');
    });
  const verify = () =>
    run(async () =>
      onConfirmed(await (await rt()).confirmWithThirdweb({ strategy: 'email', email: email.trim(), verificationCode: code.trim() })),
    );

  const off = busy || !!disabled;
  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }];

  return (
    <View style={styles.wrap}>
      {mode === 'choose' && (
        <>
          <Pressable
            onPress={google}
            disabled={off}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.primary, opacity: off ? 0.5 : 1 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Einmal mit Google bestätigen</Text>}
          </Pressable>
          <Pressable
            onPress={() => setMode('email')}
            disabled={off}
            accessibilityRole="button"
            style={[styles.button, styles.secondary, { borderColor: colors.border, opacity: off ? 0.5 : 1 }]}
          >
            <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Einmal mit E-Mail bestätigen</Text>
          </Pressable>
        </>
      )}
      {mode === 'email' && (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Deine bisherige E-Mail-Adresse"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={input}
          />
          <Pressable
            onPress={sendCode}
            disabled={off || !email.includes('@')}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.primary, opacity: off || !email.includes('@') ? 0.5 : 1 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Code senden</Text>}
          </Pressable>
        </>
      )}
      {mode === 'code' && (
        <>
          <Text style={[styles.small, { color: colors.textSecondary }]}>Wir haben dir einen Code an {email.trim()} geschickt.</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Code"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            style={input}
          />
          <Pressable
            onPress={verify}
            disabled={off || code.trim().length < 4}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.primary, opacity: off || code.trim().length < 4 ? 0.5 : 1 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Bestätigen</Text>}
          </Pressable>
        </>
      )}
      {error && <Text style={[styles.small, { color: colors.error }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  button: { borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondary: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#fff' },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 14, fontFamily: fontFamily.regular, fontSize: 15 },
});
