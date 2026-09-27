/**
 * Settings → Passkey → ANMELDUNG: "Mit Passkey anmelden" for a person who already connected their
 * passkey Safe (tranche 1 handover). Switches the APP SESSION to the passkey adapter wallet; the
 * thirdweb login is NOT signed out and stays an admin of the account until the later
 * "thirdweb trennen" step (not built). Only mounted behind the preview gate (the screen is gated).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useActiveWallet, useSetActiveWallet } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

export default function PasskeySessionSwitch() {
  const { colors } = useTheme();
  const wallet = useActiveWallet();
  const setActiveWallet = useSetActiveWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (wallet?.id === 'adapter') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.body, { color: colors.textPrimary }]}>Du bist mit deinem Passkey angemeldet.</Text>
        <Text style={[styles.small, { color: colors.textSecondary }]}>
          Deine bisherige Anmeldung (E-Mail oder Google/Apple) bleibt als Verwalter deines Kontos bestehen.
        </Text>
      </View>
    );
  }

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const rt = await import('@/lib/passkey/signin-runtime');
      const { signInFromMigrationRecord } = await import('@/lib/passkey/signin');
      const res = await signInFromMigrationRecord(rt.createSignInDeps());
      if (res.status === 'signedIn') await rt.activatePasskeySession(res.session, setActiveWallet);
      else if (res.status === 'error') setError(res.message);
    } catch {
      setError('Der Wechsel zum Passkey hat nicht geklappt. Bitte versuche es erneut.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.body, { color: colors.textPrimary }]}>
        Die App läuft dann über deinen Passkey. Deine bisherige Anmeldung wird nicht abgemeldet und bleibt
        Verwalter deines Kontos, bis du sie später trennst.
      </Text>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Mit Passkey anmelden</Text>}
      </Pressable>
      {error && <Text style={[styles.small, { color: colors.error }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  button: { borderRadius: 999, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#fff' },
});
