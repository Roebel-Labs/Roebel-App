/**
 * Sends org-Safe calls from the user's Gnosis account: one call as a plain
 * transaction, several as one sponsored batch (one confirmation). Resolves with the
 * transaction hash once the receipt is there (null when there was nothing to send).
 */
import { prepareTransaction, sendBatchTransaction, sendTransaction, waitForReceipt } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import type { Hex } from 'viem';
import { client } from '@/constants/thirdweb';
import { gnosis } from '@/constants/gnosis';
import type { Call } from './ops';

export async function sendOrgCalls(account: Account, calls: readonly Call[]): Promise<Hex | null> {
  if (calls.length === 0) return null;
  const txs = calls.map((c) => prepareTransaction({ to: c.to, data: c.data, chain: gnosis, client }));
  const result =
    txs.length === 1
      ? await sendTransaction({ transaction: txs[0], account })
      : await sendBatchTransaction({ transactions: txs, account });
  const receipt = await waitForReceipt(result);
  return (receipt?.transactionHash ?? result.transactionHash ?? null) as Hex | null;
}
