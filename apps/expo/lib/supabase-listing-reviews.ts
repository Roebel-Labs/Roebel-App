import { supabase } from './supabase';

/**
 * Reviews / comments on a Marktplatz listing (table
 * `marketplace_listing_reviews`, migration 20261121c). One per person and
 * listing; stars are optional. Until the migration is applied every read
 * returns [] and the UI simply shows no review section.
 */
export type ListingReview = {
  id: string;
  listing_id: string;
  wallet_address: string;
  stars: number | null;
  content: string;
  is_ai: boolean;
  created_at: string;
  updated_at: string;
  author: {
    username: string | null;
    display_name: string | null;
    profile_picture_url: string | null;
    is_verified_citizen: boolean | null;
  } | null;
};

const SELECT = `
  id, listing_id, wallet_address, stars, content, is_ai, created_at, updated_at,
  author:users!marketplace_listing_reviews_wallet_address_fkey(
    username, display_name, profile_picture_url, is_verified_citizen
  )
`;

export const listingReviewsQueryKey = (listingId: string) => ['listing-reviews', listingId] as const;

export async function fetchListingReviews(listingId: string): Promise<ListingReview[]> {
  const { data, error } = await supabase
    .from('marketplace_listing_reviews')
    .select(SELECT)
    .eq('listing_id', listingId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    // 42P01 = table not created yet (migration pending) — expected, stay quiet.
    if (error.code !== '42P01' && error.code !== 'PGRST205') {
      console.error('Error fetching listing reviews:', error);
    }
    return [];
  }
  return (data ?? []) as unknown as ListingReview[];
}

export async function upsertListingReview(input: {
  listing_id: string;
  wallet_address: string;
  stars: number | null;
  content: string;
}): Promise<ListingReview> {
  const { data, error } = await supabase
    .from('marketplace_listing_reviews')
    .upsert(
      {
        listing_id: input.listing_id,
        wallet_address: input.wallet_address,
        stars: input.stars,
        content: input.content.trim(),
        updated_at: new Date().toISOString(),
        // The client is untyped (no generated DB types) → insert payloads infer `never`.
      } as never,
      { onConflict: 'listing_id,wallet_address' },
    )
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as unknown as ListingReview;
}

/** Average of the reviews that carry stars, or null when none do. */
export function averageStars(reviews: ListingReview[]): number | null {
  const rated = reviews.filter((r) => typeof r.stars === 'number');
  if (rated.length === 0) return null;
  return rated.reduce((sum, r) => sum + (r.stars ?? 0), 0) / rated.length;
}

export function reviewAuthorName(review: ListingReview): string {
  return review.author?.display_name || review.author?.username || 'Jemand aus Röbel';
}
