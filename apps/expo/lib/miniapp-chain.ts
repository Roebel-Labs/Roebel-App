/**
 * The mini-app host runs on one chain only: Gnosis (chain id 100). Shared by miniapp-wallet.ts
 * and miniapp-calls.ts (kept free of thirdweb so both can import it).
 */

/** Host chain the account signs on (Gnosis). */
export const HOST_CHAIN = 100;

export type BridgeErrorLike = { code: string; message: string; rpcCode?: number };

/** The standard EIP-1193 "unrecognized chain" error: the host only runs on Gnosis. */
export function unsupportedChain(): BridgeErrorLike & { rpcCode: 4902 } {
  return { code: 'unsupported', message: 'Diese Mini-App läuft nur auf der Gnosis Chain.', rpcCode: 4902 };
}

/**
 * Throws `unsupportedChain()` unless `chainId` names the host chain. `undefined` means
 * "not specified" and is accepted; `100`, `'0x64'` and `'100'` are the accepted spellings.
 */
export function assertHostChain(chainId: unknown): void {
  if (chainId === undefined) return;
  if (chainId === HOST_CHAIN) return;
  if (typeof chainId === 'string') {
    const s = chainId.trim().toLowerCase();
    if (s === `0x${HOST_CHAIN.toString(16)}` || s === String(HOST_CHAIN)) return;
  }
  throw unsupportedChain();
}
