import { useState, useEffect } from 'react';
import { MarketplaceListingRecord } from '@/lib/types';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';

type UseMarketplaceListingsResult = {
  listings: MarketplaceListingRecord[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useMarketplaceListings(options?: {
  category?: string;
  limit?: number;
}): UseMarketplaceListingsResult {
  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMarketplaceListings(options);
      setListings(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch listings'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    listings,
    loading,
    error,
    refetch: fetchData,
  };
}
