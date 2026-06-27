import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useGoBack } from '@/hooks/useGoBack';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CategoryEditor from '@/components/menu-admin/CategoryEditor';
import { supabase } from '@/lib/supabase';
import { fetchMenuItems } from '@/lib/supabase-menu';
import type { MenuCategoryRecord, MenuItemRecord } from '@/lib/types';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';

export default function CategoryEditScreen() {
  return (
    <InlineErrorBoundary label="org-menu-category-edit">
      <CategoryEditScreenInner />
    </InlineErrorBoundary>
  );
}

function CategoryEditScreenInner() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const canEdit = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';

  const [category, setCategory] = useState<MenuCategoryRecord | null>(null);
  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: cat } = await supabase.from('menu_categories').select('*').eq('id', id).maybeSingle();
    setCategory(cat as MenuCategoryRecord | null);
    if (cat) {
      const list = await fetchMenuItems(id);
      setItems(list);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {category?.name ?? 'Kategorie'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {!canEdit ? (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Nicht berechtigt.</Text>
        ) : (
          <>
            {category && activeAccount && (
              <CategoryEditor
                restaurantId={category.restaurant_id}
                category={category}
                onSaved={(c) => setCategory(c)}
                onDeleted={() => router.back()}
              />
            )}

            <View style={[styles.itemsHeader, { borderTopColor: colors.border }]}>
              <Text style={[styles.itemsTitle, { color: colors.textPrimary }]}>Gerichte</Text>
              {category && (
                <Pressable
                  onPress={() => router.push({ pathname: '/org/menu/item/new', params: { categoryId: category.id } } as any)}
                  style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter-Medium', fontSize: 13 }}>+ Gericht</Text>
                </Pressable>
              )}
            </View>

            {loading ? (
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Lädt…</Text>
            ) : items.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>
                Noch keine Gerichte in dieser Kategorie.
              </Text>
            ) : (
              items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push({ pathname: '/org/menu/item/[id]', params: { id: item.id } } as any)}
                  style={[styles.itemRow, { borderColor: colors.borderSecondary }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                      €{Number(item.price).toFixed(2)}{item.is_available === false ? ' · ausgeblendet' : ''}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Medium', fontSize: 18 }}>›</Text>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: 'MonaSansSemiCondensed-Medium', flex: 1, textAlign: 'center' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemsTitle: { fontSize: 16, fontFamily: 'Inter-Medium' },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  itemName: { fontSize: 15, fontFamily: 'Inter-Medium' },
  itemMeta: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
});
