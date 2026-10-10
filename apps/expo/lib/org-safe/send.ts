/**
 * Sends org-Safe calls from the user's Gnosis account: one call as a plain
 * transaction, several as one sponsored batch (one confirmation).
 */
import { prepareTransaction, sendBatchTransaction, sendTransaction, waitForReceipt } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import { client } from '@/constants/thirdweb';
import { gnosis } from '@/constants/gnosis';
import type { Call } from './ops';

export async function sendOrgCalls(account: Account, calls: readonly Call[]): Promise<void> {
  if (calls.length === 0) return;
  const txs = calls.map((c) => prepareTransaction({ to: c.to, data: c.data, chain: gnosis, client }));
  const result =
    txs.length === 1
      ? await sendTransaction({ transaction: txs[0], account })
      : await sendBatchTransaction({ transactions: txs, account });
  await waitForReceipt(result);
}
