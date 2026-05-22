import { useEffect, useState } from 'react';
import { fetchRestaurantByAccount } from '@/lib/supabase-restaurants';
import { supabase } from '@/lib/supabase';
import { fetchMenuItemVoteSummaries } from '@/lib/supabase-menu';
import type {
  MenuCategoryRecord,
  MenuItemRecord,
  MenuItemVoteSummary,
  RestaurantRecord,
} from '@/lib/types';

export type MenuItemWithVariantFlag = MenuItemRecord & { has_variants?: boolean };
export type CategoryWithItems = MenuCategoryRecord & { items: MenuItemWithVariantFlag[] };

type UseGastroData = {
  loading: boolean;
  restaurant: RestaurantRecord | null;
  categories: CategoryWithItems[];
  voteSummaries: Record<string, MenuItemVoteSummary>;
};

export function useGastroData(accountId: string | null | undefined): UseGastroData {
  const [restaurant, setRestaurant] = useState<RestaurantRecord | null>(null);
  const [categories, setCategories] = useState<CategoryWithItems[]>([]);
  const [voteSummaries, setVoteSummaries] = useState<Record<string, MenuItemVoteSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await fetchRestaurantByAccount(accountId);
      if (cancelled) return;
      setRestaurant(r);
      if (!r) { setLoading(false); return; }

      const { data: cats, error: catsErr } = await supabase
        .from('menu_categories')
        .select('*, menu_items(*, menu_item_variants(id))')
        .eq('restaurant_id', r.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (catsErr) console.error('[useGastroData] menu_categories error', catsErr);

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

  return { loading, restaurant, categories, voteSummaries };
}
