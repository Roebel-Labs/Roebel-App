/** Query hooks for the org Dashboard; cached per account + range. */
import { useQuery } from '@tanstack/react-query';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import {
  fetchAnalyticsSeries,
  fetchAnalyticsTotals,
  fetchSurfaces,
  fetchTopObjects,
  fetchUniques,
  type AnalyticsMetric,
  type AnalyticsObjectType,
} from '@/lib/analytics/queries';
import type { DayRange } from '@/lib/charts/ranges';

function useScope() {
  const { activeAccount } = useAccount();
  const { user } = useUser();
  const accountId = activeAccount?.id ?? null;
  const wallet = user?.wallet_address ?? null;
  return { accountId, wallet, enabled: !!accountId && !!wallet };
}

const STALE = 60_000;

export function useAnalyticsTotals(range: DayRange, objectType: AnalyticsObjectType | null = null) {
  const s = useScope();
  return useQuery({
    queryKey: ['org-analytics', 'totals', s.accountId, range.from, range.to, objectType],
    queryFn: () => fetchAnalyticsTotals(s.accountId!, s.wallet!, range, objectType),
    enabled: s.enabled,
    staleTime: STALE,
  });
}

export function useAnalyticsSeries(range: DayRange, metrics: AnalyticsMetric[], objectType: AnalyticsObjectType | null = null) {
  const s = useScope();
  return useQuery({
    queryKey: ['org-analytics', 'series', s.accountId, range.from, range.to, metrics.join(','), objectType],
    queryFn: () => fetchAnalyticsSeries(s.accountId!, s.wallet!, range, metrics, objectType),
    enabled: s.enabled && metrics.length > 0,
    staleTime: STALE,
  });
}

export function useUniques(range: DayRange) {
  const s = useScope();
  return useQuery({
    queryKey: ['org-analytics', 'uniques', s.accountId, range.from, range.to],
    queryFn: () => fetchUniques(s.accountId!, s.wallet!, range),
    enabled: s.enabled,
    staleTime: STALE,
  });
}

export function useSurfaces(range: DayRange) {
  const s = useScope();
  return useQuery({
    queryKey: ['org-analytics', 'surfaces', s.accountId, range.from, range.to],
    queryFn: () => fetchSurfaces(s.accountId!, s.wallet!, range),
    enabled: s.enabled,
    staleTime: STALE,
  });
}

export function useTopObjects(range: DayRange, metric: AnalyticsMetric, limit = 10) {
  const s = useScope();
  return useQuery({
    queryKey: ['org-analytics', 'top', s.accountId, range.from, range.to, metric, limit],
    queryFn: () => fetchTopObjects(s.accountId!, s.wallet!, range, metric, limit),
    enabled: s.enabled,
    staleTime: STALE,
  });
}

/** Element-wise sum of several metric arrays. */
export function sumSeries(series: Record<string, number[]> | undefined, metrics: string[], length: number): number[] {
  const out = new Array(length).fill(0);
  if (!series) return out;
  for (const m of metrics) (series[m] ?? []).forEach((v, i) => (out[i] += v));
  return out;
}
