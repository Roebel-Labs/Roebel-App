// A Node, viem-based Circles ContractRunner built from the burner EOA.
// Implements the @aboutcircles/sdk-types ContractRunner interface (address,
// publicClient, init, estimateGas, call, sendTransaction). EOAs can't batch
// atomically, so sendTransaction sends the SDK's ordered txs sequentially and
// returns the final receipt — sufficient for the spikes.
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
} from "viem";
import { gnosis } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

interface TxReq { from?: Address; to: Address; data: Hex; value?: bigint; gas?: bigint }

export function makeRunner(privKey: `0x${string}`, rpc: string) {
  const account = privateKeyToAccount(privKey);
  const publicClient = createPublicClient({ chain: gnosis, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain: gnosis, transport: http(rpc) });

  return {
    address: account.address,
    publicClient,
    async init() {
      const id = await publicClient.getChainId();
      if (id !== 100) throw new Error(`Runner not on Gnosis (chainId ${id})`);
    },
    async estimateGas(tx: TxReq) {
      return publicClient.estimateGas({ account, to: tx.to, data: tx.data, value: tx.value });
    },
    async call(tx: TxReq) {
      const r = await publicClient.call({ to: tx.to, data: tx.data, value: tx.value });
      return r.data ?? "0x";
    },
    async sendTransaction(txs: TxReq[]) {
      let receipt: unknown;
      for (const tx of txs) {
        const hash = await walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ?? 0n,
        });
        receipt = await publicClient.waitForTransactionReceipt({ hash });
      }
      return receipt;
    },
  };
}
