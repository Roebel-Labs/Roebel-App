// Entwicklermodus: "Sprachassistent testen" — Sprachgespräch mit Mecky über LiveKit (Voice Agent).
// The token comes from POST /api/live/act { action: 'voice_token' }, authorised with the live session
// of the test show (`testlauf`), so no new signed scope is needed. LiveKit itself is loaded lazily.
// Look = chat kit (components/chat): chat tokens, SettingsHeader, Mecky figure, black pill CTA.
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveAccount } from 'thirdweb/react';
import { useMicrophonePermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { SettingsHeader } from '@/components/chat/SettingsHeader';
import { BlackPillButton } from '@/components/chat/BlackPillButton';
import { chatFont, chatSize, chatType, useChatTokens } from '@/components/chat/tokens';
import { VoiceFigure, VoiceStatusChip } from '@/components/voice/VoiceFigure';
import { hasLiveKitNative } from '@/lib/live-guest-support';
import { fetchShow, liveActAs, liveErrorText } from '@/lib/live';
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

function KeepAwake() {
  useKeepAwake('roebel-voice-agent');
  return null;
}

export default function DevVoiceScreen() {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const account = useActiveAccount();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [conn, setConn] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => hasLiveKitNative());

  // Big figure while idle, smaller once the transcript needs the room.
  const idleFigure = Math.round(Math.min(380, winH * 0.42));
  const activeFigure = Math.round(Math.min(260, winH * 0.3));

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
      if (!r.ok) {
        setError(r.code === 'VOICE_UNAVAILABLE' || r.code === 'RATE_LIMITED' ? r.message : liveErrorText(r.code, r.message));
        return;
      }
      setConn({ url: r.data.livekit_url, token: r.data.token });
    } finally {
      setBusy(false);
    }
  }, [account, busy, micPerm, requestMicPerm]);

  const Stage = conn ? loadStage() : null;
  const blocked = !supported || !account;

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      <SettingsHeader title="Mit Mecky sprechen" />

      {conn && Stage ? (
        <>
          <KeepAwake />
          <Stage
            url={conn.url}
            token={conn.token}
            figureHeight={activeFigure}
            bottomInset={insets.bottom}
            onEnd={() => setConn(null)}
            onError={(m) => { setConn(null); setError(m); }}
          />
        </>
      ) : (
        <View style={styles.flex}>
          <View style={styles.figure}>
            <VoiceFigure state="idle" height={idleFigure} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: t.textPrimary }]}>Sprich einfach los</Text>
            <Text style={[chatType.secondary, styles.center, { color: t.textSecondary }]}>
              Mecky hört zu, antwortet laut und schreibt mit. Ein Gespräch dauert höchstens 10 Minuten.
            </Text>
            {!supported && (
              <Text style={[chatType.caption, styles.center, { color: t.recordingRed }]}>
                Diese App-Version kann noch keine Sprachgespräche. Bitte aktualisiere die App im Store.
              </Text>
            )}
            {supported && !account && (
              <Text style={[chatType.caption, styles.center, { color: t.textSecondary }]}>
                Bitte melde dich zuerst an.
              </Text>
            )}
            {error && (
              <Text style={[chatType.caption, styles.center, { color: t.recordingRed }]}>{error}</Text>
            )}
          </View>
          <View style={styles.flex} />
          <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
            {error ? <View style={styles.chipGap} /> : <VoiceStatusChip state="idle" />}
            <BlackPillButton
              label="Gespräch starten"
              onPress={start}
              loading={busy}
              variant={blocked ? 'disabled' : 'primary'}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  figure: { paddingHorizontal: chatSize.screenPadH, paddingTop: 8 },
  copy: { paddingHorizontal: 28, paddingTop: 22, gap: 8, alignItems: 'center' },
  title: { fontFamily: chatFont.semiBold, fontSize: 26, letterSpacing: -0.4, textAlign: 'center' },
  center: { textAlign: 'center' },
  cta: { paddingHorizontal: chatSize.screenPadH, gap: 14 },
  chipGap: { height: 0 },
});
