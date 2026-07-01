import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { SearchIcon } from '@/components/Icons';
import { searchMenuItems } from '@/lib/supabase-menu';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { MenuItemRecord } from '@/lib/types';

type Props = {
  visible: boolean;
  accountId: string;
  onClose: () => void;
};

export default function MenuSearchModal({ visible, accountId, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const [results, setResults] = useState<MenuItemRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (debounced.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    void searchMenuItems(accountId, debounced).then((r) => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [debounced, accountId, visible]);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
  }, [visible]);

  function onItem(item: MenuItemRecord) {
    onClose();
    router.push(`/account/${accountId}/menu/${item.id}`);
  }

  const empty = useMemo(() => {
    if (loading) return null;
    if (debounced.trim().length < 2) return 'Tippe mindestens 2 Zeichen ein';
    if (!results.length) return 'Keine Gerichte gefunden';
    return null;
  }, [loading, results.length, debounced]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter-Medium', fontSize: 16 }}>Schließen</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Speisekarte durchsuchen</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={[styles.searchRow, { backgroundColor: colors.surface }]}>
          <SearchIcon size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="z. B. Chicken, Pizza, Vegan…"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary }]}
          />
        </View>

        {loading && <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />}

        {empty && (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{empty}</Text>
        )}

        <FlatList
          data={results}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(32, insets.bottom) }}
          renderItem={({ item }) => (
            <Pressable onPress={() => onItem(item)} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                {!!item.description && (
                  <Text style={[styles.itemDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
                )}
                <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>€{item.price.toFixed(2)}</Text>
              </View>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.surfaceSecondary }]} />
              )}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontFamily: 'Inter-Medium' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  input: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 15 },
  empty: { textAlign: 'center', paddingTop: 24, fontFamily: 'Inter-Regular' },
  itemRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  itemName: { fontFamily: 'Inter-Medium', fontSize: 15, marginBottom: 2 },
  itemDesc: { fontFamily: 'Inter-Regular', fontSize: 13, marginBottom: 4 },
  itemPrice: { fontFamily: 'Inter-Medium', fontSize: 14 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
});
