import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { gnosis } from "viem/chains";
import type { ChainReader } from "./sponsor-policy";

const DEFAULT_GNOSIS_RPC = "https://gnosis-rpc.publicnode.com";
const RPC_TIMEOUT_MS = 8_000;

const isAdminAbi = parseAbi(["function isAdmin(address account) view returns (bool)"]);

/** Gnosis (chain 100) reader for the sponsor policy. Errors propagate
 * (never defaulted), so the policy fails closed. RPC from `GNOSIS_RPC_URL`. */
export function createGnosisChainReader(rpcUrl = process.env.GNOSIS_RPC_URL || DEFAULT_GNOSIS_RPC): ChainReader {
  const client = createPublicClient({
    chain: gnosis,
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }),
  });
  return {
    getCode: (address: Hex) => client.getCode({ address }),
    isAdmin: (account: Hex, signer: Hex) =>
      client.readContract({ address: account, abi: isAdminAbi, functionName: "isAdmin", args: [signer] }),
  };
}
