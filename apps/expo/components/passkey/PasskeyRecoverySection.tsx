/**
 * Everything recovery-related on Settings → "Passkey & Wiederherstellung", in one slot so the
 * screen itself stays almost untouched: the v3 move step, "Vertrauenspersonen" (once the passkey
 * Safe is connected), and the links to "Mein Konto-Code" / "Konto wiederherstellen".
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { MigrationRecord } from '@/lib/passkey/migration';
import GuardiansSection from './GuardiansSection';
import MigrationV3Step from './MigrationV3Step';
import { Card, passkeyStyles } from './PasskeyUi';

export default function PasskeyRecoverySection({ record, connected }: { record: MigrationRecord | null; connected: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      {connected && record ? <MigrationV3Step record={record} /> : null}
      {connected && record ? (
        <GuardiansSection record={record} />
      ) : (
        <>
          <Text style={[passkeyStyles.sectionHeading, { color: colors.textSecondary }]}>VERTRAUENSPERSONEN</Text>
          <Card>
            <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
              Sobald dein Passkey verbunden ist, kannst du hier Vertrauenspersonen eintragen.
            </Text>
            <Pressable onPress={() => router.push('/passkey/code' as any)} accessibilityRole="button" style={styles.link}>
              <Text style={[passkeyStyles.label, { color: colors.primary }]}>Mein Konto-Code</Text>
            </Pressable>
          </Card>
        </>
      )}
      <Card>
        <Pressable onPress={() => router.push('/passkey/restore' as any)} accessibilityRole="button" style={styles.link}>
          <Text style={[passkeyStyles.label, { color: colors.primary }]}>Konto wiederherstellen</Text>
          <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
            Neues Handy? Deine Vertrauenspersonen helfen dir zurück in dein Konto.
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  link: { gap: 4, minHeight: 48, justifyContent: 'center' },
});
