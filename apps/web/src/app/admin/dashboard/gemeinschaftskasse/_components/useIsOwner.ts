"use client";
import { useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { getContract, readContract } from "thirdweb";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";
import { matchOwner } from "@/lib/gemeinschaftskasse/owners";

/**
 * Lightweight hook: checks whether the connected thirdweb account (or its
 * admin EOA) is an owner of the Gemeinschaftskasse Safe.
 *
 * Reads Safe owners DIRECTLY on-chain via getOwners() — the exact same source
 * the signing path (resolveSigner) trusts. Previously this read the
 * /api/gemeinschaftskasse/overview endpoint, whose extra balance + Supabase
 * profile reads could make the gate's answer diverge from the signer and hide
 * the Freigeben/Ausführen buttons for a genuine owner. One source of truth now:
 * the button shows iff a signature from this account would be accepted.
 */
export function useIsOwner(): { isOwner: boolean; loading: boolean } {
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account || !wallet) {
      setIsOwner(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const adminAccount = await (wallet as any)
          .getAdminAccount?.()
          .catch(() => undefined);

        const safe = getContract({
          client,
          chain: activeChain,
          address: GK_SAFE,
        });
        const owners = [
          ...(await readContract({
            contract: safe,
            method: "function getOwners() view returns (address[])",
            params: [],
          })),
        ] as string[];
        if (cancelled) return;

        const match = matchOwner(
          [account.address, adminAccount?.address],
          owners,
        );
        setIsOwner(match !== null);
      } catch (e) {
        if (!cancelled) {
          console.warn("[useIsOwner] owner check failed", e);
          setIsOwner(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, wallet]);

  return { isOwner, loading };
}
