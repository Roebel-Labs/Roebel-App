"use client";
/**
 * Shared hook: sign a Safe MetaTransaction and relay it via POST /propose.
 * Used by CreatePayout and Mitglieder to stay DRY.
 */
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import {
  initProtocolKit,
  resolveSigner,
  signSafeTx,
} from "@/lib/gemeinschaftskasse/safe-client";

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

    const protocolKit = await initProtocolKit(wallet);
    const signer = await resolveSigner(protocolKit, account, wallet);
    if (!signer) {
      throw new Error("Du bist kein Mitsignierer dieser Kasse.");
    }

    const { safeTxHash, senderSignature, safeTx } = await signSafeTx(
      protocolKit,
      signer,
      metaTx,
    );

    const res = await fetch("/api/gemeinschaftskasse/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        safeTransactionData: safeTx.data,
        safeTxHash,
        senderAddress: signer.ownerAddress,
        senderSignature,
      }),
    }).then((r) => r.json());

    if (res.error) throw new Error(res.error);
    return { safeTxHash };
  }

  return propose;
}
