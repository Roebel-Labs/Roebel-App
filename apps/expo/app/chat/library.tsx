import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useChatAccount, useChatActions, useChatBootstrap } from '@/context/ChatContext';
import { ChatApiError, fetchLibrary } from '@/lib/chat/api';
import {
  chunkRows,
  documentFileId,
  filterLibrary,
  libraryCounts,
  libraryMeta,
  type LibraryFile,
  type LibraryKindFilter,
} from '@/lib/chat/library';
import { FileSheet, ScreenMessage, SettingsListSkeleton, chatFont, chatSize, useChatSheets, useChatTokens } from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

const GRID_COLUMNS = 3;
const GRID_GAP = 6;

const KINDS: { id: LibraryKindFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'document', label: 'Dokumente' },
  { id: 'image', label: 'Bilder' },
];

type Row = { key: string; files: LibraryFile[] };

interface OpenFile {
  name: string;
  content: string | null;
  loading: boolean;
  error: string | null;
}

/** "Bibliothek": every file and generated image across the person's chats. */
export default function ChatLibraryScreen() {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { openMenu } = useChatSheets();
  const account = useChatAccount();
  const boot = useChatBootstrap();
  const actions = useChatActions();

  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [kind, setKind] = useState<LibraryKindFilter>('all');
  const [query, setQuery] = useState('');
  const [file, setFile] = useState<OpenFile | null>(null);
  const openSeq = useRef(0);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      const lib = await fetchLibrary(account);
      setFiles(lib.files);
      setError(null);
    } catch (err) {
      setError(err instanceof ChatApiError && err.message ? err.message : 'Die Bibliothek konnte nicht geladen werden.');
    }
  }, [account]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const counts = useMemo(() => libraryCounts(files ?? []), [files]);
  const shown = useMemo(() => filterLibrary(files ?? [], kind, query), [files, kind, query]);
  // Images as a grid, everything else as a list: both are rows of one FlatList.
  const grid = kind === 'image';
  const rows = useMemo<Row[]>(
    () =>
      grid
        ? chunkRows(shown, GRID_COLUMNS).map((group) => ({ key: group.map((f) => f.id).join('|'), files: group }))
        : shown.map((f) => ({ key: f.id, files: [f] })),
    [shown, grid],
  );
  const tile = Math.floor((win.width - chatSize.screenPadH * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  const openThread = (f: LibraryFile) => router.push(`/chat/${f.threadId}` as Href);

  const openFile = async (f: LibraryFile) => {
    Haptics.selectionAsync().catch(() => {});
    if (f.kind === 'image') {
      if (f.url) WebBrowser.openBrowserAsync(f.url).catch(() => {});
      return;
    }
    const id = documentFileId(f);
    if (!id) {
      openThread(f);
      return;
    }
    const seq = ++openSeq.current;
    setFile({ name: f.name, content: null, loading: true, error: null });
    try {
      const res = await actions.fetchFile(id);
      if (seq !== openSeq.current) return;
      setFile({ name: res.name || f.name, content: res.content, loading: false, error: null });
    } catch (err) {
      if (seq !== openSeq.current) return;
      setFile({
        name: f.name,
        content: null,
        loading: false,
        error: err instanceof ChatApiError && err.message ? err.message : 'Datei konnte nicht geladen werden.',
      });
    }
  };

  const more = (f: LibraryFile) =>
    openMenu({
      title: f.name,
      items: [
        { label: f.kind === 'image' ? 'Bild ansehen' : 'Datei öffnen', icon: 'open-outline', onPress: () => void openFile(f) },
        { label: 'Zum Chat', icon: 'chatbubble-outline', onPress: () => openThread(f) },
      ],
    });

  let body: React.ReactNode;
  if (!account || boot.hasSession === false) {
    body = <ScreenMessage text="Melde dich im Chat an, um deine Bibliothek zu sehen." />;
  } else if (files === null && error) {
    body = <ScreenMessage text={error} actionLabel="Erneut versuchen" onAction={() => void load()} />;
  } else if (files === null) {
    body = <SettingsListSkeleton rows={6} withIcon style={styles.skeleton} />;
  } else {
    body = (
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }, !rows.length ? styles.grow : null]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textTertiary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.search, { backgroundColor: t.chipBackground }]}>
              <Feather name="search" size={17} color={t.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Bibliothek durchsuchen"
                placeholderTextColor={t.placeholder}
                returnKeyType="search"
                autoCorrect={false}
                style={[styles.searchInput, { color: t.textPrimary }]}
                accessibilityLabel="Bibliothek durchsuchen"
              />
            </View>
            <View style={styles.chips}>
              {KINDS.map((k) => {
                const on = k.id === kind;
                return (
                  <Pressable
                    key={k.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setKind(k.id);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: on ? t.primaryButton : t.chipBackground, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: on ? t.primaryButtonText : t.textSecondary }]}>
                      {k.label} {counts[k.id]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          files.length === 0 ? (
            <ScreenMessage
              title="Noch nichts in der Bibliothek"
              text="Dateien und Bilder, die deine Agenten in den Chats erstellen, findest du hier wieder."
            />
          ) : (
            <ScreenMessage text="Keine Treffer in dieser Ansicht." />
          )
        }
        renderItem={({ item }) => {
          if (grid) {
            return (
              <View style={styles.gridRow}>
                {item.files.map((f) => (
                  <Pressable
                    key={f.id}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Bild ${f.name} ansehen`}
                    onPress={() => void openFile(f)}
                    onLongPress={() => more(f)}
                    delayLongPress={300}
                    style={({ pressed }) => [
                      styles.tile,
                      { width: tile, height: tile, backgroundColor: t.skeleton, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    {f.url ? (
                      <Image
                        source={{ uri: f.url }}
                        style={styles.fill}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={f.id}
                        transition={120}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            );
          }
          const f = item.files[0];
          if (!f) return null;
          const badge = f.ext === 'md' || f.ext === 'markdown' ? 'M↓' : f.ext.slice(0, 3).toUpperCase() || '·';
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={f.kind === 'image' ? `Bild ${f.name} ansehen` : `Datei ${f.name} öffnen`}
              onPress={() => void openFile(f)}
              onLongPress={() => more(f)}
              delayLongPress={300}
              style={({ pressed }) => [styles.row, { backgroundColor: t.bubbleBot, opacity: pressed ? 0.8 : 1 }]}
            >
              {f.kind === 'image' && f.url ? (
                <View style={[styles.thumb, { backgroundColor: t.skeleton }]}>
                  <Image source={{ uri: f.url }} style={styles.fill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={f.id} />
                </View>
              ) : (
                <View style={[styles.thumb, styles.badge, { backgroundColor: t.fileBadgeBg }]}>
                  <Text style={[styles.badgeText, { color: t.fileBadgeText }]}>{badge}</Text>
                </View>
              )}
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                  {f.name}
                </Text>
                <Text numberOfLines={1} style={[styles.meta, { color: t.textSecondary }]}>
                  {libraryMeta(f)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zum Chat"
                hitSlop={8}
                onPress={() => openThread(f)}
                style={({ pressed }) => [styles.jump, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Feather name="message-circle" size={19} color={t.textSecondary} />
              </Pressable>
            </Pressable>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <SettingsHeader title="Bibliothek" />
      {body}
      <FileSheet
        visible={!!file}
        onClose={() => {
          openSeq.current++;
          setFile(null);
        }}
        name={file?.name ?? ''}
        content={file?.content ?? null}
        loading={file?.loading}
        error={file?.error}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skeleton: { marginHorizontal: chatSize.screenPadH, marginTop: 8 },
  list: { paddingHorizontal: chatSize.screenPadH, gap: 8 },
  grow: { flexGrow: 1 },
  header: { marginBottom: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: chatFont.regular, fontSize: 17, paddingVertical: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontFamily: chatFont.medium, fontSize: 14 },
  gridRow: { flexDirection: 'row', gap: GRID_GAP, marginBottom: GRID_GAP - 8 },
  tile: { borderRadius: 14, overflow: 'hidden' },
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingLeft: 10, paddingRight: 6, paddingVertical: 10 },
  thumb: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: chatFont.medium, fontSize: 13, letterSpacing: -0.3 },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: chatFont.medium, fontSize: 16, letterSpacing: -0.2 },
  meta: { fontFamily: chatFont.regular, fontSize: 13, marginTop: 2 },
  jump: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
