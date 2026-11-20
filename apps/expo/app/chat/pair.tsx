import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useChatAccount } from '@/context/ChatContext';
import { approvePairing, lookupPairing, type PairingLookup } from '@/lib/chat/api';

type Phase = 'loading' | 'ready' | 'busy' | 'done' | 'error';

/**
 * roebel://chat/pair?code=XXXX — confirm Ortis Studio on a computer with this account.
 * Always an explicit tap after showing the device and the code (device-code phishing).
 */
export default function ChatPairScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const account = useChatAccount();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [info, setInfo] = useState<PairingLookup | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setPhase('error');
      setMessage('Kein Code im Link.');
      return;
    }
    let alive = true;
    lookupPairing(String(code))
      .then((r) => {
        if (!alive) return;
        setInfo(r);
        setPhase('ready');
      })
      .catch((e: Error) => {
        if (!alive) return;
        setPhase('error');
        setMessage(e.message || 'Der Code konnte nicht geprüft werden.');
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  const confirm = async () => {
    if (!account || !info) return;
    setPhase('busy');
    setMessage(null);
    try {
      await approvePairing(account, String(code));
      setPhase('done');
    } catch (e) {
      setPhase('ready');
      setMessage((e as Error).message || 'Das hat nicht geklappt.');
    }
  };

  const pending = info?.state === 'pending';
  return (
    <>
      <Stack.Screen options={{ presentation: 'modal', headerShown: false }} />
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ortis Studio verbinden</Text>
        {phase === 'loading' && <ActivityIndicator style={styles.spinner} color={colors.primary} />}
        {info && (
          <>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold }}>{info.deviceName}</Text> möchte sich mit
              deinem Konto verbinden.
            </Text>
            <View style={[styles.codeBox, { borderColor: colors.border }]}>
              <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>CODE</Text>
              <Text style={[styles.code, { color: colors.textPrimary }]}>{info.code}</Text>
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Bestätige nur, wenn genau dieser Code gerade auf deinem eigenen Bildschirm steht. Ortis Studio kann dann in
              deinem Namen mit deinen Assistenten schreiben.
            </Text>
            {info.state === 'expired' && <Text style={[styles.note, { color: colors.textPrimary }]}>Der Code ist abgelaufen. Zeig in Ortis Studio einen neuen an.</Text>}
            {!pending && info.state !== 'expired' && phase !== 'done' && (
              <Text style={[styles.note, { color: colors.textPrimary }]}>Dieser Code wurde schon verwendet.</Text>
            )}
          </>
        )}
        {phase === 'done' && <Text style={[styles.note, { color: colors.textPrimary }]}>Verbunden. Ortis Studio meldet sich gleich an.</Text>}
        {message && <Text style={[styles.note, { color: '#D92D20' }]}>{message}</Text>}
        {!account && phase !== 'loading' && (
          <Text style={[styles.note, { color: colors.textPrimary }]}>Bitte melde dich zuerst in der Röbel App an.</Text>
        )}
        <View style={styles.spacer} />
        {pending && phase !== 'done' && account && (
          <Pressable
            accessibilityRole="button"
            onPress={confirm}
            disabled={phase === 'busy'}
            style={[styles.primary, { backgroundColor: colors.primary, opacity: phase === 'busy' ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryText}>{phase === 'busy' ? 'Verbinde …' : 'Verbinden'}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}>
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>{phase === 'done' ? 'Fertig' : 'Abbrechen'}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  title: { fontFamily: fontFamily.heading, fontSize: 26 },
  spinner: { marginTop: 32 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 22, marginTop: 12 },
  codeBox: { marginTop: 20, borderWidth: 1, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  codeLabel: { fontFamily: fontFamily.medium, fontSize: 12, letterSpacing: 1.2 },
  code: { fontFamily: fontFamily.monoMedium, fontSize: 30, letterSpacing: 4, marginTop: 4 },
  hint: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginTop: 16 },
  note: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 21, marginTop: 16 },
  spacer: { flex: 1 },
  primary: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
