/**
 * Settings of an independent account (a passkey-only person, no thirdweb login behind it): the
 * recovery banner, guardians, the account code / restore links, the warning email, and the keys
 * and messages section. No migration steps, no session switch, no detach row.
 *
 * A 12-word session (expert path): the lede reads "Dein Konto mit 12 Wörtern", the row "Meine 12
 * Wörter" opens settings/my-words (while the 'words' surface is open), and plan 2's recovery-words
 * entry is hidden — the 12 words ARE the key here, there are no separate recovery words.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { passkeySessionOf } from '@/lib/passkey/active';
import type { MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import { isPasskeySurfaceAllowed } from '@/lib/passkey/gate';
import { isWordsOwner, type PasskeySession } from '@/lib/passkey/session';
import { ensureSovereignRecord } from '@/lib/passkey/sovereign-record';
import EmailRow from '@/components/passkey/EmailRow';
import GuardiansSection from '@/components/passkey/GuardiansSection';
import KeysAndMessagesSection from '@/components/passkey/KeysAndMessagesSection';
import { RecoveryBanner } from '@/components/passkey/RecoveryBanner';
import PendingWordsRestore from '@/components/passkey/PendingWordsRestore';
import RecoveryWordsEntry from '@/components/passkey/RecoveryWordsEntry';
import { BigButton, Card, Notice, passkeyStyles } from '@/components/passkey/PasskeyUi';

export default function SovereignAccountSettings({ initialRecord }: { initialRecord: MigrationRecord | null }) {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const [record, setRecord] = useState<MigrationRecord | null>(initialRecord);
  const [readFailed, setReadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const wordsSession = isWordsOwner(passkeySessionOf<PasskeySession>(account));
  const [wordsOpen, setWordsOpen] = useState(false);

  useEffect(() => {
    if (!wordsSession) return;
    let cancelled = false;
    isPasskeySurfaceAllowed('words')
      .catch(() => false)
      .then((ok) => {
        if (!cancelled) setWordsOpen(ok);
      });
    return () => {
      cancelled = true;
    };
  }, [wordsSession]);

  useEffect(() => {
    if (record) return;
    let cancelled = false;
    (async () => {
      // A failed read never writes a fresh record over the stored one (sovereign-record.ts).
      const r = await ensureSovereignRecord(secureKeyValueStorage, passkeySessionOf<PasskeySession>(account));
      if (cancelled) return;
      if (r.status === 'ok') setRecord(r.record);
      setReadFailed(r.status === 'error');
    })();
    return () => {
      cancelled = true;
    };
  }, [record, account, attempt]);

  if (!record) {
    return (
      <View style={styles.center}>
        {readFailed ? (
          <View style={styles.retry}>
            <Notice tone="error" text="Dein Konto-Status konnte gerade nicht gelesen werden. Bitte versuche es noch einmal." />
            <BigButton
              label="Erneut versuchen"
              onPress={() => {
                setReadFailed(false);
                setAttempt((n) => n + 1);
              }}
            />
          </View>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <RecoveryBanner record={record} />

      <Text style={[styles.lede, { color: colors.textPrimary }]}>{wordsSession ? 'Dein Konto mit 12 Wörtern' : 'Dein unabhängiges Konto'}</Text>
      <Text style={[styles.subLede, { color: colors.textSecondary }]}>
        Nur du hast den Schlüssel. Richte einen Weg zurück ein, falls du dein Handy verlierst.
      </Text>

      <Text style={[passkeyStyles.sectionHeading, { color: colors.textSecondary }]}>WIEDERHERSTELLUNG</Text>
      {wordsSession && wordsOpen ? (
        <Card>
          <Pressable onPress={() => router.push('/settings/my-words' as any)} accessibilityRole="button" style={styles.link}>
            <Text style={[passkeyStyles.label, { color: colors.primary }]}>Meine 12 Wörter</Text>
          </Pressable>
        </Card>
      ) : null}
      <GuardiansSection record={record} />
      <PendingWordsRestore safe={record.safe} />
      {wordsSession ? null : <RecoveryWordsEntry safe={record.safe} />}
      <Card>
        <Pressable onPress={() => router.push('/passkey/code' as any)} accessibilityRole="button" style={styles.link}>
          <Text style={[passkeyStyles.label, { color: colors.primary }]}>Mein Konto-Code</Text>
        </Pressable>
      </Card>
      <Card>
        <Pressable onPress={() => router.push('/passkey/restore' as any)} accessibilityRole="button" style={styles.link}>
          <Text style={[passkeyStyles.label, { color: colors.primary }]}>Konto wiederherstellen</Text>
          <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
            Neues Handy? Deine Vertrauenspersonen helfen dir zurück in dein Konto.
          </Text>
        </Pressable>
      </Card>

      <EmailRow />

      <Text style={[passkeyStyles.sectionHeading, { color: colors.textSecondary }]}>SCHLÜSSEL & NACHRICHTEN</Text>
      <KeysAndMessagesSection words={wordsSession} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  retry: { alignSelf: 'stretch', gap: 14 },
  content: { padding: 16, paddingBottom: 56, gap: 14 },
  lede: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 31 },
  subLede: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, marginTop: -6 },
  link: { gap: 4, minHeight: 48, justifyContent: 'center' },
});
