import { useState, useEffect } from 'react';
import { RestaurantRecord } from '@/lib/types';
import { fetchRestaurants } from '@/lib/supabase-restaurants';

type UseRestaurantsResult = {
  restaurants: RestaurantRecord[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useRestaurants(): UseRestaurantsResult {
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchRestaurants();
      setRestaurants(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch restaurants'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    restaurants,
    loading,
    error,
    refetch: fetchData,
  };
}
