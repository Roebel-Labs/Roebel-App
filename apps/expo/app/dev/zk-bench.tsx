/**
 * Proving benchmark (credreg-6 Task 1, owner gate G1). Dev builds and the preview channel only.
 * Runs 10 proofs each for groups of 16, 256 and 1,024 random members and shows median, p95, the
 * slowest proof and how often the WebView restarted. "Kopieren" copies the JSON for
 * docs/ZK_PROVING_BENCHMARK.md.
 */
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ZkProverHost, { proverRestarts } from '@/components/zk/ZkProverHost';
import { commitmentOf, prove } from '@/lib/zk/prover';

const SIZES = [16, 256, 1024] as const;
const RUNS = 10;

type Row = { size: number; depth: number; ok: number; failures: string[]; medianMs: number; p95Ms: number; maxMs: number; restarts: number };

const depthFor = (n: number) => Math.max(1, Math.ceil(Math.log2(n)));
const randomField = () => {
  let s = String(1 + Math.floor(Math.random() * 9));
  for (let i = 0; i < 60; i++) s += Math.floor(Math.random() * 10);
  return s;
};
const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0);

export default function ZkBenchScreen() {
  const { colors } = useTheme();
  const allowed = __DEV__ || Updates.channel === 'preview';
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('Bereit.');
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setRows([]);
    const out: Row[] = [];
    const secret = `bench-${Date.now()}-${randomField()}`;
    const commitment = await commitmentOf(`c-${Date.now()}`, secret);
    if (!commitment) {
      setStatus('Prover antwortet nicht.');
      setRunning(false);
      return;
    }
    for (const size of SIZES) {
      const depth = depthFor(size);
      const before = proverRestarts();
      const times: number[] = [];
      const failures: string[] = [];
      for (let i = 0; i < RUNS; i++) {
        setStatus(`${size} Mitglieder: Beweis ${i + 1}/${RUNS} …`);
        const members = Array.from({ length: size - 1 }, randomField);
        members.splice(Math.floor(Math.random() * size), 0, commitment);
        const r = await prove({ id: `p-${size}-${i}-${Date.now()}`, identitySecret: secret, members, message: String(i), scope: String(size), depth });
        if (r.ok) times.push(r.ms);
        else failures.push(r.code);
      }
      const sorted = [...times].sort((a, b) => a - b);
      out.push({ size, depth, ok: times.length, failures, medianMs: pct(sorted, 0.5), p95Ms: pct(sorted, 0.95), maxMs: sorted[sorted.length - 1] ?? 0, restarts: proverRestarts() - before });
      setRows([...out]);
    }
    setStatus('Fertig.');
    setRunning(false);
  }, []);

  const copy = useCallback(() => {
    const report = {
      device: { model: Device.modelName, os: Platform.OS, osVersion: String(Platform.Version), memoryBytes: Device.totalMemory, year: Device.deviceYearClass },
      runtime: Updates.runtimeVersion,
      channel: Updates.channel,
      date: new Date().toISOString(),
      runs: RUNS,
      rows,
    };
    void Clipboard.setStringAsync(JSON.stringify(report, null, 2));
    setStatus('JSON kopiert.');
  }, [rows]);

  if (!allowed) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>Nur in Entwickler-Versionen verfügbar.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ZkProverHost />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Beweis-Messung</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{status}</Text>
        {rows.map((r) => (
          <View key={r.size} style={[styles.row, { borderColor: colors.borderSecondary }]}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
              {r.size} Mitglieder (Tiefe {r.depth})
            </Text>
            <Text style={[styles.mono, { color: colors.textPrimary }]}>
              {`Median ${r.medianMs} ms · p95 ${r.p95Ms} ms · max ${r.maxMs} ms`}
            </Text>
            <Text style={[styles.mono, { color: colors.textSecondary }]}>
              {`${r.ok}/${RUNS} ok · Neustarts ${r.restarts}${r.failures.length ? ` · Fehler ${r.failures.join(', ')}` : ''}`}
            </Text>
          </View>
        ))}
        <View style={styles.actions}>
          <Pressable
            disabled={running}
            onPress={() => void run()}
            style={[styles.button, { backgroundColor: colors.primary, opacity: running ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{running ? 'Läuft …' : 'Messung starten'}</Text>
          </Pressable>
          <Pressable disabled={rows.length === 0} onPress={copy} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.primary }]}>Kopieren</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontFamily: fontFamily.heading, fontSize: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, padding: 16 },
  row: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  mono: { fontFamily: fontFamily.mono, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  button: { paddingHorizontal: 16, height: 40, borderRadius: 20, justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  link: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
