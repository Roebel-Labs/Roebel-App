/**
 * "Mein Konto-Code": a QR with roebel://passkey/guardian?safe=<my passkey Safe>&name=<my name>,
 * so a family member can add me as their Vertrauensperson. Works with a passkey only (no
 * citizenship, no thirdweb login): without a passkey on this device the screen creates one.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import { BigButton, Notice, ScreenHeader, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import PasskeyQrCard from '@/components/passkey/PasskeyQrCard';
import { buildGuardianLink, sanitizeDisplayName } from '@/lib/passkey/deeplinks';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import { ensureStandalonePasskey } from '@/lib/passkey/standalone';
import { loadOwnName, saveOwnName } from '@/lib/passkey/guardians-runtime';
import { createPasskey } from '@/lib/passkey/webauthn';

export default function KontoCodeScreen() {
  const { colors } = useTheme();
  const { user } = useUser();
  const allowed = usePasskeyGate();
  const [record, setRecord] = useState<MigrationRecord | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const profileName = user?.display_name || user?.username || '';

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      const [rec, own] = await Promise.all([
        loadMigrationRecord(secureKeyValueStorage).catch(() => null),
        loadOwnName(),
      ]);
      if (cancelled) return;
      setRecord(rec);
      setName(own || profileName);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, profileName]);

  const onCreate = async () => {
    const clean = sanitizeDisplayName(name);
    if (!clean) {
      setNotice('Bitte gib deinen Vornamen ein.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const r = await ensureStandalonePasskey(clean, { storage: secureKeyValueStorage, createPasskey });
      if (r.status === 'cancelled') return;
      if (r.status === 'error') {
        setNotice(r.message);
        return;
      }
      await saveOwnName(clean).catch(() => undefined);
      setName(clean);
      setRecord(r.record);
    } finally {
      setBusy(false);
    }
  };

  if (!allowed || record === undefined) {
    return (
      <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]}>
        <View style={passkeyStyles.center}>{allowed === false ? null : <ActivityIndicator color={colors.primary} />}</View>
      </SafeAreaView>
    );
  }

  const displayName = sanitizeDisplayName(name) ?? 'Mein Konto';

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Mein Konto-Code" />
      <ScrollView contentContainerStyle={passkeyStyles.content} keyboardShouldPersistTaps="handled">
        {record ? (
          <>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              Zeig diesen Code jemandem, der dich als Vertrauensperson eintragen möchte. Er scannt ihn in seiner App.
            </Text>
            <PasskeyQrCard
              value={buildGuardianLink(record.safe, displayName)}
              name={displayName}
              shareMessage={`${displayName} kann deine Vertrauensperson werden. Öffne diesen Link in der Röbel-App:`}
            />
          </>
        ) : (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Erst ein Passkey, dann dein Code.</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              Dein Handy merkt sich dich per Fingerabdruck oder Gesichtserkennung. Kein Passwort, keine Kosten.
            </Text>
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Dein Vorname</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="z. B. Anna"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
              maxLength={60}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <BigButton label="Mit Fingerabdruck einrichten" onPress={onCreate} busy={busy} />
          </>
        )}
        {notice ? <Notice tone="error" text={notice} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  inputLabel: { fontFamily: fontFamily.semiBold, fontSize: 16, marginTop: 4 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontFamily: fontFamily.regular, fontSize: 18 },
});
