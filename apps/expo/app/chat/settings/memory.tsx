import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatActions, useChatBootstrap } from '@/context/ChatContext';
import type { ChatMemory } from '@/lib/chat/api';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { BOT_COLORS, BotAvatar, BlackPillButton, chatFont, chatSize, useChatTokens } from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

const FALLBACK_AVATAR: BotAvatarSpec = { shape: 'circle', color: BOT_COLORS.black, eyes: 'dots' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Gedächtnis": facts the bots remembered about the user; tap the bin to forget one. */
export default function ChatMemoryScreen() {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const { fetchMemories, deleteMemory } = useChatActions();
  const { presets, bots } = useChatBootstrap();
  const [items, setItems] = useState<ChatMemory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const botById = useMemo(() => {
    const map = new Map<string, { name: string; avatar: BotAvatarSpec }>();
    for (const b of [...presets, ...bots]) map.set(b.id, { name: b.name, avatar: b.avatar });
    return map;
  }, [presets, bots]);

  const load = useCallback(async () => {
    try {
      setItems(await fetchMemories());
      setError(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Gedächtnis konnte nicht geladen werden.');
    }
  }, [fetchMemories]);

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

  const forget = (m: ChatMemory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Vergessen?', `„${m.fact}“`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Vergessen',
        style: 'destructive',
        onPress: async () => {
          setBusyId(m.id);
          const prev = items;
          setItems((list) => list?.filter((x) => x.id !== m.id) ?? null);
          try {
            await deleteMemory(m.id);
          } catch (err) {
            setItems(prev);
            showSnackbar({ message: err instanceof Error && err.message ? err.message : 'Löschen fehlgeschlagen.' });
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
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
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !items?.length && styles.flexGrow]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textTertiary} />}
        ListHeaderComponent={
          <Text style={[styles.intro, { color: t.textSecondary }]}>
            Das haben sich deine Bots über dich gemerkt. Sie nutzen es, um dir besser zu helfen.
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <BotAvatar spec={FALLBACK_AVATAR} size={56} />
            <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Noch nichts gemerkt</Text>
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              Sag einem Bot zum Beispiel „Merk dir, dass ich vegetarisch esse“.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const bot = item.botId ? botById.get(item.botId) : undefined;
          return (
            <View style={[styles.row, { backgroundColor: t.bubbleBot }]}>
              <BotAvatar spec={bot?.avatar ?? FALLBACK_AVATAR} size={32} />
              <View style={styles.rowText}>
                <Text style={[styles.fact, { color: t.textPrimary }]}>{item.fact}</Text>
                <Text style={[styles.meta, { color: t.textSecondary }]}>
                  {bot?.name ?? 'Alle Bots'} · {formatDate(item.createdAt)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Vergessen"
                hitSlop={8}
                disabled={busyId === item.id}
                onPress={() => forget(item)}
                style={styles.delete}
              >
                <Feather name="trash-2" size={18} color={t.textSecondary} />
              </Pressable>
            </View>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <SettingsHeader title="Gedächtnis" />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  retry: { marginTop: 18, alignSelf: 'stretch' },
  list: { paddingHorizontal: chatSize.screenPadH, gap: 8 },
  flexGrow: { flexGrow: 1 },
  intro: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 20, padding: 14 },
  rowText: { flex: 1, minWidth: 0 },
  fact: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 22 },
  meta: { fontFamily: chatFont.regular, fontSize: 13, marginTop: 4 },
  delete: { padding: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10, paddingBottom: 80 },
  emptyTitle: { fontFamily: chatFont.semiBold, fontSize: 18, marginTop: 6 },
  emptyText: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
