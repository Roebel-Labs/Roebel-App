"use client";

import { useCallback, useEffect, useState } from "react";
import { readContract } from "thirdweb";
import {
  attesterNFTContract,
  citizenNFTContract,
} from "@/lib/verification-contracts";

const CHUNK_SIZE = 8;

/** A single open (pending) on-chain verification request with its details. */
export interface VerificationRequest {
  contract: "attester" | "citizen";
  requestId: number;
  requester: string; // checksummed from chain; lowercase before directory lookup
  target: string;
  requestType: 0 | 1; // 0 = attestation (Aufnahme), 1 = revocation (Widerruf)
  evidenceURI: string;
  createdAt: number; // unix seconds
  /** AttesterNFT contract: single signature count. */
  signatureCount?: number;
  /** CitizenNFT contract: the 1-attester + 1-citizen rule, surfaced separately. */
  attesterSignatures?: number;
  citizenSignatures?: number;
}

/**
 * Collect pending (status === 0) requests on an NFT request contract, with their
 * full details. Mirrors the request-status logic in useDaoStats but reads only
 * what the "Offene Verifizierungen" KPI + list need.
 */
async function collectPending(
  contract: typeof attesterNFTContract,
  kind: "attester" | "citizen"
): Promise<VerificationRequest[]> {
  const isCitizen = kind === "citizen";
  const totalRaw = (await readContract({
    contract,
    method: "function requestCount() view returns (uint256)",
    params: [],
  })) as bigint;

  const total = Number(totalRaw);
  if (total === 0) return [];

  const ids = Array.from({ length: total }, (_, i) => i + 1);
  const out: VerificationRequest[] = [];

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
        })
          .then((res) => ({ id, res }))
          .catch(() => null)
      )
    );
    for (const item of results) {
      if (!item) continue;
      const t = item.res as unknown as unknown[];
      const status = Number(t[3]);
      if (status !== 0) continue;

      const base = {
        contract: kind,
        requestId: item.id,
        requester: String(t[0]),
        target: String(t[1]),
        requestType: (Number(t[2]) === 1 ? 1 : 0) as 0 | 1,
        evidenceURI: String(t[4] ?? ""),
      };

      if (isCitizen) {
        out.push({
          ...base,
          attesterSignatures: Number(t[5] ?? 0),
          citizenSignatures: Number(t[6] ?? 0),
          createdAt: Number(t[7] ?? 0),
        });
      } else {
        out.push({
          ...base,
          signatureCount: Number(t[5] ?? 0),
          createdAt: Number(t[6] ?? 0),
        });
      }
    }
  }

  return out;
}

export interface UseOpenVerificationsResult {
  pending: number | null;
  requests: VerificationRequest[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Live list + count of open (pending) on-chain verification requests
 * (attester + citizen) — the real source for "Offene Verifizierungen".
 */
export function useOpenVerifications(): UseOpenVerificationsResult {
  const [pending, setPending] = useState<number | null>(null);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [attester, citizen] = await Promise.all([
        collectPending(attesterNFTContract, "attester"),
        collectPending(citizenNFTContract, "citizen"),
      ]);
      const all = [...attester, ...citizen].sort(
        (a, b) => b.createdAt - a.createdAt
      );
      setRequests(all);
      setPending(all.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { pending, requests, isLoading, error };
}
