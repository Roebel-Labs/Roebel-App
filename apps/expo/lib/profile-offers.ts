import type { MarketplaceListingRecord, BusinessDealRecord } from './types';

// A record is renderable only if it has a stable key and a string title — the
// same guard the org profile screen applies inline to every media section.
function isRenderable(item: { id?: unknown; title?: unknown } | null | undefined): boolean {
  return !!item && !!item.id && typeof item.title === 'string';
}

export type PreparedOffers = {
  listings: MarketplaceListingRecord[];
  deals: BusinessDealRecord[];
  hasContent: boolean;
};

/**
 * Filter listings/deals down to the renderable ones and report whether there is
 * anything to show. Pure so it can be unit-tested; the presentational row
 * component renders `null` when `hasContent` is false.
 */
export function prepareProfileOffers(
  listings: MarketplaceListingRecord[] | null | undefined,
  deals?: BusinessDealRecord[] | null
): PreparedOffers {
  const safeListings = (listings ?? []).filter(isRenderable);
  const safeDeals = (deals ?? []).filter(isRenderable);
  return {
    listings: safeListings,
    deals: safeDeals,
    hasContent: safeListings.length > 0 || safeDeals.length > 0,
  };
}

/**
 * Format a marketplace price for a listing card. Mirrors the org profile
 * screen's inline formatter: free → "Gratis", negotiable adds " VB", and a
 * missing/non-finite price on a paid listing yields an empty string.
 */
export function formatOfferPrice(
  price: number | null | undefined,
  priceType: string
): string {
  if (priceType === 'free') return 'Gratis';
  if (typeof price !== 'number' || !Number.isFinite(price)) return '';
  const formatted = price.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} €${priceType === 'negotiable' ? ' VB' : ''}`;
}
