// "Röbel App unterstützen" — Stripe Checkout via the web backend (POST /api/app-support), same connected
// account as the DanceCup live support. Opens in the in-app browser and comes back on roebel://unterstuetzen.

import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

const DEFAULT_API_BASE_URL = 'https://roebel.app';
const RETURN_URL = 'roebel://unterstuetzen';

function apiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  return env && env.length > 0 ? env.replace(/\/$/, '') : DEFAULT_API_BASE_URL;
}

export type SupportInterval = 'once' | 'month';

export const SUPPORT_PRESETS: Record<SupportInterval, { amounts: number[]; popular: number }> = {
  once: { amounts: [5, 10, 25, 50], popular: 10 },
  month: { amounts: [3, 5, 10, 20], popular: 5 },
};
export const SUPPORT_MIN_EUR = 1;
export const SUPPORT_MAX_EUR = 500;
export const SUPPORT_MESSAGE_MAX = 140;

export async function startAppSupport(input: {
  amountEur: number;
  interval: SupportInterval;
  wallet?: string | null;
  displayName?: string | null;
  showName: boolean;
  message?: string | null;
}): Promise<{ ok: true; url: string; supportId: string } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000); // RN fetch has no timeout of its own
  try {
    const res = await fetch(`${apiBase()}/api/app-support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        amount_cents: Math.round(input.amountEur * 100),
        interval: input.interval,
        ...(input.wallet ? { wallet: input.wallet.toLowerCase() } : {}),
        show_name: input.showName,
        ...(input.displayName?.trim() ? { display_name: input.displayName.trim().slice(0, 60) } : {}),
        ...(input.showName && input.message?.trim() ? { message: input.message.trim().slice(0, SUPPORT_MESSAGE_MAX) } : {}),
      }),
    });
    // Server shape: { ok: true, data: { url } } | { ok: false, code, message }
    const body = (await res.json().catch(() => null)) as { data?: { url?: string; support_id?: string }; message?: string } | null;
    const url = body?.data?.url;
    const supportId = body?.data?.support_id ?? '';
    if (!res.ok || !url) {
      return { ok: false, message: body?.message ?? 'Die Zahlung konnte nicht gestartet werden. Bitte versuche es erneut.' };
    }
    return { ok: true, url, supportId };
  } catch {
    return { ok: false, message: 'Keine Verbindung. Bitte versuche es erneut.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Stripe Checkout in the in-app browser; resolves 'success' when it came back on roebel://unterstuetzen/danke. */
export async function openAppSupportCheckout(url: string): Promise<'success' | 'cancelled' | 'closed'> {
  try {
    const r = await WebBrowser.openAuthSessionAsync(url, RETURN_URL, { showInRecents: true });
    if (r.type === 'success') return r.url.includes('/danke') ? 'success' : 'cancelled';
    return 'closed';
  } catch {
    return 'closed';
  }
}

/** After Checkout: settle by asking Stripe through the server (does not wait for the webhook). */
export async function confirmAppSupport(supportId: string): Promise<boolean> {
  if (!supportId) return false;
  for (const wait of [0, 1500, 3000, 6000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(`${apiBase()}/api/app-support/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ support_id: supportId }),
      });
      const body = (await res.json().catch(() => null)) as { data?: { status?: string } } | null;
      const st = body?.data?.status;
      if (st === 'paid') return true;
      if (st && st !== 'pending') return false;
    } catch {
      // retry
    }
  }
  return false;
}

export interface Supporter {
  id: string;
  /** null = not public → "Jemand" */
  name: string | null;
  message: string | null;
  amountCents: number;
  interval: SupportInterval;
  paidAt: string;
}

export async function fetchSupporters(limit = 50): Promise<{ total: number; items: Supporter[] }> {
  const { data, error } = await supabase.rpc('app_supporters_public', { p_limit: limit });
  if (error || !Array.isArray(data)) return { total: 0, items: [] };
  const rows = data as {
    id: string; name: string | null; message: string | null; amount_cents: number; interval: string; paid_at: string; total_count: number;
  }[];
  return {
    total: rows.length ? Number(rows[0].total_count) || rows.length : 0,
    items: rows.map((r) => ({
      id: r.id, name: r.name, message: r.message, amountCents: r.amount_cents,
      interval: r.interval === 'month' ? 'month' : 'once', paidAt: r.paid_at,
    })),
  };
}

/** "vor 5 Min." / "vor 3 Std." / "vor 2 Tagen" */
export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}
