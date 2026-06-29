import "server-only";
import { decodeFunctionData, getAddress } from "viem";
import { resolveCitizenProfiles } from "./citizens";
import { SAFE_ABI, GK_SAFE, TOKENS, type TxView, type TxSigner } from "./constants";
import { eur } from "./format";
import { XDAI_EUR } from "@/lib/muenzen/constants";
import { gnosisClient } from "@/lib/muenzen/gnosis";

export async function describeTx(raw: any[]): Promise<TxView[]> {
  // Smart-account owners approve on-chain via approveHash (no off-chain signature),
  // so they're absent from the tx-service confirmations. Read Safe.approvedHashes
  // so they still count toward the threshold and appear as signers.
  let owners: string[] = [];
  try {
    owners = [
      ...(await gnosisClient.readContract({
        address: getAddress(GK_SAFE),
        abi: SAFE_ABI,
        functionName: "getOwners",
      })),
    ] as string[];
  } catch {
    owners = [];
  }
  const onchainApprovers = new Map<string, string[]>();
  await Promise.all(
    raw.map(async (t) => {
      if (!t.safeTxHash || t.isExecuted || owners.length === 0) return;
      const signed = new Set(
        (t.confirmations ?? []).map((c: any) => (c.owner ?? "").toLowerCase()),
      );
      const approvers: string[] = [];
      await Promise.all(
        owners.map(async (o) => {
          if (signed.has(o.toLowerCase())) return;
          try {
            const a = (await gnosisClient.readContract({
              address: getAddress(GK_SAFE),
              abi: SAFE_ABI,
              functionName: "approvedHashes",
              args: [getAddress(o), t.safeTxHash as `0x${string}`],
            })) as bigint;
            if (a > 0n) approvers.push(getAddress(o));
          } catch {
            /* ignore */
          }
        }),
      );
      if (approvers.length) onchainApprovers.set(t.safeTxHash, approvers);
    }),
  );

  const addrs = new Set<string>();
  for (const t of raw) {
    if (t.to) addrs.add(getAddress(t.to));
    for (const c of t.confirmations ?? []) if (c.owner) addrs.add(getAddress(c.owner));
  }
  for (const list of onchainApprovers.values())
    for (const o of list) addrs.add(o);

  const profiles = await resolveCitizenProfiles([...addrs]);
  const prof = (a?: string) => (a ? profiles.get(a.toLowerCase()) : undefined);
  const nm = (a?: string) => prof(a)?.name ?? "jemand";

  return raw.map((t): TxView => {
    const approvers = onchainApprovers.get(t.safeTxHash) ?? [];
    const confirmations = (t.confirmations?.length ?? 0) + approvers.length;
    const signers: TxSigner[] = [
      ...(t.confirmations ?? []).map((c: any) => {
        const p = prof(c.owner);
        return { address: c.owner, name: p?.name ?? "Mitsignierer", avatarUrl: p?.avatarUrl ?? null };
      }),
      ...approvers.map((o) => {
        const p = prof(o);
        return { address: o, name: p?.name ?? "Mitsignierer", avatarUrl: p?.avatarUrl ?? null };
      }),
    ];
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
