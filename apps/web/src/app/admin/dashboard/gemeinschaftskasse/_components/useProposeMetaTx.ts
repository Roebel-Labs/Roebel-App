"use client";
/**
 * Shared hook: propose a Safe MetaTransaction via the server-side pipeline.
 * Used by CreatePayout and Mitglieder to stay DRY.
 * No @safe-global imports — all crypto runs server-side.
 */
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { proposeMetaTx } from "@/lib/gemeinschaftskasse/safe-client";

export function useProposeMetaTx() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  /**
   * Propose a Safe MetaTransaction.
   * @returns safeTxHash on success; throws a German-message Error on failure.
   */
  async function propose(metaTx: {
    to: string;
    value: string;
    data: string;
  }): Promise<{ safeTxHash: string }> {
    if (!account || !wallet) {
      throw new Error("Bitte zuerst anmelden.");
    }
    return proposeMetaTx({ metaTx, account, wallet });
  }

  return propose;
}
