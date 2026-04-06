import { supabase } from './supabase';
import type { MarketplaceListingRecord } from './types';

/**
 * Fetch active marketplace listings
 */
export async function fetchMarketplaceListings(options?: {
  category?: string;
  limit?: number;
}): Promise<MarketplaceListingRecord[]> {
  let query = supabase
    .from('marketplace_listings')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (options?.category) {
    query = query.eq('category', options.category);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching marketplace listings:', error);
    return [];
  }

  return data as MarketplaceListingRecord[];
}

/**
 * Create a new marketplace listing
 */
export async function createMarketplaceListing(listing: {
  seller_wallet_address: string;
  title: string;
  description: string;
  price: number;
  price_type: 'fixed' | 'negotiable' | 'free';
  category: string;
  condition: 'neu' | 'wie_neu' | 'gut' | 'akzeptabel' | null;
  neighborhood?: string;
  media_urls?: string[];
  listing_type?: 'product' | 'service';
}): Promise<MarketplaceListingRecord | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert({
      ...listing,
      status: 'active',
      listing_type: listing.listing_type || 'product',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating marketplace listing:', error);
    throw error;
  }

  return data as MarketplaceListingRecord;
}

/**
 * Fetch marketplace listings scoped to an org account
 */
export async function fetchOrgListings(
  accountId: string,
  listingType?: 'product' | 'service'
): Promise<MarketplaceListingRecord[]> {
  let query = supabase
    .from('marketplace_listings')
    .select('*')
    .eq('account_id', accountId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (listingType) {
    query = query.eq('listing_type', listingType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching org listings:', error);
    return [];
  }

  return data as MarketplaceListingRecord[];
}

/**
 * Create a marketplace listing scoped to an org account
 */
export async function createOrgListing(
  accountId: string,
  sellerWalletAddress: string,
  listing: {
    title: string;
    description: string;
    price: number;
    price_type: 'fixed' | 'negotiable' | 'free';
    category: string;
    condition: 'neu' | 'wie_neu' | 'gut' | 'akzeptabel' | null;
    neighborhood?: string;
    media_urls?: string[];
    listing_type: 'product' | 'service';
  }
): Promise<MarketplaceListingRecord | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert({
      ...listing,
      account_id: accountId,
      seller_wallet_address: sellerWalletAddress,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating org listing:', error);
    throw error;
  }

  return data as MarketplaceListingRecord;
}

/**
 * Update a marketplace listing
 */
export async function updateListing(
  id: string,
  updates: Partial<Pick<MarketplaceListingRecord, 'title' | 'description' | 'price' | 'price_type' | 'category' | 'condition' | 'media_urls' | 'status'>>
): Promise<MarketplaceListingRecord | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating listing:', error);
    throw error;
  }

  return data as MarketplaceListingRecord;
}

/**
 * Delete (soft) a marketplace listing
 */
export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketplace_listings')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting listing:', error);
    throw error;
  }
}

/**
 * Fetch a single listing by ID
 */
export async function fetchListingById(id: string): Promise<MarketplaceListingRecord | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching listing:', error);
    return null;
  }

  return data as MarketplaceListingRecord;
}
