// Netizen wallet bridge for the Röbel Circles mini app.
//
// The old Circles host exposed `sendTransactions(txs[])` (one host call, batch
// signed). The Netizen SDK instead hands us a standard EIP-1193 provider backed
// by the host's thirdweb smart account — every tx opens a host-native confirm
// sheet. We translate the batch into sequential `eth_sendTransaction` calls and
// return the hashes in order, so the invite/event flows keep their existing shape.
import { sdk } from "@netizen-labs/miniapp-sdk";
import type { Eip1193Provider } from "@netizen-labs/miniapp-sdk";

export interface HostTx {
  to: string;
  data: string;
  value?: string;
}

let providerPromise: Promise<Eip1193Provider> | null = null;

/** Memoized EIP-1193 provider from the host (thirdweb smart account, Base+Gnosis). */
export function getProvider(): Promise<Eip1193Provider> {
  if (!providerPromise) providerPromise = sdk.wallet.getEthereumProvider();
  return providerPromise;
}

/** Current connected account (address only), or null if not connected. */
export async function getConnectedAddress(): Promise<string | null> {
  try {
    const acct = await sdk.wallet.getAccount();
    return acct?.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a batch of transactions through the host wallet. Each is a real
 * `eth_sendTransaction` (host confirm sheet, no blind signing). Returns the
 * transaction hashes in submission order. A `user_rejected` at any step throws.
 */
export async function sendTransactions(txs: HostTx[]): Promise<string[]> {
  const provider = await getProvider();
  const from = await getConnectedAddress();
  const hashes: string[] = [];
  for (const tx of txs) {
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          ...(from ? { from } : {}),
          to: tx.to,
          data: tx.data,
          value: tx.value && tx.value !== "0" ? toHex(tx.value) : undefined,
        },
      ],
    })) as string;
    if (hash) hashes.push(hash);
  }
  return hashes;
}

/** Decimal or hex string → 0x-prefixed hex (EIP-1193 wants hex quantities). */
function toHex(value: string): string {
  if (value.startsWith("0x")) return value;
  try {
    return "0x" + BigInt(value).toString(16);
  } catch {
    return value;
  }
}
