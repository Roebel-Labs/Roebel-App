import { supabase } from './supabase';
import type { MenuCategoryRecord, MenuItemRecord } from './types';

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
