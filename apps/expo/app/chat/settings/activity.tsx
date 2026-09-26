import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useChatActions } from '@/context/ChatContext';
import type { AgentActionRecord, AgentActionStatus } from '@/lib/chat/api';
import { BlackPillButton, chatFont, chatSize, useChatTokens, type ChatTokens } from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

const STATUS_LABEL: Record<AgentActionStatus, string> = {
  pending: 'Wartet',
  approved: 'Freigegeben',
  rejected: 'Abgelehnt',
  executed: 'Ausgeführt',
  failed: 'Fehlgeschlagen',
  expired: 'Abgelaufen',
};

const ADDRESS = /0x[a-fA-F0-9]{40}/g;

function statusColor(status: AgentActionStatus, t: ChatTokens): string {
  if (status === 'executed') return t.check;
  if (status === 'failed') return t.recordingRed;
  if (status === 'pending' || status === 'approved') return t.link;
  return t.chipText;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Heute, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Gestern, ${time}`;
  return `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** "Aktivität": audit list of what the agents did or asked to do. */
export default function ChatActivityScreen() {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const { fetchAgentActions } = useChatActions();
  const [items, setItems] = useState<AgentActionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchAgentActions(50));
      setError(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Aktivität konnte nicht geladen werden.');
    }
  }, [fetchAgentActions]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  let body: React.ReactNode;
  if (items === null && !error) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={t.textSecondary} />
      </View>
    );
  } else if (items === null && error) {
    body = (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: t.textSecondary }]}>{error}</Text>
        <BlackPillButton label="Erneut versuchen" onPress={load} style={styles.retry} />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={items ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !items?.length && styles.flexGrow]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textTertiary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Noch keine Aktivität</Text>
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              Hier siehst du, was deine Bots für dich erledigt oder zur Freigabe vorgeschlagen haben.
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: t.separator }]} />}
        renderItem={({ item }) => {
          const color = statusColor(item.status, t);
          return (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.summary, { color: t.textPrimary }]} numberOfLines={3}>
                  {(item.summary || item.tool).replace(ADDRESS, 'Wallet')}
                </Text>
                <Text style={[styles.meta, { color: t.textSecondary }]} numberOfLines={1}>
                  {item.tool} · {formatWhen(item.createdAt)}
                </Text>
                {item.status === 'failed' && item.error ? (
                  <Text style={[styles.errorNote, { color: t.recordingRed }]} numberOfLines={2}>
                    {item.error.replace(ADDRESS, 'Wallet')}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.chip, { backgroundColor: t.chipBackground }]}>
                <Text style={[styles.chipText, { color }]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
              </View>
            </View>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <SettingsHeader title="Aktivität" />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  retry: { marginTop: 18, alignSelf: 'stretch' },
  list: { paddingHorizontal: chatSize.screenPadH + 4 },
  flexGrow: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  rowText: { flex: 1, minWidth: 0 },
  summary: { fontFamily: chatFont.medium, fontSize: 16, lineHeight: 21 },
  meta: { fontFamily: chatFont.regular, fontSize: 13, marginTop: 4 },
  errorNote: { fontFamily: chatFont.regular, fontSize: 13, marginTop: 4 },
  chip: { height: 24, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center', marginTop: 1 },
  chipText: { fontFamily: chatFont.medium, fontSize: 12 },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10, paddingBottom: 80 },
  emptyTitle: { fontFamily: chatFont.semiBold, fontSize: 18 },
  emptyText: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
