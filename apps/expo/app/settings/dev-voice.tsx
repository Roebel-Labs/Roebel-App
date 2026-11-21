// Entwicklermodus: "Sprachassistent testen" — Sprachgespräch mit Mecky über LiveKit (Voice Agent).
// The token comes from POST /api/live/act { action: 'voice_token' }, authorised with the live session
// of the test show (`testlauf`), so no new signed scope is needed. LiveKit itself is loaded lazily.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useMicrophonePermissions } from 'expo-camera';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { hasLiveKitNative } from '@/lib/live-guest-support';
import { fetchShow, liveActAs, liveErrorText } from '@/lib/live';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import type { VoiceAgentStageProps } from '@/components/voice/VoiceAgentStage';

const TEST_SHOW_SLUG = 'testlauf';

let StageCache: React.ComponentType<VoiceAgentStageProps> | null | undefined;
function loadStage(): React.ComponentType<VoiceAgentStageProps> | null {
  if (StageCache !== undefined) return StageCache;
  if (!hasLiveKitNative()) return (StageCache = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    StageCache = require('../../components/voice/VoiceAgentStage').default;
  } catch {
    StageCache = null;
  }
  return StageCache ?? null;
}

type Conn = { url: string; token: string };

export default function DevVoiceScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [conn, setConn] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => hasLiveKitNative());

  const start = useCallback(async () => {
    if (!account || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Ask before connecting, so Mecky does not greet behind the permission dialog.
      const perm = micPerm?.granted ? micPerm : await requestMicPerm();
      if (!perm.granted) { setError('Bitte erlaube den Zugriff auf das Mikrofon.'); return; }
      const shown = await fetchShow(TEST_SHOW_SLUG);
      if (!shown) { setError('Die Test-Übertragung fehlt.'); return; }
      const r = await liveActAs<{ livekit_url: string; token: string }>(
        account, shown.show.id, { action: 'voice_token' },
      );
      if (!r.ok) { setError(r.code === 'VOICE_UNAVAILABLE' || r.code === 'RATE_LIMITED' ? r.message : liveErrorText(r.code, r.message)); return; }
      setConn({ url: r.data.livekit_url, token: r.data.token });
    } finally {
      setBusy(false);
    }
  }, [account, busy, micPerm, requestMicPerm]);

  const Stage = conn ? loadStage() : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Sprachassistent</Text>
        <View style={styles.headerSpacer} />
      </View>

      {conn && Stage ? (
        <Stage
          url={conn.url}
          token={conn.token}
          onEnd={() => setConn(null)}
          onError={(m) => { setConn(null); setError(m); }}
        />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Sprich mit Mecky</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Ein Testgespräch per Sprache. Mecky hört zu, antwortet laut und schreibt mit.
            Das Gespräch dauert höchstens 10 Minuten.
          </Text>
          {!supported && (
            <Text style={[styles.body, { color: colors.error }]}>
              Diese App-Version kann noch keine Sprachgespräche. Bitte aktualisiere die App im Store.
            </Text>
          )}
          {!account && (
            <Text style={[styles.body, { color: colors.textSecondary }]}>Bitte melde dich zuerst an.</Text>
          )}
          {error && <Text style={[styles.body, { color: colors.error }]}>{error}</Text>}
          <Pressable
            onPress={start}
            disabled={!supported || !account || busy}
            style={[styles.cta, { backgroundColor: colors.primary, opacity: !supported || !account ? 0.4 : 1 }]}
          >
            {busy
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.ctaText}>Gespräch starten</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.heading, fontSize: 17 },
  headerSpacer: { width: 40 },
  content: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  title: { fontFamily: fontFamily.heading, fontSize: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  cta: { marginTop: 12, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 16, color: '#ffffff' },
});
