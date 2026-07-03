/**
 * EIP-1193 provider shim. Proxies `request()` to the host over the bridge (`wallet.request`),
 * and re-emits host wallet events (accountsChanged / chainChanged) from Netizen bridge events.
 *
 * The mini app never holds keys — the host signs (behind a native confirmation sheet).
 */
import type { ClientBridge } from './bridge';
import type { Eip1193Provider, Eip1193RequestArgs } from './types';

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
      return bridge.request('wallet.request', args);
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

function safe(fn: (...a: unknown[]) => void, args: unknown[]): void {
  try {
    fn(...args);
  } catch {
    /* ignore listener errors */
  }
}
