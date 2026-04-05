import { supabase } from './supabase';
import type {
  RestaurantRecord,
  RestaurantWithMenus,
  OpeningHours,
  SpecialMenuRecord,
  SpecialMenuWithDetails,
} from './types';

/**
 * Fetch all published restaurants for home screen
 */
export async function fetchRestaurants(): Promise<RestaurantRecord[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching restaurants:', error);
    return [];
  }

  return data as RestaurantRecord[];
}

/**
 * Fetch a single restaurant with all menus by slug
 */
export async function fetchRestaurantBySlug(slug: string): Promise<RestaurantWithMenus | null> {
  const { data, error } = await supabase
    .from('restaurants')
    .select(`
      *,
      menu_categories (
        *,
        menu_items (*)
      ),
      special_menus (*)
    `)
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) {
    console.error('Error fetching restaurant:', error);
    return null;
  }

  // Sort menu categories and items by sort_order
  if (data?.menu_categories) {
    data.menu_categories.sort((a: any, b: any) => a.sort_order - b.sort_order);
    data.menu_categories.forEach((cat: any) => {
      if (cat.menu_items) {
        cat.menu_items.sort((a: any, b: any) => a.sort_order - b.sort_order);
      }
    });
  }

  if (data?.special_menus) {
    data.special_menus.sort((a: any, b: any) => a.sort_order - b.sort_order);
  }

  return data as RestaurantWithMenus;
}

/**
 * Fetch a special menu with all details by ID
 */
export async function fetchSpecialMenuById(id: string): Promise<SpecialMenuWithDetails | null> {
  const { data, error } = await supabase
    .from('special_menus')
    .select(`
      *,
      restaurant:restaurants (*),
      special_menu_categories (
        *,
        special_menu_items (*)
      )
    `)
    .eq('id', id)
    .eq('status', 'published')
    .single();

  if (error) {
    console.error('Error fetching special menu:', error);
    return null;
  }

  // Sort categories and items by sort_order
  if (data?.special_menu_categories) {
    data.special_menu_categories.sort((a: any, b: any) => a.sort_order - b.sort_order);
    data.special_menu_categories.forEach((cat: any) => {
      if (cat.special_menu_items) {
        cat.special_menu_items.sort((a: any, b: any) => a.sort_order - b.sort_order);
      }
    });
  }

  return data as SpecialMenuWithDetails;
}

/**
 * Fetch active special menus for feed integration
 */
export async function fetchActiveSpecialMenus(limit: number = 3): Promise<SpecialMenuRecord[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('special_menus')
    .select('*')
    .eq('status', 'published')
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching active special menus:', error);
    return [];
  }

  return data as SpecialMenuRecord[];
}

/**
 * Fetch featured restaurants for home screen
 */
export async function fetchFeaturedRestaurants(): Promise<RestaurantRecord[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('status', 'published')
    .eq('is_featured', true)
    .order('sort_order', { ascending: true })
    .limit(6);

  if (error) {
    console.error('Error fetching featured restaurants:', error);
    return [];
  }

  return data as RestaurantRecord[];
}

/**
 * Create a new restaurant (status = 'pending', linked to account)
 */
export async function createRestaurant(input: {
  name: string;
  account_id: string;
  description?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  address?: string | null;
  phone?: string | null;
  website_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<RestaurantRecord> {
  const slug = input.name
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const { data, error } = await supabase
    .from('restaurants')
    .insert({
      ...input,
      slug: `${slug}-${Date.now().toString(36)}`,
      status: 'pending',
      background_color: '#194383',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating restaurant:', error);
    throw error;
  }

  return data as RestaurantRecord;
}
