import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ScreenHeader } from '@/components/passkey/PasskeyUi';
import MigrationSettings from '@/components/passkey/MigrationSettings';
import SovereignAccountSettings from '@/components/passkey/SovereignAccountSettings';
import { useSettingsKind } from '@/components/passkey/useSettingsKind';

/** Thin chooser: an independent account or the migration of a thirdweb account (settings-kind.ts). */
export default function PasskeySettingsScreen() {
  const { colors } = useTheme();
  const { kind, record, migrationOpen, detachOpen } = useSettingsKind();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Passkey & Wiederherstellung" />
      {kind === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : kind === 'hidden' ? (
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>Diese Funktion ist noch nicht verfügbar.</Text>
        </View>
      ) : kind === 'sovereign' ? (
        <SovereignAccountSettings initialRecord={record} />
      ) : (
        <MigrationSettings initialRecord={record} canStart={migrationOpen} canDetach={detachOpen} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
});
