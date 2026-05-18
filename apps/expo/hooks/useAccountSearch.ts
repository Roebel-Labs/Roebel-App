import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  searchAccounts,
  type AccountSearchResult,
  type AccountSearchScope,
} from '@/lib/supabase-account-search';

const DEBOUNCE_MS = 220;
const MIN_QUERY = 2;

export function useAccountSearch(
  rawQuery: string,
  scope: AccountSearchScope,
  excludeAccountId: string | null
): {
  results: AccountSearchResult[];
  isLoading: boolean;
  hasQuery: boolean;
  error: string | null;
} {
  const trimmed = rawQuery.trim();
  const debouncedQuery = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const debouncedScope = useDebouncedValue(scope, 0);

  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);

  // Show loading the moment the user types (debounce gate is just for
  // network) so the UI doesn't feel laggy with stale results.
  useEffect(() => {
    if (trimmed.length < MIN_QUERY) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [trimmed]);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const seq = ++sequenceRef.current;
    setError(null);

    (async () => {
      try {
        const rows = await searchAccounts(debouncedQuery, debouncedScope, excludeAccountId);
        if (sequenceRef.current !== seq) return; // stale
        setResults(rows);
      } catch (err) {
        if (sequenceRef.current !== seq) return;
        console.error('useAccountSearch error:', err);
        setError('Suche fehlgeschlagen');
        setResults([]);
      } finally {
        if (sequenceRef.current === seq) setIsLoading(false);
      }
    })();
  }, [debouncedQuery, debouncedScope, excludeAccountId]);

  return {
    results,
    isLoading,
    hasQuery: trimmed.length >= MIN_QUERY,
    error,
  };
}
