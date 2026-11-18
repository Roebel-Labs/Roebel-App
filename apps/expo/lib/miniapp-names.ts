/**
 * Display names for wallet addresses on the mini-app confirm sheet.
 *
 * The sheet is built synchronously, so the host first prefetches the names of every address in
 * a request (`prefetchNames`) and then hands `cachedName` to the sheet builders. Unknown
 * addresses resolve to null (the sheet then says "Unbekanntes Konto"). A failed or slow lookup
 * (4 s, AbortController: RN fetch never times out) leaves the names unknown; it never blocks.
 */
import { supabase } from '@/lib/supabase';

const LOOKUP_TIMEOUT_MS = 4_000;
const MAX_LOOKUP = 20;
const ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

/** lowercased address → name (null = looked up, unknown). */
const cache = new Map<string, string | null>();

/** Every address mentioned anywhere in a request's params (deduplicated, lowercased). */
export function addressesIn(value: unknown): string[] {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  } catch {
    return [];
  }
  return [...new Set((text.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))];
}

export async function prefetchNames(addresses: string[]): Promise<void> {
  const missing = [...new Set(addresses.map((a) => a.toLowerCase()))]
    .filter((a) => !cache.has(a))
    .slice(0, MAX_LOOKUP);
  if (missing.length === 0) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('users')
      .select('wallet_address, display_name, username')
      .in('wallet_address', missing)
      .abortSignal(controller.signal);
    if (error) return;
    const found = new Map<string, string>();
    for (const row of (data ?? []) as { wallet_address: string; display_name: string | null; username: string | null }[]) {
      const name = row.display_name?.trim() || row.username?.trim();
      // A name that is itself an address (auto-generated) is no name for the sheet.
      if (name && !/0x[0-9a-fA-F]{6,}/.test(name) && row.wallet_address) found.set(row.wallet_address.toLowerCase(), name);
    }
    for (const a of missing) cache.set(a, found.get(a) ?? null);
  } catch {
    /* unknown names stay unknown; retried on the next request */
  } finally {
    clearTimeout(timer);
  }
}

export function cachedName(address: string): string | null {
  return cache.get(address.toLowerCase()) ?? null;
}
