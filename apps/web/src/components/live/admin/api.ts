"use client";

import { toast } from "sonner";

export type LiveAdminResponse<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export class LiveAdminError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** POST /api/live/admin { action, show_id, ...payload } → data, throws LiveAdminError on { ok:false }. */
export async function liveAdmin<T = unknown>(action: string, showId: string, payload: Record<string, unknown> = {}): Promise<T> {
  let json: LiveAdminResponse<T> | null = null;
  try {
    const res = await fetch("/api/live/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action, show_id: showId, ...payload }),
    });
    json = (await res.json().catch(() => null)) as LiveAdminResponse<T> | null;
    if (!json) throw new LiveAdminError(`HTTP_${res.status}`, `Serverfehler (${res.status})`);
  } catch (e) {
    if (e instanceof LiveAdminError) throw e;
    throw new LiveAdminError("NETWORK", "Keine Verbindung zum Server.");
  }
  if (!json.ok) throw new LiveAdminError(json.code, json.message || json.code);
  return json.data;
}

/** liveAdmin + error toast; resolves to null on failure so call sites stay flat. */
export async function liveAdminSafe<T = unknown>(
  action: string,
  showId: string,
  payload: Record<string, unknown> = {},
  success?: string,
): Promise<T | null> {
  try {
    const data = await liveAdmin<T>(action, showId, payload);
    if (success) toast.success(success);
    return data;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
    return null;
  }
}
