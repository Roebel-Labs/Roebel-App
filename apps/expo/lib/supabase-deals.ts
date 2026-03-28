import { supabase } from './supabase';
import type { BusinessDealRecord, CreateDealInput, DealAnalytics } from './types';

/**
 * Fetch all deals for a business
 */
export async function fetchDealsByBusiness(businessId: string): Promise<BusinessDealRecord[]> {
  const { data, error } = await supabase
    .from('business_deals')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching deals:', error);
    return [];
  }

  return data as BusinessDealRecord[];
}

/**
 * Fetch a single deal by ID
 */
export async function fetchDealById(dealId: string): Promise<BusinessDealRecord | null> {
  const { data, error } = await supabase
    .from('business_deals')
    .select('*')
    .eq('id', dealId)
    .single();

  if (error) {
    console.error('Error fetching deal:', error);
    return null;
  }

  return data as BusinessDealRecord;
}

/**
 * Create a new deal
 */
export async function createDeal(deal: CreateDealInput): Promise<BusinessDealRecord> {
  const { data, error } = await supabase
    .from('business_deals')
    .insert({
      ...deal,
      status: deal.status || 'draft',
      is_active: deal.status === 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating deal:', error);
    throw error;
  }

  return data as BusinessDealRecord;
}

/**
 * Update a deal
 */
export async function updateDeal(
  dealId: string,
  updates: Partial<Pick<BusinessDealRecord, 'title' | 'description' | 'deal_type' | 'deal_value' | 'image_url' | 'start_date' | 'end_date' | 'status' | 'is_active'>>
): Promise<BusinessDealRecord> {
  const { data, error } = await supabase
    .from('business_deals')
    .update(updates)
    .eq('id', dealId)
    .select()
    .single();

  if (error) {
    console.error('Error updating deal:', error);
    throw error;
  }

  return data as BusinessDealRecord;
}

/**
 * Delete a deal
 */
export async function deleteDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from('business_deals')
    .delete()
    .eq('id', dealId);

  if (error) {
    console.error('Error deleting deal:', error);
    throw error;
  }
}

/**
 * Increment deal views count
 */
export async function incrementDealViews(dealId: string): Promise<void> {
  const { data } = await supabase
    .from('business_deals')
    .select('views_count')
    .eq('id', dealId)
    .single();

  if (data) {
    await supabase
      .from('business_deals')
      .update({ views_count: (data.views_count || 0) + 1 })
      .eq('id', dealId);
  }
}

/**
 * Increment deal clicks count
 */
export async function incrementDealClicks(dealId: string): Promise<void> {
  const { data } = await supabase
    .from('business_deals')
    .select('clicks_count')
    .eq('id', dealId)
    .single();

  if (data) {
    await supabase
      .from('business_deals')
      .update({ clicks_count: (data.clicks_count || 0) + 1 })
      .eq('id', dealId);
  }
}

/**
 * Toggle deal boost status
 */
export async function toggleDealBoost(
  dealId: string,
  isBoosted: boolean,
  boostExpiresAt?: string
): Promise<void> {
  const { error } = await supabase
    .from('business_deals')
    .update({
      is_boosted: isBoosted,
      boost_expires_at: isBoosted ? (boostExpiresAt || null) : null,
    })
    .eq('id', dealId);

  if (error) {
    console.error('Error toggling deal boost:', error);
    throw error;
  }
}

/**
 * Fetch all active deals (public-facing) with business info
 */
export async function fetchActiveDeals(): Promise<(BusinessDealRecord & { business?: any })[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('business_deals')
    .select('*, business:businesses(id, name, slug, logo_url, category)')
    .eq('status', 'active')
    .eq('is_active', true)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('is_boosted', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching active deals:', error);
    return [];
  }

  return data as (BusinessDealRecord & { business?: any })[];
}

/**
 * Fetch analytics for a business's deals
 */
export async function fetchDealAnalytics(businessId: string): Promise<DealAnalytics> {
  const { data, error } = await supabase
    .from('business_deals')
    .select('id, deal_type, status, is_boosted, views_count, clicks_count')
    .eq('business_id', businessId);

  if (error) {
    console.error('Error fetching deal analytics:', error);
    return {
      totalDeals: 0,
      activeDeals: 0,
      totalViews: 0,
      totalClicks: 0,
      boostedDeals: 0,
      dealsByType: { discount: 0, special: 0, event: 0, new_product: 0 },
    };
  }

  const deals = data || [];
  return {
    totalDeals: deals.length,
    activeDeals: deals.filter(d => d.status === 'active').length,
    totalViews: deals.reduce((sum, d) => sum + (d.views_count || 0), 0),
    totalClicks: deals.reduce((sum, d) => sum + (d.clicks_count || 0), 0),
    boostedDeals: deals.filter(d => d.is_boosted).length,
    dealsByType: {
      discount: deals.filter(d => d.deal_type === 'discount').length,
      special: deals.filter(d => d.deal_type === 'special').length,
      event: deals.filter(d => d.deal_type === 'event').length,
      new_product: deals.filter(d => d.deal_type === 'new_product').length,
    },
  };
}
