"use client";
import { useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { matchOwner } from "@/lib/gemeinschaftskasse/owners";

/**
 * Lightweight hook: checks whether the connected thirdweb account (or its
 * admin EOA) is an owner of the Gemeinschaftskasse Safe.
 *
 * Uses the /api/gemeinschaftskasse/overview endpoint — does NOT call
 * initProtocolKit/Safe.init so it stays fast and avoids EIP-1193 setup.
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

        const r = await fetch(
          `/api/gemeinschaftskasse/overview?you=${encodeURIComponent(account.address)}`,
        );
        const d = await r.json();
        if (cancelled) return;
        if (d.error || !Array.isArray(d.owners)) {
          setIsOwner(false);
          return;
        }

        const ownerAddresses: string[] = d.owners.map(
          (o: { address: string }) => o.address,
        );
        const match = matchOwner(
          [account.address, adminAccount?.address],
          ownerAddresses,
        );
        setIsOwner(match !== null);
      } catch {
        if (!cancelled) setIsOwner(false);
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
