import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useGoBack } from '@/hooks/useGoBack';
import { ArrowLeftIcon } from '@/components/Icons';
import TaskCard from '@/components/vorhaben/TaskCard';
import { displayNames, fetchBoard, type BoardGroup } from '@/lib/vorhaben';
import { boardTabFor, progressOf, type BoardTab } from '@/lib/vorhaben-labels';

const TABS: { key: BoardTab; label: string }[] = [
  { key: 'offen', label: 'Offen' },
  { key: 'in_arbeit', label: 'In Arbeit' },
  { key: 'erledigt', label: 'Erledigt' },
];

export default function TaskBoardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const [tab, setTab] = useState<BoardTab>('offen');
  const [groups, setGroups] = useState<BoardGroup[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const g = await fetchBoard();
      setGroups(g);
      setError(null);
      const wallets = g.flatMap((x) => x.tasks.map((t) => t.assignee_wallet)).filter((w): w is string => !!w);
      if (wallets.length) setNames(await displayNames(wallets));
    } catch {
      setError('Aufgaben konnten nicht geladen werden. Bitte später erneut versuchen.');
      setGroups((prev) => prev ?? []);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const visible = (groups ?? [])
    .map((g) => ({ ...g, shown: g.tasks.filter((t) => boardTabFor(t.status) === tab) }))
    .filter((g) => g.shown.length > 0);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Zurück">
          <ArrowLeftIcon size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Aufgabenbörse</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.surfaceSecondary }]}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}
              style={[styles.tab, active && { backgroundColor: colors.background }]}>
              <Text style={[styles.tabText, { color: active ? colors.textPrimary : colors.textSecondary, fontFamily: active ? fontFamily.semiBold : fontFamily.medium }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {groups === null ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <>
            {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
            {visible.length === 0 && !error && (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>Gerade keine Aufgaben in dieser Liste.</Text>
            )}
            {visible.map((g) => {
              const { done, total } = progressOf(g.tasks.map((t) => t.status));
              return (
                <View key={g.proposal.key} style={styles.group}>
                  <Pressable onPress={() => router.push(`/proposal/${g.proposal.key}` as any)} accessibilityRole="link">
                    <Text style={[styles.groupTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                      #{g.proposal.number} {g.proposal.title}
                    </Text>
                  </Pressable>
                  <View style={[styles.bar, { backgroundColor: colors.border }]}>
                    <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${total ? (done / total) * 100 : 0}%` }]} />
                  </View>
                  <Text style={[styles.progress, { color: colors.textSecondary }]}>{done} von {total} erledigt</Text>
                  {g.shown.map((t) => (
                    <TaskCard key={t.id} task={t}
                      assigneeName={t.assignee_wallet ? names.get(t.assignee_wallet.toLowerCase()) ?? null : null}
                      onPress={() => router.push(`/aufgabe/${t.id}` as any)} />
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  tabText: { fontSize: 14 },
  content: { padding: 16, gap: 24, paddingBottom: 60 },
  group: { gap: 10 },
  groupTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, lineHeight: 21 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  progress: { fontFamily: fontFamily.regular, fontSize: 13 },
  empty: { fontFamily: fontFamily.regular, fontSize: 15, textAlign: 'center', marginTop: 40 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
});
