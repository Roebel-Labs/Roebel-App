import "server-only";
import { decodeFunctionData, getAddress } from "viem";
import { resolveIdentities } from "@/lib/muenzen/identity";
import { SAFE_ABI, GK_SAFE, TOKENS, type TxView } from "./constants";
import { eur } from "./format";

// Minimal shape of a raw Safe Transaction Service multisig transaction
// (matches SafeMultisigTransactionResponse from @safe-global/types-kit).
interface RawSafeTx {
  safeTxHash: string;
  to: string;
  value: string;
  data?: string | null;
  isExecuted: boolean;
  confirmationsRequired: number;
  confirmations?: { owner: string }[];
  submissionDate: string;
}

// Maps raw Safe Transaction Service txs into German, name-first TxViews.
export async function describeTx(raw: RawSafeTx[]): Promise<TxView[]> {
  // Pre-resolve all addresses that might need a name (recipients, new owners).
  const addrs = new Set<string>();
  for (const t of raw) {
    if (t.to) addrs.add(t.to.toLowerCase());
  }
  const names = await resolveIdentities([...addrs]);
  // resolveIdentities returns Map<addrLower, Identity> where Identity.name: string | null
  const nm = (a?: string | null) =>
    a ? (names.get(a.toLowerCase())?.name ?? "jemand") : "jemand";

  return raw.map((t): TxView => {
    const confirmations = t.confirmations?.length ?? 0;
    const signers = (t.confirmations ?? []).map((c) => c.owner);
    let kind: TxView["kind"] = "sonstige";
    let title = "Aktion";

    // Owner/threshold management = a call to the Safe itself.
    if (t.to && getAddress(t.to) === getAddress(GK_SAFE) && t.data && t.data !== "0x") {
      try {
        const dec = decodeFunctionData({ abi: SAFE_ABI, data: t.data as `0x${string}` });
        if (dec.functionName === "addOwnerWithThreshold") {
          kind = "mitglied_hinzu";
          title = `Mitglied hinzufügen: ${nm(dec.args[0] as string)}`;
        } else if (dec.functionName === "removeOwner") {
          kind = "mitglied_entfernt";
          title = `Mitglied entfernen: ${nm(dec.args[1] as string)}`;
        } else if (dec.functionName === "changeThreshold") {
          kind = "schwelle";
          title = `Schwelle auf ${dec.args[0]} ändern`;
        }
      } catch {
        /* not a recognised Safe call — falls through to "sonstige" */
      }
    } else if (!t.data || t.data === "0x") {
      // Native xDAI transfer.
      kind = "auszahlung";
      title = `Auszahlung ${eur((Number(t.value ?? 0) / 1e18) * 0.92)} an ${nm(t.to)}`;
    } else {
      // ERC-20/1155 transfer (EURe / Röbel-Münzen) — recipient/amount from calldata.
      kind = "auszahlung";
      const tok = TOKENS.find(
        (x) => x.address && t.to && getAddress(x.address) === getAddress(t.to),
      );
      title = tok
        ? `Auszahlung in ${tok.label} an Empfänger`
        : `Auszahlung an ${nm(t.to)}`;
    }

    return {
      safeTxHash: t.safeTxHash,
      kind,
      title,
      confirmations,
      threshold: t.confirmationsRequired ?? confirmations,
      executed: !!t.isExecuted,
      signers,
      submissionDate: t.submissionDate,
    };
  });
}
