"use client";

import { useCallback, useEffect, useState } from "react";

export interface MuenzenQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Reload bypassing the server cache. */
  refresh: () => void;
  /** True while a manual refresh is in flight (data still shown). */
  refreshing: boolean;
}

/**
 * Fetch a /api/muenzen/<path> endpoint with loading/error state and a
 * cache-busting manual refresh. `path` may include a query string.
 */
export function useMuenzen<T>(path: string): MuenzenQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (fresh: boolean) => {
      if (fresh) setRefreshing(true);
      setError(null);
      try {
        const sep = path.includes("?") ? "&" : "?";
        const url = `/api/muenzen/${path}${fresh ? `${sep}fresh=1` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        setData((await res.json()) as T);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  useEffect(() => {
    setLoading(true);
    load(false);
  }, [load]);

  return { data, loading, error, refresh: () => load(true), refreshing };
}

/** POST/PATCH/DELETE helper for the operational console writes. */
export async function muenzenWrite(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<any> {
  const res = await fetch(`/api/muenzen/${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
