import { useState, useEffect } from 'react';
import { BusinessDealWithBusiness } from '@/lib/types';
import { fetchActiveDeals } from '@/lib/supabase-deals';

type UseBusinessDealsResult = {
  deals: BusinessDealWithBusiness[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useBusinessDeals(): UseBusinessDealsResult {
  const [deals, setDeals] = useState<BusinessDealWithBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchActiveDeals();
      setDeals(data as BusinessDealWithBusiness[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch deals'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    deals,
    loading,
    error,
    refetch: fetchData,
  };
}
