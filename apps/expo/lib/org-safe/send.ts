/**
 * Sends org-Safe calls from the user's Gnosis account: one call as a plain
 * transaction, several as one sponsored batch (one confirmation).
 */
import { prepareTransaction, sendBatchTransaction, sendTransaction, waitForReceipt } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import type { Hex } from 'viem';
import { client } from '@/constants/thirdweb';
import { gnosis } from '@/constants/gnosis';
import type { Call } from './ops';

async function submit(account: Account, calls: readonly Call[]) {
  const txs = calls.map((c) => prepareTransaction({ to: c.to, data: c.data, chain: gnosis, client }));
  return txs.length === 1
    ? sendTransaction({ transaction: txs[0], account })
    : sendBatchTransaction({ transactions: txs, account });
}

/**
 * Resolves with the transaction hash once the receipt is there (null when there was nothing to
 * send). Throws when sending or the receipt wait fails.
 */
export async function sendOrgCalls(account: Account, calls: readonly Call[]): Promise<Hex | null> {
  if (calls.length === 0) return null;
  const result = await submit(account, calls);
  const receipt = await waitForReceipt(result);
  return (receipt?.transactionHash ?? result.transactionHash ?? null) as Hex | null;
}

/**
 * Like sendOrgCalls, but once the operation is out the hash is never lost: a failed receipt wait
 * resolves with `confirmed: false` instead of throwing (the caller must not send again). Throws
 * only when nothing was sent.
 */
export async function sendOrgCallsKeepingHash(
  account: Account,
  calls: readonly Call[],
): Promise<{ txHash: Hex; confirmed: boolean } | null> {
  if (calls.length === 0) return null;
  const result = await submit(account, calls);
  const sent = (result.transactionHash ?? null) as Hex | null;
  try {
    const receipt = await waitForReceipt(result);
    const txHash = (receipt?.transactionHash ?? sent) as Hex | null;
    return txHash ? { txHash, confirmed: true } : null;
  } catch {
    if (sent) return { txHash: sent, confirmed: false };
    throw new Error('receipt wait failed without a transaction hash');
  }
}
