import { useState, useEffect } from 'react';
import { BusinessRecord } from '@/lib/types';
import { fetchBusinesses } from '@/lib/supabase-businesses';

type UseBusinessesResult = {
  businesses: BusinessRecord[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useBusinesses(): UseBusinessesResult {
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchBusinesses();
      setBusinesses(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch businesses'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    businesses,
    loading,
    error,
    refetch: fetchData,
  };
}
