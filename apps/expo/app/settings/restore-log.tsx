/**
 * Settings → Anmelde-Protokoll (spec 5.9). Shows the last sign-in restore outcomes that
 * lib/wallet-restore.ts keeps on the device, newest first, so the store-build update test
 * (docs/STORE_BUILD_UPDATE_TEST.md) can read them on the test phone.
 *
 * Read-only: no network, no sharing. The formatter scrubs addresses, keys and URL query strings.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ScreenHeader } from '@/components/passkey/PasskeyUi';
import { readRestoreReports } from '@/lib/wallet-restore';
import { formatRestoreReport } from '@/lib/restore-log-format';

type Entry = { title: string; lines: string[] };

export default function RestoreLogScreen() {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readRestoreReports(AsyncStorage).then((reports) => {
      if (!cancelled) setEntries([...reports].reverse().map(formatRestoreReport));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Anmelde-Protokoll" />
      {entries === null ? (
        <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
      ) : entries.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>Keine Einträge. Das ist gut.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {entries.map((e, i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{e.title}</Text>
              {e.lines.map((l, j) => (
                <Text key={j} style={[styles.line, { color: colors.textSecondary }]} selectable>
                  {l}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: 32 },
  empty: { fontSize: 15, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 32, paddingHorizontal: 16 },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 12, padding: 14, gap: 4 },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold, marginBottom: 2 },
  line: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
});
