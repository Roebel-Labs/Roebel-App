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
 * `contracts/governor-contract/deployments/base.json`.
 */

import { readContract, getContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { client } from "@/app/client";

const CITIZEN_NFT_ADDRESS = "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";
const ATTESTER_NFT_ADDRESS = "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";

const citizenNftContract = getContract({
  client,
  address: CITIZEN_NFT_ADDRESS,
  chain: base,
});

const attesterNftContract = getContract({
  client,
  address: ATTESTER_NFT_ADDRESS,
  chain: base,
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
