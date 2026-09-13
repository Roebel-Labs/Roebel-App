/**
 * Community score per organisation for the Empfehlungen sheet — thumbs-up
 * and saves from the two summary views, fetched once per set of accounts.
 *
 * Never blocks the list: the sheet renders in source order immediately and
 * re-sorts when the numbers arrive. Pass `null` to fetch nothing.
 */
import { useEffect, useState } from 'react';

import { scoresFromSummaries } from '@/lib/map/category-items';
import { fetchAccountSaveSummaries } from '@/lib/supabase-account-saves';
import { fetchAccountVoteSummaries } from '@/lib/supabase-ratings';

export function useRecommendationScores(accountIds: string[] | null): Record<string, number> {
  const [scores, setScores] = useState<Record<string, number>>({});
  const key = accountIds && accountIds.length ? accountIds.join(',') : '';

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    let cancelled = false;
    Promise.all([fetchAccountVoteSummaries(ids), fetchAccountSaveSummaries(ids)])
      .then(([votes, saves]) => {
        if (!cancelled) setScores(scoresFromSummaries(Object.values(votes), saves));
      })
      .catch((error) => console.warn('useRecommendationScores', error));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return scores;
}
