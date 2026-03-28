/**
 * Hook to check if user has Attester/Citizen NFT
 */

import { useReadContract } from "thirdweb/react";
import { useActiveAccount } from "thirdweb/react";
import {
  attesterNFTContract,
  citizenNFTContract,
  ATTESTER_NFT_ABI,
  CITIZEN_NFT_ABI,
} from "@/lib/verification-contracts";

export function useVerificationStatus() {
  const account = useActiveAccount();
  const userAddress = account?.address;

  // Check if user has Attester NFT
  const { data: isAttester, isLoading: isLoadingAttester } = useReadContract({
    contract: attesterNFTContract,
    method: "function hasAttesterNFT(address account) view returns (bool)",
    params: [userAddress || "0x0"],
    queryOptions: { enabled: !!userAddress },
  });

  // Check if user has Citizen NFT
  const { data: isCitizen, isLoading: isLoadingCitizen } = useReadContract({
    contract: citizenNFTContract,
    method: "function hasCitizenNFT(address account) view returns (bool)",
    params: [userAddress || "0x0"],
    queryOptions: { enabled: !!userAddress },
  });

  // Check voting power
  const { data: votingPower } = useReadContract({
    contract: citizenNFTContract,
    method: "function getVotes(address account) view returns (uint256)",
    params: [userAddress || "0x0"],
    queryOptions: { enabled: !!userAddress },
  });

  return {
    isAttester: isAttester ?? false,
    isCitizen: isCitizen ?? false,
    votingPower: votingPower ? Number(votingPower) : 0,
    isLoading: isLoadingAttester || isLoadingCitizen,
    isVerified: (isAttester ?? false) || (isCitizen ?? false),
  };
}
