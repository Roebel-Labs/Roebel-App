// Wallet-signature verification shared by the ticket signed-request path and
// the chat session (lib/chat/session.ts). EOA recovery first, then ERC-1271 /
// ERC-6492 via viem's verifyMessage on Gnosis (thirdweb smart accounts).
// No next/* imports so framework-agnostic modules can use it.
import { createPublicClient, http, recoverMessageAddress } from "viem";
import { gnosis } from "viem/chains";

const gnosisClient = createPublicClient({
  chain: gnosis,
  transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com"),
});

export class VerifierUnavailableError extends Error {
  constructor(cause: unknown) {
    super("could not reach verification RPC");
    this.name = "VerifierUnavailableError";
    this.cause = cause;
  }
}

/**
 * True when `signature` over `message` was produced by `wallet` (EOA or
 * smart account). Throws VerifierUnavailableError when the RPC is unreachable.
 */
export async function verifyWalletSignature(wallet: string, message: string, signature: string): Promise<boolean> {
  const claimed = wallet.toLowerCase();
  try {
    const recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
    if (recovered.toLowerCase() === claimed) return true;
  } catch { /* not an EOA signature */ }
  try {
    return await gnosisClient.verifyMessage({ address: claimed as `0x${string}`, message, signature: signature as `0x${string}` });
  } catch (err) {
    throw new VerifierUnavailableError(err);
  }
}
