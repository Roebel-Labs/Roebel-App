import "server-only";
import { decodeFunctionData, getAddress } from "viem";
import { resolveCitizenProfiles } from "./citizens";
import { SAFE_ABI, GK_SAFE, TOKENS, type TxView, type TxSigner } from "./constants";
import { eur } from "./format";
import { XDAI_EUR } from "@/lib/muenzen/constants";

export async function describeTx(raw: any[]): Promise<TxView[]> {
  const addrs = new Set<string>();
  for (const t of raw) {
    if (t.to) addrs.add(getAddress(t.to));
    for (const c of t.confirmations ?? []) if (c.owner) addrs.add(getAddress(c.owner));
  }
  const profiles = await resolveCitizenProfiles([...addrs]);
  const prof = (a?: string) => (a ? profiles.get(a.toLowerCase()) : undefined);
  const nm = (a?: string) => prof(a)?.name ?? "jemand";

  return raw.map((t): TxView => {
    const confirmations = t.confirmations?.length ?? 0;
    const signers: TxSigner[] = (t.confirmations ?? []).map((c: any) => {
      const p = prof(c.owner);
      return { address: c.owner, name: p?.name ?? "Mitsignierer", avatarUrl: p?.avatarUrl ?? null };
    });
    let kind: TxView["kind"] = "sonstige";
    let title = "Aktion";
    let amount: string | null = null;
    let assetLabel: string | null = null;
    let counterparty: TxView["counterparty"] = null;

    const isSafeCall = t.to && getAddress(t.to) === getAddress(GK_SAFE) && t.data && t.data !== "0x";
    if (isSafeCall) {
      try {
        const dec = decodeFunctionData({ abi: SAFE_ABI, data: t.data });
        if (dec.functionName === "addOwnerWithThreshold") { kind = "mitglied_hinzu"; title = `Mitglied hinzufügen: ${nm(dec.args[0] as string)}`; counterparty = { name: nm(dec.args[0] as string), avatarUrl: prof(dec.args[0] as string)?.avatarUrl ?? null }; }
        else if (dec.functionName === "removeOwner") { kind = "mitglied_entfernt"; title = `Mitglied entfernen: ${nm(dec.args[1] as string)}`; counterparty = { name: nm(dec.args[1] as string), avatarUrl: prof(dec.args[1] as string)?.avatarUrl ?? null }; }
        else if (dec.functionName === "changeThreshold") { kind = "schwelle"; title = `Schwelle auf ${dec.args[0]} ändern`; }
      } catch { /* unknown safe call */ }
    } else if (!t.data || t.data === "0x") {
      kind = "auszahlung"; assetLabel = "xDAI";
      const eurVal = (Number(t.value || 0) / 1e18) * XDAI_EUR;
      amount = eur(eurVal);
      counterparty = { name: nm(t.to), avatarUrl: prof(t.to)?.avatarUrl ?? null };
      title = `Auszahlung ${amount} an ${counterparty.name}`;
    } else {
      kind = "auszahlung";
      const tok = TOKENS.find((x) => x.address && t.to && getAddress(x.address) === getAddress(t.to));
      assetLabel = tok?.label ?? null;
      title = tok ? `Auszahlung in ${tok.label}` : `Auszahlung an ${nm(t.to)}`;
      counterparty = tok ? null : { name: nm(t.to), avatarUrl: prof(t.to)?.avatarUrl ?? null };
    }

    return {
      safeTxHash: t.safeTxHash,
      kind, title, confirmations,
      threshold: t.confirmationsRequired ?? confirmations,
      executed: !!t.isExecuted,
      signers,
      date: t.executionDate ?? t.submissionDate ?? null,
      transactionHash: t.transactionHash ?? null,
      amount, assetLabel, counterparty,
    };
  });
}
