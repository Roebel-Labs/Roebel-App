"use client";

import { useEffect, useState } from "react";
import { fetchGastroData, type GastroData } from "@/lib/supabase-gastro";

export interface UseGastroData extends GastroData {
  loading: boolean;
}

export function useGastroData(accountId: string | null): UseGastroData {
  const [data, setData] = useState<GastroData>({
    restaurant: null,
    categories: [],
    voteSummaries: {},
  });
  const [loading, setLoading] = useState(!!accountId);

  useEffect(() => {
    if (!accountId) {
      setData({ restaurant: null, categories: [], voteSummaries: {} });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetchGastroData(accountId);
        if (!cancelled) setData(res);
      } catch (err) {
        console.error("useGastroData error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return { ...data, loading };
}
