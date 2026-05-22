import { supabase } from './supabase';
import type {
  MenuCategoryRecord,
  MenuItemRecord,
  MenuItemSide,
  MenuItemVariant,
  MenuItemVoteSummary,
  MenuItemWithDetails,
} from './types';

export async function fetchMenuCategories(restaurantId: string): Promise<MenuCategoryRecord[]> {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });
  if (error) { console.error('Error fetching categories:', error); return []; }
  return data as MenuCategoryRecord[];
}

export async function createMenuCategory(restaurantId: string, name: string): Promise<MenuCategoryRecord | null> {
  const { data, error } = await supabase
    .from('menu_categories')
    .insert({ restaurant_id: restaurantId, name })
    .select()
    .single();
  if (error) { console.error('Error creating category:', error); return null; }
  return data as MenuCategoryRecord;
}

export async function updateMenuCategory(categoryId: string, updates: Partial<Pick<MenuCategoryRecord, 'name' | 'is_active' | 'sort_order'>>): Promise<void> {
  const { error } = await supabase.from('menu_categories').update(updates).eq('id', categoryId);
  if (error) console.error('Error updating category:', error);
}

export async function deleteMenuCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from('menu_categories').delete().eq('id', categoryId);
  if (error) console.error('Error deleting category:', error);
}

export async function fetchMenuItems(categoryId: string): Promise<MenuItemRecord[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: true });
  if (error) { console.error('Error fetching items:', error); return []; }
  return data as MenuItemRecord[];
}

export async function createMenuItem(input: {
  restaurant_id: string;
  category_id: string;
  name: string;
  price: number;
  description?: string | null;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  image_url?: string | null;
}): Promise<MenuItemRecord | null> {
  const { data, error } = await supabase
    .from('menu_items')
    .insert(input)
    .select()
    .single();
  if (error) { console.error('Error creating item:', error); return null; }
  return data as MenuItemRecord;
}

export async function updateMenuItem(itemId: string, updates: Partial<Pick<MenuItemRecord, 'name' | 'description' | 'price' | 'is_vegetarian' | 'is_vegan' | 'is_available' | 'sort_order'>>): Promise<void> {
  const { error } = await supabase.from('menu_items').update(updates).eq('id', itemId);
  if (error) console.error('Error updating item:', error);
}

export async function deleteMenuItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
  if (error) console.error('Error deleting item:', error);
}

export async function fetchMenuItemSides(menuItemId: string): Promise<MenuItemSide[]> {
  const { data, error } = await supabase
    .from('menu_item_sides')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .order('sort_order', { ascending: true });
  if (error) { console.error('Error fetching sides:', error); return []; }
  return (data ?? []) as MenuItemSide[];
}

export async function fetchMenuItemVariants(menuItemId: string): Promise<MenuItemVariant[]> {
  const { data, error } = await supabase
    .from('menu_item_variants')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .order('sort_order', { ascending: true });
  if (error) { console.error('Error fetching variants:', error); return []; }
  return (data ?? []) as MenuItemVariant[];
}

export async function fetchMenuItemDetail(itemId: string): Promise<MenuItemWithDetails | null> {
  const { data: item, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', itemId)
    .single();
  if (error || !item) { console.error('Error fetching item:', error); return null; }
  const [sides, variants, voteSummary] = await Promise.all([
    fetchMenuItemSides(itemId),
    fetchMenuItemVariants(itemId),
    fetchMenuItemVoteSummary(itemId),
  ]);
  return { ...(item as MenuItemRecord), sides, variants, vote_summary: voteSummary };
}

export async function fetchMenuItemVoteSummary(itemId: string): Promise<MenuItemVoteSummary | null> {
  const { data, error } = await supabase
    .from('menu_item_vote_summary')
    .select('*')
    .eq('menu_item_id', itemId)
    .maybeSingle();
  if (error) { console.error('Error fetching vote summary:', error); return null; }
  return (data as MenuItemVoteSummary | null) ?? null;
}

export async function fetchMenuItemVoteSummaries(itemIds: string[]): Promise<Record<string, MenuItemVoteSummary>> {
  if (!itemIds.length) return {};
  const { data, error } = await supabase
    .from('menu_item_vote_summary')
    .select('*')
    .in('menu_item_id', itemIds);
  if (error) { console.error('Error fetching vote summaries:', error); return {}; }
  const map: Record<string, MenuItemVoteSummary> = {};
  for (const row of (data ?? []) as MenuItemVoteSummary[]) map[row.menu_item_id] = row;
  return map;
}

export async function searchMenuItems(accountId: string, query: string): Promise<MenuItemRecord[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('search_menu_items', {
    p_account_id: accountId,
    p_query: q,
  });
  if (error) { console.error('Error searching menu items:', error); return []; }
  return (data ?? []) as MenuItemRecord[];
}

export async function createMenuItemSide(input: {
  menu_item_id: string;
  name: string;
  description?: string | null;
  price_delta?: number;
  is_default?: boolean;
  sort_order?: number;
}): Promise<MenuItemSide | null> {
  const { data, error } = await supabase.from('menu_item_sides').insert(input).select().single();
  if (error) { console.error('Error creating side:', error); return null; }
  return data as MenuItemSide;
}
