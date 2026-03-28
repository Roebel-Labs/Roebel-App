import { useState, useEffect } from 'react';
import { RestaurantWithMenus } from '@/lib/types';
import { fetchRestaurantBySlug } from '@/lib/supabase-restaurants';

type UseRestaurantDetailResult = {
  restaurant: RestaurantWithMenus | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useRestaurantDetail(slug: string): UseRestaurantDetailResult {
  const [restaurant, setRestaurant] = useState<RestaurantWithMenus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    if (!slug) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchRestaurantBySlug(slug);
      setRestaurant(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch restaurant'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [slug]);

  return {
    restaurant,
    loading,
    error,
    refetch: fetchData,
  };
}
