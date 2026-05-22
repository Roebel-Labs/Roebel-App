import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchRestaurantByAccount } from '@/lib/supabase-restaurants';
import { supabase } from '@/lib/supabase';
import { fetchMenuItemVoteSummaries } from '@/lib/supabase-menu';
import FeaturedMenuItemsGrid from '@/components/FeaturedMenuItemsGrid';
import MenuItemThumbs from '@/components/MenuItemThumbs';
import type {
  MenuCategoryRecord,
  MenuItemRecord,
  MenuItemVoteSummary,
  RestaurantRecord,
} from '@/lib/types';

type MenuItemWithVariantFlag = MenuItemRecord & { has_variants?: boolean };

type Props = {
  accountId: string;
};

type CategoryWithItems = MenuCategoryRecord & { items: MenuItemWithVariantFlag[] };

export default function GastroSection({ accountId }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<RestaurantRecord | null>(null);
  const [categories, setCategories] = useState<CategoryWithItems[]>([]);
  const [voteSummaries, setVoteSummaries] = useState<Record<string, MenuItemVoteSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await fetchRestaurantByAccount(accountId);
      if (cancelled) return;
      setRestaurant(r);
      if (!r) { setLoading(false); return; }

      const { data: cats } = await supabase
        .from('menu_categories')
        .select('*, menu_items(*, menu_item_variants(id))')
        .eq('restaurant_id', r.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const list: CategoryWithItems[] = ((cats ?? []) as any[]).map((c) => ({
        id: c.id,
        restaurant_id: c.restaurant_id,
        name: c.name,
        sort_order: c.sort_order,
        is_active: c.is_active,
        created_at: c.created_at,
        items: ((c.menu_items ?? []) as any[])
          .filter((it) => it.is_available !== false)
          .map((it) => ({
            ...it,
            has_variants: Array.isArray(it.menu_item_variants) && it.menu_item_variants.length > 0,
          }) as MenuItemWithVariantFlag)
          .sort((a, b) => a.sort_order - b.sort_order),
      }));
      if (cancelled) return;
      setCategories(list);

      const allItemIds = list.flatMap((c) => c.items.map((i) => i.id));
      const summaries = await fetchMenuItemVoteSummaries(allItemIds);
      if (!cancelled) {
        setVoteSummaries(summaries);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  if (!restaurant) return null;
  if (loading && !categories.length) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Speisekarte lädt…</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 24 }}>
      <FeaturedMenuItemsGrid
        accountId={accountId}
        items={allItems}
        voteSummaries={voteSummaries}
      />

      {categories.map((cat) => (
        <View key={cat.id} style={[styles.categorySection, { borderTopColor: colors.border }]}>
          <Text style={[styles.categoryName, { color: colors.textPrimary }]}>{cat.name}</Text>
          {cat.items.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Keine Gerichte</Text>
          ) : (
            cat.items.map((item, idx) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/account/${accountId}/menu/${item.id}`)}
                style={[
                  styles.itemRow,
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
                      {item.has_variants ? `ab €${item.price.toFixed(2)}` : `€${item.price.toFixed(2)}`}
                    </Text>
                    <MenuItemThumbs summary={voteSummaries[item.id] ?? null} />
                  </View>
                  {!!item.description && (
                    <Text style={[styles.itemDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}
                </View>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: colors.surfaceSecondary }]} />
                )}
              </Pressable>
            ))
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  categorySection: { paddingHorizontal: 16, paddingTop: 24, borderTopWidth: StyleSheet.hairlineWidth },
  categoryName: { fontSize: 22, fontFamily: 'Inter-SemiBold', marginBottom: 12 },
  empty: { fontSize: 14, fontFamily: 'Inter-Regular', paddingVertical: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  itemName: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  itemPrice: { fontSize: 14, fontFamily: 'Inter-Medium' },
  itemDesc: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4 },
  thumb: { width: 96, height: 96, borderRadius: 8 },
});
