/**
 * The one way into event / marketplace detail pages: seeds the detail query
 * with the card's record (instant first frame), then navigates.
 * Cards that only know an id pass { id }.
 */
import { router } from 'expo-router';
import type { EventRecord, MarketplaceListingRecord } from '@/lib/types';
import { seedEventDetail, seedListingDetail } from '@/lib/queries/detailQueries';

type Opts = { replace?: boolean; params?: Record<string, string> };

const isFull = (o: object) => Object.keys(o).length > 1;

export function openEvent(event: EventRecord | { id: string }, opts: Opts = {}): void {
  if (isFull(event)) seedEventDetail(event as EventRecord);
  const href = { pathname: '/event/[id]' as const, params: { ...opts.params, id: event.id } };
  if (opts.replace) router.replace(href);
  else router.push(href);
}

export function openListing(listing: MarketplaceListingRecord | { id: string }, opts: Opts = {}): void {
  if (isFull(listing)) seedListingDetail(listing as MarketplaceListingRecord);
  const href = { pathname: '/marketplace/[id]' as const, params: { id: listing.id } };
  if (opts.replace) router.replace(href);
  else router.push(href);
}
