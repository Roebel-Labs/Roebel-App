/**
 * Server-side citizen/attester verification.
 *
 * The PostComposer gates the UI client-side, but that is trivially
 * bypassable (anyone can call the `createPost` server action directly).
 * This module is the authoritative gate: it reads NFT ownership straight
 * from the chain so the server can reject posts from non-citizens.
 *
 * Self-contained on purpose — `@/lib/verification-contracts` instantiates
 * client-flavored `getContract` instances at module load, so we mirror the
 * addresses here the same way `lib/shamir/signature-verification.ts` does.
 *
 * IMPORTANT: bump these on every NFT rotation. Source of truth:
 * `apps/web/src/lib/verification-contracts.ts` and
 * `contracts/governor-contract/deployments/gnosis-v2.json`.
 *
 * Gnosis v2 Sybil-hardened rotation (2026-06-25): NFTs now live on Gnosis
 * (chainId 100). hasCitizenNFT/hasAttesterNFT are unchanged in v2.
 */

import { readContract, getContract } from "thirdweb";
import { gnosis } from "@/lib/gnosis";
import { client } from "@/app/client";

const CITIZEN_NFT_ADDRESS = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5";
const ATTESTER_NFT_ADDRESS = "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82";

const citizenNftContract = getContract({
  client,
  address: CITIZEN_NFT_ADDRESS,
  chain: gnosis,
});

const attesterNftContract = getContract({
  client,
  address: ATTESTER_NFT_ADDRESS,
  chain: gnosis,
});

/**
 * Returns true if `address` currently holds a CitizenNFT or an AttesterNFT.
 * Attesters are a superset of verified citizens, so either grants posting
 * rights. Fails closed: any RPC error returns false.
 */
export async function isVerifiedCitizen(address: string): Promise<boolean> {
  if (!address) return false;
  const wallet = address as `0x${string}`;

  try {
    const [isCitizen, isAttester] = await Promise.all([
      readContract({
        contract: citizenNftContract,
        method: "function hasCitizenNFT(address account) view returns (bool)",
        params: [wallet],
      }) as Promise<boolean>,
      readContract({
        contract: attesterNftContract,
        method: "function hasAttesterNFT(address account) view returns (bool)",
        params: [wallet],
      }) as Promise<boolean>,
    ]);

    return Boolean(isCitizen) || Boolean(isAttester);
  } catch (err) {
    console.error("[verify-citizen] NFT ownership read failed", err);
    return false;
  }
}
