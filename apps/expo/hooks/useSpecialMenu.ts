import { useState, useEffect } from 'react';
import { SpecialMenuWithDetails } from '@/lib/types';
import { fetchSpecialMenuById } from '@/lib/supabase-restaurants';

type UseSpecialMenuResult = {
  specialMenu: SpecialMenuWithDetails | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useSpecialMenu(id: string): UseSpecialMenuResult {
  const [specialMenu, setSpecialMenu] = useState<SpecialMenuWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchSpecialMenuById(id);
      setSpecialMenu(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch special menu'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  return {
    specialMenu,
    loading,
    error,
    refetch: fetchData,
  };
}
