"use client";

import { useCallback, useEffect, useState } from "react";
import { readContract, getRpcClient } from "thirdweb";
import { eth_getBalance } from "thirdweb/rpc";
import { gnosis } from "@/lib/gnosis";
import { client } from "@/app/client";
import {
  maciCoreContract,
  maciGovernorContract,
  MACI_INFRA,
} from "@/lib/maci-config";

/**
 * Live chain reads for the admin dashboard.
 *
 * - `numSignUps` — how many citizens have signed up to MACI globally
 * - `governorParams` — votingPeriod / votingDelay / quorum / tallyGracePeriod
 * - `coordinatorBalanceWei` — the off-chain coordinator EOA's Gnosis (xDAI)
 *   balance. Surfaced so an admin can warn when the wallet is running low on gas.
 */
export interface MaciInfraSnapshot {
  numSignUps: bigint;
  governorParams: {
    votingPeriod: bigint;
    votingDelay: bigint;
    quorum: bigint;
    quorumAbsolute: bigint;
    quorumPercentage: bigint;
    tallyGracePeriod: bigint;
  };
  coordinatorBalanceWei: bigint;
}

export interface UseMaciInfraResult {
  snapshot: MaciInfraSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
}

const REFRESH_INTERVAL_MS = 60_000;

export function useMaciInfra(): UseMaciInfraResult {
  const [snapshot, setSnapshot] = useState<MaciInfraSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [
        numSignUps,
        votingPeriod,
        votingDelay,
        quorum,
        quorumAbsolute,
        quorumPercentage,
        tallyGracePeriod,
      ] = await Promise.all([
        readContract({
          contract: maciCoreContract,
          method: "function numSignUps() view returns (uint256)",
          params: [],
        }) as Promise<bigint>,
        readContract({
          contract: maciGovernorContract,
          method: "function votingPeriod() view returns (uint256)",
          params: [],
        }) as Promise<bigint>,
        readContract({
          contract: maciGovernorContract,
          method: "function votingDelay() view returns (uint256)",
          params: [],
        }) as Promise<bigint>,
        readContract({
          contract: maciGovernorContract,
          method: "function quorum(uint256 timepoint) view returns (uint256)",
          params: [0n],
        }) as Promise<bigint>,
        readContract({
          contract: maciGovernorContract,
          method: "function quorumAbsolute() view returns (uint256)",
          params: [],
        }) as Promise<bigint>,
        readContract({
          contract: maciGovernorContract,
          method: "function quorumPercentage() view returns (uint256)",
          params: [],
        }) as Promise<bigint>,
        readContract({
          contract: maciGovernorContract,
          method: "function tallyGracePeriod() view returns (uint256)",
          params: [],
        }) as Promise<bigint>,
      ]);

      // Coordinator EOA balance — separate RPC call.
      const rpc = getRpcClient({ client, chain: gnosis });
      const coordinatorBalanceWei = await eth_getBalance(rpc, {
        address: MACI_INFRA.coordinator as `0x${string}`,
      });

      setSnapshot({
        numSignUps,
        governorParams: {
          votingPeriod,
          votingDelay,
          quorum,
          quorumAbsolute,
          quorumPercentage,
          tallyGracePeriod,
        },
        coordinatorBalanceWei,
      });
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[useMaciInfra] fetch failed:", err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  return { snapshot, isLoading, error, refresh: fetchAll, lastUpdated };
}
