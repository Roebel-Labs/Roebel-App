/**
 * Display names for wallet addresses on the mini-app confirm sheet.
 *
 * The sheet is built synchronously, so the host first prefetches the names of every address in
 * a request (`prefetchNames`) and then hands `cachedName` to the sheet builders. Unknown
 * addresses resolve to null (the sheet then says "Unbekanntes Konto"). A failed or slow lookup
 * (4 s, AbortController: RN fetch never times out) leaves the names unknown; it never blocks.
 */
import { createPublicClient, http, parseAbiItem, type Hex } from 'viem';
import { gnosis } from 'viem/chains';
import { supabase } from '@/lib/supabase';
import { GNOSIS_READ_RPC, orgRegistryGnosisAddress } from '@/constants/gnosis';
import { orgIdFromUuid } from '@/lib/org-safe/ops';

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

// --- org accounts --------------------------------------------------------------
// Org accounts have no address column: an org's on-chain account is its Safe, registered in the
// OrgRegistry under keccak(prefix + account uuid). The registry maps a Safe back to that id
// (`orgIdOfSafe`); the org's name is the account whose uuid hashes to it.

const ZERO_ID = `0x${'0'.repeat(64)}`;
const orgIdOfSafeAbi = parseAbiItem('function orgIdOfSafe(address) view returns (bytes32)');

export interface OrgNameDeps {
  /** The org id registered for a Safe (zero when none). */
  orgIdOfSafe: (address: string) => Promise<string>;
  /** Every org account (id = uuid, name). */
  orgs: () => Promise<{ id: string; name: string | null }[]>;
}

/** The name of the org whose registered Safe is `address`, else null. Never throws. */
export async function orgNameFor(address: string, deps: OrgNameDeps): Promise<string | null> {
  try {
    const orgId = (await deps.orgIdOfSafe(address)).toLowerCase();
    if (!orgId || orgId === ZERO_ID) return null;
    for (const org of await deps.orgs()) {
      try {
        if (orgIdFromUuid(org.id) === orgId) return org.name?.trim() || null;
      } catch {
        /* not a uuid */
      }
    }
    return null;
  } catch {
    return null;
  }
}

const orgCache = new Map<string, string | null>();
let orgClient: ReturnType<typeof createPublicClient> | null = null;

const liveOrgDeps: OrgNameDeps = {
  orgIdOfSafe: async (address) => {
    // viem's http transport aborts after `timeout` (RN fetch never times out by itself).
    orgClient ??= createPublicClient({ chain: gnosis, transport: http(GNOSIS_READ_RPC, { timeout: LOOKUP_TIMEOUT_MS }) });
    return (await orgClient.readContract({
      address: orgRegistryGnosisAddress as Hex,
      abi: [orgIdOfSafeAbi],
      functionName: 'orgIdOfSafe',
      args: [address as Hex],
    })) as string;
  },
  orgs: async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const { data, error } = await (supabase.from('accounts') as any)
        .select('id, name')
        .eq('account_type', 'organisation')
        .abortSignal(controller.signal);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null }[];
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Display name of an org account by its Safe address (cached; a failed lookup is retried). */
export async function orgNameForSafe(address: string): Promise<string | null> {
  const key = address.toLowerCase();
  if (orgCache.has(key)) return orgCache.get(key) ?? null;
  const name = await orgNameFor(key, liveOrgDeps);
  if (name) orgCache.set(key, name);
  return name;
}
