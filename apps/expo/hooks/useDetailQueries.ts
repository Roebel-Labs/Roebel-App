/** Detail-page hooks over lib/queries/detailQueries (instant detail screens). */
import { useQuery } from '@tanstack/react-query';
import type { EventRecord, MarketplaceListingRecord } from '@/lib/types';
import {
  DETAIL_STALE_MS,
  eventDetailKey,
  fetchEventDetail,
  fetchListingDetail,
  listingDetailKey,
} from '@/lib/queries/detailQueries';

/**
 * `isLoading`: nothing to show yet and a fetch is running (seeded data or an offline-paused
 * refetch never count as loading). `notFound`: the server answered "no such row".
 */
export function useEventDetail(id: string | undefined) {
  const q = useQuery({
    queryKey: eventDetailKey(id ?? ''),
    queryFn: () => fetchEventDetail(id!),
    enabled: !!id,
    staleTime: DETAIL_STALE_MS,
  });
  const event: EventRecord | null = q.data ?? null;
  return {
    event,
    isLoading: q.data === undefined && q.fetchStatus === 'fetching',
    notFound: q.status === 'success' && q.data === null,
    refetch: q.refetch,
  };
}

export function useListingDetail(id: string | undefined) {
  const q = useQuery({
    queryKey: listingDetailKey(id ?? ''),
    queryFn: () => fetchListingDetail(id!),
    enabled: !!id,
    staleTime: DETAIL_STALE_MS,
  });
  const listing: MarketplaceListingRecord | null = q.data ?? null;
  return {
    listing,
    isLoading: q.data === undefined && q.fetchStatus === 'fetching',
    notFound: q.status === 'success' && q.data === null,
    refetch: q.refetch,
  };
}
