import { supabase } from './supabase';
import type { BusinessRecord, CreateBusinessInput } from './types';

/**
 * Fetch all approved businesses
 */
export async function fetchBusinesses(): Promise<BusinessRecord[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('status', 'approved')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching businesses:', error);
    return [];
  }

  return data as BusinessRecord[];
}

/**
 * Fetch a single business by slug
 */
export async function fetchBusinessBySlug(slug: string): Promise<BusinessRecord | null> {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'approved')
    .single();

  if (error) {
    console.error('Error fetching business:', error);
    return null;
  }

  return data as BusinessRecord;
}

/**
 * Fetch all businesses owned by a wallet address (any status)
 */
export async function fetchBusinessesByOwner(walletAddress: string): Promise<BusinessRecord[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_wallet_address', walletAddress.toLowerCase())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user businesses:', error);
    return [];
  }

  return data as BusinessRecord[];
}

/**
 * Create a new business profile (status = 'pending')
 */
export async function createBusiness(input: CreateBusinessInput): Promise<BusinessRecord> {
  const slug = input.name
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      ...input,
      owner_wallet_address: input.owner_wallet_address.toLowerCase(),
      slug: `${slug}-${Date.now().toString(36)}`,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating business:', error);
    throw error;
  }

  return data as BusinessRecord;
}

/**
 * Update an existing business profile
 */
export async function updateBusiness(
  businessId: string,
  updates: Partial<Pick<BusinessRecord, 'name' | 'description' | 'category' | 'phone' | 'email' | 'website_url' | 'address' | 'cover_image_url' | 'logo_url' | 'gallery_images' | 'opening_hours'>>
): Promise<BusinessRecord> {
  const { data, error } = await supabase
    .from('businesses')
    .update(updates)
    .eq('id', businessId)
    .select()
    .single();

  if (error) {
    console.error('Error updating business:', error);
    throw error;
  }

  return data as BusinessRecord;
}
