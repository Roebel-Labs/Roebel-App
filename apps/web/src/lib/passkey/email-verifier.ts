/**
 * Gnosis (chain 100) ERC-1271 check for passkey-Safe proofs, via viem `verifyMessage`.
 *
 * viem computes `hashMessage(message)` (EIP-191) and asks the Safe's `isValidSignature(bytes32,
 * bytes)` through its ERC-6492 universal validator (an eth_call, no transaction). A passkey Safe
 * answers through Safe4337Module's CompatibilityFallbackHandler: the WebAuthn challenge must be
 * the Safe's SafeMessage hash of that bytes32 (fork-proven in
 * contracts/passkey-accounts/test/GuardianErc1271.t.sol).
 *
 * Transport errors propagate (the route answers 503); an invalid signature is `false`.
 */
import { createPublicClient, http, type Address, type Hex } from "viem";
import { gnosis } from "viem/chains";
import type { SafeProofVerifier } from "./email-handler";

const DEFAULT_GNOSIS_RPC = "https://gnosis-rpc.publicnode.com";
const RPC_TIMEOUT_MS = 8_000;

export function createGnosisSafeVerifier(rpcUrl = process.env.GNOSIS_RPC_URL || DEFAULT_GNOSIS_RPC): SafeProofVerifier {
  const client = createPublicClient({ chain: gnosis, transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }) });
  return {
    async isDeployed(safe: Address) {
      const code = await client.getCode({ address: safe });
      return !!code && code !== "0x";
    },
    verifyMessage(safe: Address, message: string, signature: Hex) {
      return client.verifyMessage({ address: safe, message, signature });
    },
  };
}
