/**
 * Gastronomie (restaurant menu) data layer for the public org page.
 * Ported from apps/expo/hooks/useGastroData.ts + menu-item detail.
 */

import { supabase } from "./supabase";
import type { Restaurant, MenuCategory, MenuItem } from "@/types/restaurant";
import {
  fetchMenuItemVoteSummaries,
  type MenuItemVoteSummary,
} from "./supabase-ratings";

export interface MenuItemWithFlags extends MenuItem {
  has_variants: boolean;
  sides_required?: boolean;
  sides_label?: string | null;
  variants_label?: string | null;
}

export interface CategoryWithItems extends MenuCategory {
  items: MenuItemWithFlags[];
}

export interface GastroData {
  restaurant: Restaurant | null;
  categories: CategoryWithItems[];
  voteSummaries: Record<string, MenuItemVoteSummary>;
}

export interface MenuItemVariant {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  is_default: boolean;
  sort_order: number;
}

export interface MenuItemSide {
  id: string;
  menu_item_id: string;
  name: string;
  description: string | null;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
}

export interface MenuItemDetail extends MenuItemWithFlags {
  variants: MenuItemVariant[];
  sides: MenuItemSide[];
  vote_summary: MenuItemVoteSummary | null;
}

export async function fetchRestaurantByAccount(
  accountId: string
): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    console.error("fetchRestaurantByAccount error:", error);
    return null;
  }
  return (data as Restaurant) ?? null;
}

/** Full menu (categories + items + variant flag + vote summaries) for an account. */
export async function fetchGastroData(accountId: string): Promise<GastroData> {
  const restaurant = await fetchRestaurantByAccount(accountId);
  if (!restaurant) {
    return { restaurant: null, categories: [], voteSummaries: {} };
  }

  const { data: catData, error } = await supabase
    .from("menu_categories")
    .select("*, menu_items(*, menu_item_variants(id))")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("fetchGastroData categories error:", error);
    return { restaurant, categories: [], voteSummaries: {} };
  }

  const categories: CategoryWithItems[] = ((catData as any[]) ?? []).map(
    (cat) => {
      const items: MenuItemWithFlags[] = (cat.menu_items ?? [])
        .filter((it: any) => it.is_available !== false)
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((it: any) => ({
          ...it,
          has_variants: Array.isArray(it.menu_item_variants)
            ? it.menu_item_variants.length > 0
            : false,
        }));
      return { ...cat, items };
    }
  );

  const allItemIds = categories.flatMap((c) => c.items.map((i) => i.id));
  const voteSummaries = await fetchMenuItemVoteSummaries(allItemIds);

  return { restaurant, categories, voteSummaries };
}

export async function fetchMenuItemDetail(
  itemId: string
): Promise<MenuItemDetail | null> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*, menu_item_variants(*), menu_item_sides(*)")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchMenuItemDetail error:", error);
    return null;
  }
  const row = data as any;
  const summaries = await fetchMenuItemVoteSummaries([itemId]);
  const variants = ((row.menu_item_variants as MenuItemVariant[]) ?? []).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const sides = ((row.menu_item_sides as MenuItemSide[]) ?? []).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  return {
    ...row,
    has_variants: variants.length > 0,
    variants,
    sides,
    vote_summary: summaries[itemId] ?? null,
  };
}

export async function fetchRelatedMenuItems(
  restaurantId: string,
  excludeId: string,
  limit = 6
): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .neq("id", excludeId)
    .eq("is_available", true)
    .limit(limit);
  if (error) {
    console.error("fetchRelatedMenuItems error:", error);
    return [];
  }
  return (data as MenuItem[]) ?? [];
}

/** Free-text menu search via the `search_menu_items` RPC. */
export async function searchMenuItems(
  accountId: string,
  query: string
): Promise<MenuItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await supabase.rpc("search_menu_items", {
    p_account_id: accountId,
    p_query: trimmed,
  });
  if (error) {
    console.error("searchMenuItems error:", error);
    return [];
  }
  return (data as MenuItem[]) ?? [];
}
