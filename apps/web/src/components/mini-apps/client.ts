"use client";

// Client fetch helpers for the Mini App surfaces (admin console + builder
// dashboard). Mirrors the muenzen `useMuenzen` / `muenzenWrite` pattern.
import { useCallback, useEffect, useState } from "react";
import type {
  AnalyticsSummary,
  MiniAppRow,
  MiniAppVersionRow,
} from "@/lib/miniapp/types";

export interface Query<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  refreshing: boolean;
}

/** GET a /api/mini-apps/<path> endpoint with loading/error + manual refresh. */
export function useMiniAppApi<T>(path: string | null, walletHeader?: string): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (manual: boolean) => {
      if (!path) return;
      if (manual) setRefreshing(true);
      setError(null);
      try {
        const res = await fetch(`/api/mini-apps/${path}`, {
          cache: "no-store",
          headers: walletHeader ? { "x-wallet-address": walletHeader } : undefined,
        });
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
    [path, walletHeader],
  );

  useEffect(() => {
    if (path) {
      setLoading(true);
      load(false);
    }
  }, [load, path]);

  return { data, loading, error, refresh: () => load(true), refreshing };
}

/** POST/PATCH/DELETE helper. Throws Error(message) on non-2xx (with `.code`). */
export async function miniAppWrite<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  walletHeader?: string,
): Promise<T> {
  const res = await fetch(`/api/mini-apps/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(walletHeader ? { "x-wallet-address": walletHeader } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`) as Error & { code?: string };
    err.code = json.code;
    throw err;
  }
  return json as T;
}

export type { AnalyticsSummary, MiniAppRow, MiniAppVersionRow };
