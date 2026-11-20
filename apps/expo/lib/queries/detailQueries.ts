/**
 * Instant detail screens (optimistic UI, layer 2 —
 * docs/superpowers/plans/2026-11-20-instant-detail-screens.md).
 *
 * Detail pages read React Query; cards seed the query with the record they
 * already hold, so the page renders in its first frame and refreshes in the
 * background. Seeded data is stale at once (updatedAt 0) and never replaces
 * data that is already there. Not persisted to disk (no meta.persist).
 */
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { trackListingView } from '@/lib/supabase-marketplace';
import { recordView } from '@/lib/supabase-event-views';
import { logEventView } from '@/lib/firebase';
import type { EventRecord, MarketplaceListingRecord } from '@/lib/types';

export const eventDetailKey = (id: string) => ['event-detail', id] as const;
export const listingDetailKey = (id: string) => ['listing-detail', id] as const;

/** One event; null when the row does not exist (or is hidden by RLS). Network/DB errors throw. */
export async function fetchEventDetail(id: string): Promise<EventRecord | null> {
  const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as EventRecord | null) ?? null;
}

/** One listing; null when missing. Errors throw (fetchListingById would turn them into "not found"). */
export async function fetchListingDetail(id: string): Promise<MarketplaceListingRecord | null> {
  const { data, error } = await supabase.from('marketplace_listings').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as MarketplaceListingRecord | null) ?? null;
}

function seed<T>(key: readonly unknown[], record: T): void {
  if (queryClient.getQueryData(key) !== undefined) return;
  queryClient.setQueryData(key, record, { updatedAt: 0 });
}

export function seedEventDetail(event: EventRecord): void {
  seed(eventDetailKey(event.id), event);
}

export function seedListingDetail(listing: MarketplaceListingRecord): void {
  seed(listingDetailKey(listing.id), listing);
}

export const DETAIL_STALE_MS = 30_000;

export function prefetchEventDetail(id: string): void {
  queryClient
    .prefetchQuery({ queryKey: eventDetailKey(id), queryFn: () => fetchEventDetail(id), staleTime: DETAIL_STALE_MS })
    .catch(() => {});
}

export function prefetchListingDetail(id: string): void {
  queryClient
    .prefetchQuery({ queryKey: listingDetailKey(id), queryFn: () => fetchListingDetail(id), staleTime: DETAIL_STALE_MS })
    .catch(() => {});
}

// View tracking: once per id per app session, never again on background refetches.
const trackedEvents = new Set<string>();
const trackedListings = new Set<string>();

export function trackEventOpen(event: EventRecord, address: string | undefined): void {
  if (trackedEvents.has(event.id)) return;
  trackedEvents.add(event.id);
  logEventView(event.id, event.title, event.category || undefined);
  if (address) recordView(event.id, address).catch(() => {});
}

export function trackListingOpen(listing: MarketplaceListingRecord): void {
  if (trackedListings.has(listing.id)) return;
  trackedListings.add(listing.id);
  trackListingView(listing.id).catch(() => {});
}

/** Test-only: forget which ids were tracked. */
export function __resetDetailTracking(): void {
  trackedEvents.clear();
  trackedListings.clear();
}
