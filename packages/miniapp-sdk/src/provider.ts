/**
 * EIP-1193 provider shim. Proxies `request()` to the host over the bridge (`wallet.request`),
 * and re-emits host wallet events (accountsChanged / chainChanged) from Netizen bridge events.
 *
 * The mini app never holds keys — the host signs (behind a native confirmation sheet).
 */
import type { ClientBridge } from './bridge';
import type { BridgeError, BridgeErrorCode, Eip1193Provider, Eip1193RequestArgs } from './types';

export type ProviderError = Error & { code: number; data: { bridgeCode: BridgeErrorCode } };

const PROVIDER_CODES: Partial<Record<BridgeErrorCode, number>> = {
  user_rejected: 4001,
  unauthorized: 4100,
  invalid_params: -32602,
  rate_limited: -32005,
};

/**
 * Turn a bridge error into an EIP-1193 provider error: an `Error` with a numeric
 * `code` (what wallet libraries such as viem/ethers check) and the original bridge
 * code in `data.bridgeCode`.
 */
export function toProviderError(e: BridgeError): ProviderError {
  const bridgeCode: BridgeErrorCode = e?.code ?? 'internal';
  let code: number;
  if (bridgeCode === 'unsupported') code = typeof e.rpcCode === 'number' ? e.rpcCode : 4200;
  else code = PROVIDER_CODES[bridgeCode] ?? -32603;
  const err = new Error(e?.message ?? String(bridgeCode)) as ProviderError;
  err.code = code;
  err.data = { bridgeCode };
  return err;
}

export function createEip1193Provider(bridge: ClientBridge): Eip1193Provider {
  const emitters = new Map<string, Set<(...args: unknown[]) => void>>();

  const emit = (event: string, ...args: unknown[]): void => {
    const set = emitters.get(event);
    if (set) for (const l of set) safe(l, args);
  };

  bridge.on('walletChanged', (data) => {
    const d = (data ?? {}) as { address?: string; chainId?: number };
    if (d.address) emit('accountsChanged', [d.address]);
    if (typeof d.chainId === 'number') emit('chainChanged', `0x${d.chainId.toString(16)}`);
  });

  return {
    request(args: Eip1193RequestArgs): Promise<unknown> {
      return bridge.request('wallet.request', args).catch((e: unknown) => {
        throw toProviderError(asBridgeError(e));
      });
    },
    on(event: string, listener: (...args: unknown[]) => void): void {
      let set = emitters.get(event);
      if (!set) {
        set = new Set();
        emitters.set(event, set);
      }
      set.add(listener);
    },
    removeListener(event: string, listener: (...args: unknown[]) => void): void {
      emitters.get(event)?.delete(listener);
    },
  };
}

function asBridgeError(e: unknown): BridgeError {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as BridgeError).code === 'string') {
    return e as BridgeError;
  }
  return { code: 'internal', message: e instanceof Error ? e.message : String(e) };
}

function safe(fn: (...a: unknown[]) => void, args: unknown[]): void {
  try {
    fn(...args);
  } catch {
    /* ignore listener errors */
  }
}
