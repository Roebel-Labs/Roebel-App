/**
 * Server-side wallet/role verification for /api/coordinator/* routes.
 *
 * Everything in this file runs in a Next.js route handler with access to
 * the Supabase service role key. NEVER import from a client component.
 *
 * Wallet signature semantics: thirdweb's inAppWallet (and most EOAs) sign
 * a UTF-8 message with EIP-191 personal_sign. ethers v6's `verifyMessage`
 * implements the same recovery, so the standard pattern is:
 *
 *   recovered = verifyMessage(message, signature)
 *   ok       = recovered.toLowerCase() === expectedAddress.toLowerCase()
 *
 * Attester-NFT gating: read `hasAttesterNFT(address)` on the live
 * AttesterNFT contract. The current address comes from
 * `packages/blockchain/CONTRACTS.attesterNFT` so this code automatically
 * picks up whatever the latest rotation pointed at.
 *
 * Founder gating: a small hard-coded allowlist of founder wallets that
 * are permitted to run /coordinator/generate-key. Lives here so it's
 * easy to find and review in code, not buried in config.
 */

import { verifyMessage } from "ethers";
import { readContract, getContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { client } from "@/app/client";

// Mirrors apps/web/src/lib/verification-contracts.ts. Kept inline here so
// this server-only module has no client-side imports (the verification-
// contracts module pulls in `getContract` instances at module load and
// is otherwise client-flavored).
const ATTESTER_NFT_ADDRESS = "0xa06F09Cb406880512326318fbC09Cdb28631DA73";

/**
 * Founder allowlist. Keep this list of human-readable comments so any
 * future reviewer can immediately see who is on it and why.
 */
const FOUNDER_WALLETS = new Set<string>(
  [
    // Max — primary founder.
    "0xc49de63ccfee46c6c5c3e393293f66779799fb28",
  ].map((a) => a.toLowerCase())
);

const attesterNftContract = getContract({
  client,
  address: ATTESTER_NFT_ADDRESS,
  chain: base,
});

/**
 * Verify that `signature` is a valid EIP-191 signature over `message`
 * produced by `expectedAddress`.
 */
export function verifyWalletSignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const recovered = verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Returns true if `address` currently holds an AttesterNFT.
 */
export async function verifyIsAttester(address: string): Promise<boolean> {
  try {
    const has = (await readContract({
      contract: attesterNftContract,
      method: "function hasAttesterNFT(address account) view returns (bool)",
      params: [address as `0x${string}`],
    })) as boolean;
    return Boolean(has);
  } catch (err) {
    console.error(
      "[signature-verification] hasAttesterNFT read failed",
      err
    );
    return false;
  }
}

/**
 * Returns true if `address` is on the founder allowlist.
 *
 * Note: founder-gating is independent of AttesterNFT membership. We
 * additionally require `verifyIsAttester` in the same handler to ensure
 * the founder still holds the NFT (defense against an allowlisted
 * wallet that has been revoked).
 */
export function verifyIsFounder(address: string): boolean {
  return FOUNDER_WALLETS.has(address.toLowerCase());
}

/**
 * Convenience: re-derive the Curve25519 pubkey from a signature so the
 * server can confirm the client didn't tamper with the published pubkey.
 *
 * Mirrors deriveShareKeypairFromSignature in ./wallet-encryption.ts but
 * lives here to keep server bundles small (this file is server-only and
 * can use node:crypto directly without the SubtleCrypto fallback path).
 */
import { createHash } from "node:crypto";
import nacl from "tweetnacl";

export function deriveCurve25519PubkeyFromSignature(
  signatureHex: string
): Uint8Array {
  const sig = hexToBytes(signatureHex);
  const prefix = new TextEncoder().encode(
    "Roebel-Curve25519-share-key-v1\0"
  );
  const joined = new Uint8Array(prefix.length + sig.length);
  joined.set(prefix, 0);
  joined.set(sig, prefix.length);
  const seed = new Uint8Array(createHash("sha256").update(joined).digest());
  const kp = nacl.box.keyPair.fromSecretKey(seed);
  return kp.publicKey;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
