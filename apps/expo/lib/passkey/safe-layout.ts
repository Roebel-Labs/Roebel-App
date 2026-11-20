/**
 * Which validation layout a passkey Safe runs: the original Safe4337Module ('4337') or the
 * Safe7579 adapter after the device-session migration ('7579'). Read from the Safe's
 * fallback-handler slot; any other handler is refused (never guess the layout).
 */
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddressEqual, sliceHex, type Address, type Hex } from 'viem';
import { SAFE_4337_MODULE, SAFE_FALLBACK_HANDLER_SLOT } from './constants';
import { SAFE7579, SAFE_SENTINEL } from './session-keys/builders';
import { DEFAULT_GNOSIS_RPC_URL } from './userop';

export type SafeLayout = '4337' | '7579';

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type SafeLayoutDeps = { rpcUrl?: string; fetch?: FetchLike; requestTimeoutMs?: number };

let rpcId = 1;
/** RN fetch never times out on its own — every request gets an AbortController deadline. */
async function rpc<T>(deps: SafeLayoutDeps, method: string, params: unknown[]): Promise<T> {
  const f = deps.fetch ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.requestTimeoutMs ?? 15_000);
  try {
    const res = await f(deps.rpcUrl ?? DEFAULT_GNOSIS_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    if (json?.error) throw new Error(`${method}: ${json.error.message ?? JSON.stringify(json.error)}`);
    return json?.result as T;
  } finally {
    clearTimeout(timer);
  }
}

const memo = new Map<string, SafeLayout>();

/** Reads the fallback handler: Safe4337Module → '4337', Safe7579 → '7579', anything else throws. Memoized per Safe. */
export async function readSafeLayout(safe: Address, deps: SafeLayoutDeps = {}): Promise<SafeLayout> {
  const key = safe.toLowerCase();
  const hit = memo.get(key);
  if (hit) return hit;
  const word = await rpc<Hex>(deps, 'eth_getStorageAt', [safe, SAFE_FALLBACK_HANDLER_SLOT, 'latest']);
  if (typeof word !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(word)) throw new Error('unknown Safe layout');
  const handler = getAddress(sliceHex(word, 12, 32));
  let layout: SafeLayout;
  if (isAddressEqual(handler, SAFE_4337_MODULE)) layout = '4337';
  else if (isAddressEqual(handler, SAFE7579)) layout = '7579';
  else throw new Error('unknown Safe layout');
  memo.set(key, layout);
  return layout;
}

/** Drops the memo for one Safe (call after the migration op lands). */
export function invalidateSafeLayout(safe: Address): void {
  memo.delete(safe.toLowerCase());
}

const getModulesPaginatedAbi = [
  {
    type: 'function',
    name: 'getModulesPaginated',
    stateMutability: 'view',
    inputs: [
      { name: 'start', type: 'address' },
      { name: 'pageSize', type: 'uint256' },
    ],
    outputs: [
      { name: 'array', type: 'address[]' },
      { name: 'next', type: 'address' },
    ],
  },
] as const;

/** Safe.getModulesPaginated(SENTINEL, 10).array (head first; input for `prev4337AfterEnable`). */
export async function readModules(safe: Address, deps: SafeLayoutDeps = {}): Promise<Address[]> {
  const data = encodeFunctionData({ abi: getModulesPaginatedAbi, functionName: 'getModulesPaginated', args: [SAFE_SENTINEL, 10n] });
  const ret = await rpc<Hex>(deps, 'eth_call', [{ to: safe, data }, 'latest']);
  const [modules] = decodeFunctionResult({ abi: getModulesPaginatedAbi, functionName: 'getModulesPaginated', data: ret });
  return modules.map((m) => getAddress(m));
}
