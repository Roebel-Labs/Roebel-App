import { useEffect, useMemo } from 'react';
import { useInterest } from '@/context/InterestContext';

/**
 * Loads the interest previews (count + first avatars) for a whole list of
 * events in one batch — a rail calls this once instead of every card
 * querying on its own. Pass a referentially stable array (memoised bucket
 * or query data) so the effect only re-runs when the list really changes.
 */
export function useInterestPreviews(events: readonly { id: string }[]) {
  const { loadPreviews } = useInterest();
  const ids = useMemo(() => events.map((e) => e.id), [events]);
  useEffect(() => {
    if (ids.length > 0) loadPreviews(ids);
  }, [ids, loadPreviews]);
}
