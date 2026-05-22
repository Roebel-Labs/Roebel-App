import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useGoBack } from '@/hooks/useGoBack';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { fetchRestaurantByAccount } from '@/lib/supabase-restaurants';
import { fetchMenuCategories } from '@/lib/supabase-menu';
import { supabase } from '@/lib/supabase';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import type { MenuCategoryRecord, RestaurantRecord } from '@/lib/types';

export default function MenuAdminIndex() {
  return (
    <InlineErrorBoundary label="org-menu-index">
      <MenuAdminIndexInner />
    </InlineErrorBoundary>
  );
}

function MenuAdminIndexInner() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const canEdit = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';

  const [restaurant, setRestaurant] = useState<RestaurantRecord | null>(null);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeAccount?.id) return;
    setLoading(true);
    const r = await fetchRestaurantByAccount(activeAccount.id);
    setRestaurant(r);
    if (r) {
      const cats = await fetchMenuCategories(r.id);
      setCategories(cats);
      const { data } = await supabase
        .from('menu_items')
        .select('category_id')
        .eq('restaurant_id', r.id);
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { category_id: string | null }[]) {
        if (!row.category_id) continue;
        map[row.category_id] = (map[row.category_id] ?? 0) + 1;
      }
      setCounts(map);
    }
    setLoading(false);
  }, [activeAccount?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);

  if (!activeAccount || activeAccount.sub_type !== 'restaurant') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title="Speisekarte" onBack={goBack} />
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Diese Funktion ist nur für Gastronomie-Konten verfügbar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!canEdit) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title="Speisekarte" onBack={goBack} />
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Nur Inhaber:innen und Admins können die Speisekarte bearbeiten.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Speisekarte" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!restaurant ? (
          <Text style={[styles.empty, { color: colors.textSecondary, padding: 24 }]}>
            {loading ? 'Lädt…' : 'Diesem Konto ist noch kein Restaurant zugeordnet.'}
          </Text>
        ) : categories.length === 0 ? (
          <View style={{ padding: 24 }}>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Noch keine Kategorien. Lege deine erste an, um mit der Speisekarte zu starten.
            </Text>
          </View>
        ) : (
          categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => router.push({ pathname: '/org/menu/category/[id]', params: { id: cat.id } } as any)}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{cat.name}</Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {counts[cat.id] ?? 0} Gerichte{cat.is_active ? '' : ' · ausgeblendet'}
                </Text>
              </View>
              <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Medium', fontSize: 18 }}>›</Text>
            </Pressable>
          ))
        )}

        {restaurant && (
          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push('/org/menu/category/new' as any)}
              style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: '#fff', fontFamily: 'Inter-Medium' }}>+ Neue Kategorie</Text>
            </Pressable>
            {categories.length > 0 && (
              <Pressable
                onPress={() => router.push({ pathname: '/org/menu/item/new', params: { categoryId: categories[0].id } } as any)}
                style={[styles.btnGhost, { borderColor: colors.borderSecondary }]}
              >
                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter-Medium' }}>+ Neues Gericht</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
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
  headerTitle: { fontSize: 17, fontFamily: 'Inter-Medium' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowTitle: { fontSize: 16, fontFamily: 'Inter-Medium' },
  rowMeta: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
  actions: { padding: 16, gap: 10 },
  btnPrimary: { paddingVertical: 14, borderRadius: 9999, alignItems: 'center' },
  btnGhost: { paddingVertical: 14, borderRadius: 9999, alignItems: 'center', borderWidth: 1 },
});
