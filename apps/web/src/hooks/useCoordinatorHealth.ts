"use client";

import { useCallback, useEffect, useState } from "react";
import { COORDINATOR_BASE_URL } from "@/lib/maci-config";

/**
 * /status response from apps/coordinator/scripts/healthcheck.js.
 * Mirrors the JSON shape that endpoint produces.
 */
export interface CoordinatorStatus {
  ready: boolean;
  scanInFlight: boolean;
  lastRun: {
    pollId: string;
    status: "succeeded" | "failed";
    startedAt: string;
    finishedAt: string;
    error?: string;
    tallyFile?: string;
  } | null;
  lastScan: {
    startedAt: string;
    finishedAt: string;
    status: "succeeded" | "partial" | "noop" | "scan-failed";
    pendingCount?: number;
    finalizedCount?: number;
    failedCount?: number;
    finalized?: Array<{ pollId: number; tally: string }>;
    failed?: Array<{ pollId: number; tally: string }>;
    error?: string;
  } | null;
}

export interface UseCoordinatorHealthResult {
  status: CoordinatorStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  lastFetched: Date | null;
}

const REFRESH_INTERVAL_MS = 30_000;

export function useCoordinatorHealth(): UseCoordinatorHealthResult {
  const [status, setStatus] = useState<CoordinatorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Short timeout — the Fly machine auto-wakes on first request, but we
      // don't want the dashboard to block while it boots. If we time out,
      // the user can retry; meanwhile we keep the previous status visible.
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(`${COORDINATOR_BASE_URL}/status`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as CoordinatorStatus;
      setStatus(json);
      setLastFetched(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[useCoordinatorHealth] fetch failed:", err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  return { status, isLoading, error, refresh: fetchStatus, lastFetched };
}
