/**
 * Hook to fetch requests using Supabase-first strategy
 * Much faster: Gets evidence list from Supabase, then fetches blockchain data only for those IDs
 */

import { readContract } from "thirdweb";
import { attesterNFTContract, citizenNFTContract } from "@/lib/verification-contracts";
import { useState, useEffect } from "react";

export type RequestStatus = 0 | 1 | 2 | 3; // Pending | Approved | Rejected | Executed
export type RequestType = 0 | 1; // Attestation | Revocation

export interface AttesterRequest {
  id: number;
  requester: string;
  target: string;
  requestType: RequestType;
  status: RequestStatus;
  evidenceURI: string;
  signatureCount: number;
  createdAt: number;
}

export interface CitizenRequest {
  id: number;
  requester: string;
  target: string;
  requestType: RequestType;
  status: RequestStatus;
  evidenceURI: string;
  attesterSignatures: number;
  citizenSignatures: number;
  createdAt: number;
}

export function useRequests(contractType: "attester" | "citizen") {
  const contract = contractType === "attester" ? attesterNFTContract : citizenNFTContract;

  const [requests, setRequests] = useState<(AttesterRequest | CitizenRequest)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRequestsFromSupabase() {
      console.log(`🚀 [useRequests] Starting Supabase-first fetch for ${contractType}...`);

      try {
        setIsLoading(true);
        setError(null);

        // Step 1: Get evidence list from Supabase (FAST!)
        console.log("💾 [useRequests] Fetching evidence list from Supabase...");
        const response = await fetch(`/api/evidence/list?contract=${contractType}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch evidence list: ${response.status}`);
        }

        const { evidence, count } = await response.json();
        console.log(`✅ [useRequests] Found ${count} evidence records in Supabase`);

        if (count === 0 || !evidence || evidence.length === 0) {
          console.log("✅ [useRequests] No evidence in Supabase, showing empty list");
          setRequests([]);
          setIsLoading(false);
          return;
        }

        // Step 2: Fetch blockchain data ONLY for IDs that have evidence
        console.log(`⛓️  [useRequests] Fetching blockchain data for ${count} requests...`);
        const fetchedRequests: (AttesterRequest | CitizenRequest)[] = [];

        for (const ev of evidence) {
          const requestId = parseInt(ev.request_id);
          console.log(`🔄 [useRequests] Fetching request #${requestId} from blockchain...`);

          try {
            const result = await readContract({
              contract,
              method: contractType === "attester"
                ? "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 signatureCount, uint256 createdAt)"
                : "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)",
              params: [BigInt(requestId)],
            });

            console.log(`✅ [useRequests] Got blockchain data for request #${requestId}`);

            if (contractType === "attester") {
              // Parse AttesterRequest (7 return values)
              const [requester, target, requestType, status, evidenceURI, signatureCount, createdAt] = result as unknown as [string, string, bigint, bigint, string, bigint, bigint];
              fetchedRequests.push({
                id: requestId,
                requester,
                target,
                requestType: Number(requestType) as RequestType,
                status: Number(status) as RequestStatus,
                evidenceURI,
                signatureCount: Number(signatureCount),
                createdAt: Number(createdAt),
              });
            } else {
              // Parse CitizenRequest (8 return values)
              const [requester, target, requestType, status, evidenceURI, attesterSignatures, citizenSignatures, createdAt] = result as unknown as [string, string, bigint, bigint, string, bigint, bigint, bigint];
              fetchedRequests.push({
                id: requestId,
                requester,
                target,
                requestType: Number(requestType) as RequestType,
                status: Number(status) as RequestStatus,
                evidenceURI,
                attesterSignatures: Number(attesterSignatures),
                citizenSignatures: Number(citizenSignatures),
                createdAt: Number(createdAt),
              });
            }
          } catch (err) {
            console.error(`❌ [useRequests] Failed to fetch request ${requestId}:`, err);
            // Continue to next request even if one fails
          }
        }

        console.log(`🎉 [useRequests] Successfully loaded ${fetchedRequests.length} requests`);
        setRequests(fetchedRequests);
      } catch (err) {
        console.error("❌ [useRequests] Error fetching requests:", err);
        setError(err instanceof Error ? err.message : "Failed to load requests");
      } finally {
        console.log("🏁 [useRequests] Done loading");
        setIsLoading(false);
      }
    }

    fetchRequestsFromSupabase();
  }, [contractType, contract]);

  return {
    requests,
    requestCount: requests.length, // Now reflects actual filtered count
    isLoading,
    error,
  };
}
