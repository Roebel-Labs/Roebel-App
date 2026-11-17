/**
 * Settings of an independent account (a passkey-only person, no thirdweb login behind it): the
 * recovery banner, guardians, the account code / restore links, the warning email, and the keys
 * and messages section. No migration steps, no session switch, no detach row.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { passkeySessionOf } from '@/lib/passkey/active';
import { MIGRATION_STORE_KEY, loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import type { PasskeySession } from '@/lib/passkey/session';
import EmailRow from '@/components/passkey/EmailRow';
import GuardiansSection from '@/components/passkey/GuardiansSection';
import KeysAndMessagesSection from '@/components/passkey/KeysAndMessagesSection';
import { RecoveryBanner } from '@/components/passkey/RecoveryBanner';
import { Card, passkeyStyles } from '@/components/passkey/PasskeyUi';

/** The same record shape `finish()` in signin.ts writes for a Safe-only account. */
function recordFromSession(s: PasskeySession): MigrationRecord {
  return {
    credentialId: s.credentialId,
    x: s.x,
    y: s.y,
    safe: s.safe,
    ownerType: s.ownerType,
    owner: s.owner,
    status: 'passkeyCreated',
  };
}

export default function SovereignAccountSettings({ initialRecord }: { initialRecord: MigrationRecord | null }) {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const [record, setRecord] = useState<MigrationRecord | null>(initialRecord);

  useEffect(() => {
    if (record) return;
    let cancelled = false;
    (async () => {
      const existing = await loadMigrationRecord(secureKeyValueStorage).catch(() => null);
      if (cancelled) return;
      if (existing) {
        setRecord(existing);
        return;
      }
      const session = passkeySessionOf<PasskeySession>(account);
      if (!session) return;
      const rec = recordFromSession(session);
      await secureKeyValueStorage.setItem(MIGRATION_STORE_KEY, JSON.stringify(rec)).catch(() => undefined);
      if (!cancelled) setRecord(rec);
    })();
    return () => {
      cancelled = true;
    };
  }, [record, account]);

  if (!record) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <RecoveryBanner record={record} />

      <Text style={[styles.lede, { color: colors.textPrimary }]}>Dein unabhängiges Konto</Text>
      <Text style={[styles.subLede, { color: colors.textSecondary }]}>
        Nur du hast den Schlüssel. Richte einen Weg zurück ein, falls du dein Handy verlierst.
      </Text>

      <Text style={[passkeyStyles.sectionHeading, { color: colors.textSecondary }]}>WIEDERHERSTELLUNG</Text>
      <GuardiansSection record={record} />
      {/* recovery words: plan 2 */}
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
      <KeysAndMessagesSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 56, gap: 14 },
  lede: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 31 },
  subLede: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, marginTop: -6 },
  link: { gap: 4, minHeight: 48, justifyContent: 'center' },
});
