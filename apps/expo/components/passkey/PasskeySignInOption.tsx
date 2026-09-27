/**
 * "Unabhängiges Konto" — the passkey sign-in / sign-up option on the Anmelden sheet.
 *
 * Renders NOTHING unless the passkey preview gate is open (production returns before any network
 * read), so the Anmelden sheet on production looks exactly as before. The thirdweb options below
 * it are untouched.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSetActiveWallet } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { isPasskeyPreviewAllowed } from '@/lib/passkey/gate';
import type { SignInResult } from '@/lib/passkey/signin';

type Busy = 'signIn' | 'signUp' | null;

export default function PasskeySignInOption({ onSignedIn }: { onSignedIn?: () => void }) {
  const { colors } = useTheme();
  const setActiveWallet = useSetActiveWallet();
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    isPasskeyPreviewAllowed()
      .catch(() => false)
      .then((ok) => {
        if (!cancelled) setAllowed(ok);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(
    async (kind: Exclude<Busy, null>) => {
      if (busy) return;
      setBusy(kind);
      setError(null);
      try {
        const rt = await import('@/lib/passkey/signin-runtime');
        const { signInWithPasskey, signUpWithPasskey } = await import('@/lib/passkey/signin');
        const deps = rt.createSignInDeps();
        const res: SignInResult = kind === 'signIn' ? await signInWithPasskey(deps) : await signUpWithPasskey('Röbel-Konto', deps);
        if (res.status === 'signedIn') {
          await rt.activatePasskeySession(res.session, setActiveWallet);
          onSignedIn?.();
        } else if (res.status === 'error') {
          setError(res.message);
        }
      } catch {
        setError('Etwas ist schiefgelaufen. Bitte versuche es erneut.');
      } finally {
        setBusy(null);
      }
    },
    [busy, setActiveWallet, onSignedIn],
  );

  if (!allowed) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.card, { borderColor: open ? colors.primary : colors.border, backgroundColor: colors.surfaceSecondary }]}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>Unabhängiges Konto</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Mit Passkey · Fingerabdruck oder Gesicht, ohne E-Mail. Nur du hast den Schlüssel.
        </Text>
      </Pressable>

      {open && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => run('signIn')}
            disabled={!!busy}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.primary, opacity: busy && busy !== 'signIn' ? 0.5 : 1 }]}
          >
            {busy === 'signIn' ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Mit Passkey anmelden</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => run('signUp')}
            disabled={!!busy}
            accessibilityRole="button"
            style={[styles.button, styles.secondary, { borderColor: colors.primary, opacity: busy && busy !== 'signUp' ? 0.5 : 1 }]}
          >
            {busy === 'signUp' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.primary }]}>Neues unabhängiges Konto erstellen</Text>
            )}
          </Pressable>
          {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
        </View>
      )}

      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.textSecondary }]}>oder</Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, minHeight: 56, gap: 4 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 18 },
  subtitle: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  actions: { marginTop: 12, gap: 10 },
  button: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondary: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 16, textAlign: 'center' },
  error: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontFamily: fontFamily.regular, fontSize: 14 },
});
