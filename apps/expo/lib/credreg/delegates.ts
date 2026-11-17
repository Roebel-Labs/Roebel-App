/**
 * Door-scanner accounts ("Türscanner"): the current delegates of one type, read from the register's
 * own DelegateSet events (the server keeps no public list), named from public profiles. Addresses
 * stay inside this module's results for the "Entziehen" request; screens render names only.
 */
import { CREDENTIAL_REGISTRY_ABI } from '@netizen-labs/credential-registry';
import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem';
import { gnosis } from 'viem/chains';
import { credentialRegistryDeployBlock } from '@/constants/gnosis';
import { supabase } from '@/lib/supabase';
import { REGISTRY } from './chain';

const RPC = process.env.EXPO_PUBLIC_GNOSIS_LOGS_RPC_URL || 'https://rpc.gnosischain.com';
const CHUNK = 50_000n;
const NAME_TIMEOUT_MS = 10_000;

export type DelegateEvent = { delegate: string; allowed: boolean; blockNumber: bigint; logIndex: number };
export type Delegate = { address: Address; displayName: string };

/** The accounts whose last DelegateSet says allowed (lowercase), in the order they were first allowed. */
export function currentDelegates(events: readonly DelegateEvent[]): Address[] {
  const sorted = [...events].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  const state = new Map<string, boolean>();
  for (const e of sorted) {
    const k = e.delegate.toLowerCase();
    state.delete(k);
    state.set(k, e.allowed);
  }
  return [...state.entries()].filter(([, ok]) => ok).map(([a]) => a as Address);
}

let client: PublicClient | null = null;
const logsClient = () => (client = client ?? (createPublicClient({ chain: gnosis, transport: http(RPC, { timeout: 20_000, retryCount: 1 }) }) as PublicClient));

const DELEGATE_SET = CREDENTIAL_REGISTRY_ABI.find((e) => e.type === 'event' && e.name === 'DelegateSet');

/** Throws on RPC failure or when the deploy block is not configured (no scan from genesis). */
export async function readDelegates(typeId: Hex): Promise<Address[]> {
  if (!credentialRegistryDeployBlock || !DELEGATE_SET) throw new Error('delegates unavailable');
  const c = logsClient();
  const head = await c.getBlockNumber();
  const events: DelegateEvent[] = [];
  for (let from = BigInt(credentialRegistryDeployBlock); from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    const logs = (await c.getLogs({ address: REGISTRY, event: DELEGATE_SET as never, args: { typeId } as never, fromBlock: from, toBlock: to })) as unknown as {
      args: { delegate?: string; allowed?: boolean };
      blockNumber: bigint;
      logIndex: number;
    }[];
    for (const l of logs) {
      if (typeof l.args?.delegate !== 'string' || typeof l.args?.allowed !== 'boolean') continue;
      events.push({ delegate: l.args.delegate, allowed: l.args.allowed, blockNumber: l.blockNumber, logIndex: l.logIndex });
    }
  }
  return currentDelegates(events);
}

/** Display names for accounts (name fields only). A missing profile is "Konto ohne Namen". Never throws. */
export async function nameAccounts(addresses: readonly Address[]): Promise<Delegate[]> {
  if (addresses.length === 0) return [];
  const names = new Map<string, string>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAME_TIMEOUT_MS);
  try {
    const { data } = await supabase
      .from('users')
      .select('wallet_address, username, display_name')
      .in('wallet_address', addresses.map((a) => a.toLowerCase()))
      .abortSignal(controller.signal);
    for (const r of (data as { wallet_address: string; username: string | null; display_name: string | null }[] | null) ?? []) {
      const n = r.display_name?.trim() || r.username?.trim();
      if (n) names.set(r.wallet_address.toLowerCase(), n);
    }
  } catch {
    // names are best effort
  } finally {
    clearTimeout(timer);
  }
  return addresses.map((a) => ({ address: a, displayName: names.get(a.toLowerCase()) ?? 'Konto ohne Namen' }));
}
