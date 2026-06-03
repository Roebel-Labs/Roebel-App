"use client";

import { useCallback, useEffect, useState } from "react";
import { readContract } from "thirdweb";
import {
  attesterNFTContract,
  citizenNFTContract,
} from "@/lib/verification-contracts";

const CHUNK_SIZE = 8;

/**
 * Count pending (status === 0) requests on an NFT request contract.
 * Mirrors the request-status logic in useDaoStats, but reads ONLY the pending
 * count (no proposals/events) so it's cheap enough for a single KPI.
 */
async function countPending(
  contract: typeof attesterNFTContract,
  isCitizen: boolean
): Promise<number> {
  const totalRaw = (await readContract({
    contract,
    method: "function requestCount() view returns (uint256)",
    params: [],
  })) as bigint;

  const total = Number(totalRaw);
  if (total === 0) return 0;

  const ids = Array.from({ length: total }, (_, i) => i + 1);
  let pending = 0;

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((id) =>
        readContract({
          contract,
          method: isCitizen
            ? "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)"
            : "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 signatureCount, uint256 createdAt)",
          params: [BigInt(id)],
        }).catch(() => null)
      )
    );
    for (const res of results) {
      if (!res) continue;
      const status = Number((res as unknown as unknown[])[3]);
      if (status === 0) pending += 1;
    }
  }

  return pending;
}

export interface UseOpenVerificationsResult {
  pending: number | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Live count of open (pending) on-chain verification requests
 * (attester + citizen) — the real source for "Offene Verifizierungen".
 */
export function useOpenVerifications(): UseOpenVerificationsResult {
  const [pending, setPending] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [attester, citizen] = await Promise.all([
        countPending(attesterNFTContract, false),
        countPending(citizenNFTContract, true),
      ]);
      setPending(attester + citizen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { pending, isLoading, error };
}
