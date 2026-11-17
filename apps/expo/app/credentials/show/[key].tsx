/**
 * Vorzeigen: one held credential as a QR code with a 300-second presentation code. Opened from the
 * profile card ("Vorzeigen"); `key` is the type id. The code is made once when the screen opens
 * (at most one signature: the account's; none for an account that signs silently) and again on
 * "Neu erzeugen" after it ran out. Never shows the account address.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus, frameStyles } from '@/components/credentials/CredentialScreenFrame';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { useHeld } from '@/lib/credreg/held';
import { qrPayload, showCredential } from '@/lib/credreg/present';

type Shown = { owner: string; typeKey: string; code: string; expiresAtSec: number };

const nowSec = () => Math.floor(Date.now() / 1000);

function formatLeft(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatUntil(validUntil: number | null): string {
  if (validUntil === null) return 'Unbefristet';
  return `Gültig bis ${new Date(validUntil * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

export default function ShowCredentialScreen() {
  const { key: keyParam } = useLocalSearchParams<{ key: string }>();
  const typeKey = typeof keyParam === 'string' ? keyParam.toLowerCase() : '';
  const { colors } = useTheme();
  const account = useActiveAccount();
  const gate = useCredentialsGate();
  const { held, loading } = useHeld();
  const address = account?.address?.toLowerCase() ?? '';
  const credential = held.find((h) => h.typeId.toLowerCase() === typeKey) ?? null;

  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowSec);
  const autoStarted = useRef<string | null>(null);

  const current = shown && shown.owner === address && shown.typeKey === typeKey ? shown : null;
  const left = current ? current.expiresAtSec - now : 0;
  const expired = !!current && left <= 0;

  const generate = useCallback(async () => {
    if (!account || !credential || busy) return;
    setBusy(true);
    setError(null);
    const owner = account.address.toLowerCase();
    const result = await showCredential(account, credential);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNow(nowSec());
    setShown({ owner, typeKey, code: result.code, expiresAtSec: result.expiresAtSec });
  }, [account, credential, busy, typeKey]);

  // One code when the credential is known; a new one only on request.
  useEffect(() => {
    if (!credential || !address) return;
    const marker = `${address}:${typeKey}`;
    if (autoStarted.current === marker) return;
    autoStarted.current = marker;
    void generate();
  }, [credential, address, typeKey, generate]);

  useEffect(() => {
    if (!current || expired) return;
    const timer = setInterval(() => setNow(nowSec()), 1000);
    return () => clearInterval(timer);
  }, [current, expired]);

  if (gate === null || (gate === true && account && !credential && loading)) {
    return (
      <CredentialScreenFrame title="Vorzeigen">
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (gate === false) {
    return (
      <CredentialScreenFrame title="Vorzeigen">
        <CredentialStatus title="Noch nicht verfügbar" message="Ausweise gibt es in deiner App bald." />
      </CredentialScreenFrame>
    );
  }
  if (!account) {
    return (
      <CredentialScreenFrame title="Vorzeigen">
        <CredentialStatus title="Bitte melde dich an" message="Melde dich an, um deinen Ausweis vorzuzeigen." />
      </CredentialScreenFrame>
    );
  }
  if (!credential) {
    return (
      <CredentialScreenFrame title="Vorzeigen">
        <CredentialStatus title="Nicht gefunden" message="Diesen Ausweis findest du nicht in deinem Profil." />
      </CredentialScreenFrame>
    );
  }

  const title = credential.title;
  const orgName = credential.orgName;
  const validity = formatUntil(credential.validUntil);

  return (
    <CredentialScreenFrame title="Vorzeigen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
          {credential.imageUrl ? <Image source={{ uri: credential.imageUrl }} style={styles.image} /> : null}
          <Text style={[styles.typeTitle, { color: colors.textPrimary }]}>{title}</Text>
          {orgName ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{orgName}</Text> : null}
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{validity}</Text>
        </View>

        <View style={styles.qrBlock}>
          {current && !expired ? (
            <>
              <View style={styles.qrFrame}>
                <QRCode value={qrPayload(current.code)} size={240} backgroundColor="#FFFFFF" color="#000000" />
              </View>
              <Text style={[styles.countdown, { color: colors.textPrimary }]}>{`Gültig noch ${formatLeft(left)}`}</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Lass den Code mit der Röbel App scannen. Er gilt einmal und nur fünf Minuten.
              </Text>
            </>
          ) : busy ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.hint, { color: colors.textSecondary }]}>Code wird erzeugt …</Text>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {expired ? 'Der Code ist abgelaufen.' : 'Noch kein Code.'}
              </Text>
            </View>
          )}
        </View>

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

        {(expired || (!current && !busy)) ? (
          <Pressable
            onPress={() => void generate()}
            disabled={busy}
            style={[frameStyles.primary, { backgroundColor: colors.primary }, busy && frameStyles.busy]}
            accessibilityRole="button"
            accessibilityLabel="Neu erzeugen"
          >
            <Text style={[frameStyles.primaryText, { color: colors.onPrimary }]}>Neu erzeugen</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20, alignItems: 'stretch' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  image: { width: 56, height: 56, borderRadius: 12, marginBottom: 8 },
  typeTitle: { fontSize: 18, fontFamily: fontFamily.semiBold },
  meta: { fontSize: 14, fontFamily: fontFamily.regular },
  qrBlock: { alignItems: 'center', gap: 12 },
  qrFrame: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF' },
  placeholder: { width: 272, height: 272, alignItems: 'center', justifyContent: 'center', gap: 12 },
  countdown: { fontSize: 20, fontFamily: fontFamily.semiBold, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 14, fontFamily: fontFamily.regular, textAlign: 'center', lineHeight: 20 },
  error: { fontSize: 14, fontFamily: fontFamily.regular, textAlign: 'center' },
});
