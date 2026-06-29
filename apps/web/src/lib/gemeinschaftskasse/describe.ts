import "server-only";
import { decodeFunctionData, getAddress, parseAbi } from "viem";
import { resolveCitizenProfiles } from "./citizens";
import {
  SAFE_ABI,
  BASEGROUP_ABI,
  GK_SAFE,
  TOKENS,
  type TxView,
  type TxSigner,
  type TxOwnerState,
  type TxCategory,
  type TxStatus,
} from "./constants";
import { eur } from "./format";
import { XDAI_EUR } from "@/lib/muenzen/constants";
import { gnosisClient } from "@/lib/muenzen/gnosis";

const ERC20_ABI = parseAbi(["function transfer(address to, uint256 value) returns (bool)"]);
const ERC1155_ABI = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);

const num = (n: number, d = 2) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n);
const fromAtto = (v: bigint) => Number(v) / 1e18;

interface Decoded {
  category: TxCategory;
  icon: string;
  assetId: "xdai" | "eure" | "muenzen" | null;
  assetLabel: string | null;
  recipient: string | null; // address to resolve to a name
  amountAtto: bigint | null;
  funcName: string | null;
  newThreshold: number | null;
}

const CIRCLES_LABEL: Record<string, string> = {
  updateMetadataDigest: "Metadaten aktualisieren",
  trust: "Vertrauen setzen",
  setService: "Dienst-Adresse ändern",
  setMintHandler: "Mint-Handler ändern",
  setRedemptionHandler: "Einlöse-Handler ändern",
  registerShortName: "Kurznamen registrieren",
};

function decodeCall(t: any): Decoded {
  const to = t.to ? getAddress(t.to) : null;
  const data: string = t.data ?? "0x";
  const base: Decoded = {
    category: "sonstige",
    icon: "📄",
    assetId: null,
    assetLabel: null,
    recipient: to,
    amountAtto: null,
    funcName: data && data !== "0x" ? data.slice(0, 10) : null,
    newThreshold: null,
  };

  // Native xDAI transfer (no calldata).
  if (!data || data === "0x") {
    return { ...base, category: "auszahlung", icon: "💸", assetId: "xdai", assetLabel: "xDAI", amountAtto: BigInt(t.value || 0), recipient: to };
  }

  // Safe self-call → owner / threshold management.
  if (to && to === getAddress(GK_SAFE)) {
    try {
      const dec = decodeFunctionData({ abi: SAFE_ABI, data: data as `0x${string}` });
      if (dec.functionName === "addOwnerWithThreshold")
        return { ...base, category: "mitglied_hinzu", icon: "👤", recipient: dec.args[0] as string, funcName: dec.functionName, newThreshold: Number(dec.args[1]) };
      if (dec.functionName === "removeOwner")
        return { ...base, category: "mitglied_entfernt", icon: "🚪", recipient: dec.args[1] as string, funcName: dec.functionName, newThreshold: Number(dec.args[2]) };
      if (dec.functionName === "changeThreshold")
        return { ...base, category: "schwelle", icon: "⚖️", recipient: null, funcName: dec.functionName, newThreshold: Number(dec.args[0]) };
    } catch {
      /* not a known safe call */
    }
  }

  // ERC-20 transfer (EURe).
  try {
    const dec = decodeFunctionData({ abi: ERC20_ABI, data: data as `0x${string}` });
    if (dec.functionName === "transfer") {
      const tok = TOKENS.find((x) => x.address && to && getAddress(x.address) === to);
      return { ...base, category: "auszahlung", icon: "💸", assetId: (tok?.id as Decoded["assetId"]) ?? null, assetLabel: tok?.label ?? "Token", recipient: dec.args[0] as string, amountAtto: dec.args[1] as bigint };
    }
  } catch {
    /* not erc20 */
  }

  // ERC-1155 transfer (Röbel-Münzen) — same address also hosts the BaseGroup,
  // so we decode the function before deciding (this is the old mislabel bug).
  try {
    const dec = decodeFunctionData({ abi: ERC1155_ABI, data: data as `0x${string}` });
    if (dec.functionName === "safeTransferFrom")
      return { ...base, category: "auszahlung", icon: "🪙", assetId: "muenzen", assetLabel: "Röbel-Münzen", recipient: dec.args[1] as string, amountAtto: dec.args[3] as bigint };
  } catch {
    /* not erc1155 */
  }

  // Circles BaseGroup admin call.
  try {
    const dec = decodeFunctionData({ abi: BASEGROUP_ABI, data: data as `0x${string}` });
    return { ...base, category: "circles", icon: "🟣", recipient: null, funcName: dec.functionName };
  } catch {
    /* unknown call */
  }

  return base;
}

export async function describeTx(raw: any[]): Promise<TxView[]> {
  // On-chain approvals: smart-account owners approve via approveHash (no off-chain
  // signature), so they're absent from the tx-service confirmations. Read
  // Safe.approvedHashes so they still count and appear as signers.
  let owners: string[] = [];
  try {
    owners = [
      ...(await gnosisClient.readContract({ address: getAddress(GK_SAFE), abi: SAFE_ABI, functionName: "getOwners" })),
    ] as string[];
  } catch {
    owners = [];
  }
  const onchainApprovers = new Map<string, string[]>();
  await Promise.all(
    raw.map(async (t) => {
      if (!t.safeTxHash || t.isExecuted || owners.length === 0) return;
      const signed = new Set((t.confirmations ?? []).map((c: any) => (c.owner ?? "").toLowerCase()));
      const approvers: string[] = [];
      await Promise.all(
        owners.map(async (o) => {
          if (signed.has(o.toLowerCase())) return;
          try {
            const a = (await gnosisClient.readContract({
              address: getAddress(GK_SAFE), abi: SAFE_ABI, functionName: "approvedHashes", args: [getAddress(o), t.safeTxHash as `0x${string}`],
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

  const decoded = raw.map(decodeCall);

  // Collect every address that needs a display name.
  const addrs = new Set<string>();
  for (const o of owners) addrs.add(getAddress(o));
  raw.forEach((t, i) => {
    if (t.to) addrs.add(getAddress(t.to));
    for (const c of t.confirmations ?? []) if (c.owner) addrs.add(getAddress(c.owner));
    if (decoded[i].recipient) addrs.add(getAddress(decoded[i].recipient!));
  });
  for (const list of onchainApprovers.values()) for (const o of list) addrs.add(o);

  const profiles = await resolveCitizenProfiles([...addrs]);
  const prof = (a?: string | null) => (a ? profiles.get(a.toLowerCase()) : undefined);
  const nm = (a?: string | null) => prof(a)?.name ?? "Unbekannt";

  return raw.map((t, i): TxView => {
    const d = decoded[i];
    const approvers = onchainApprovers.get(t.safeTxHash) ?? [];
    const offchain: string[] = (t.confirmations ?? []).map((c: any) => c.owner);
    const signedSet = new Map<string, "signatur" | "onchain">();
    for (const o of offchain) signedSet.set(o.toLowerCase(), "signatur");
    for (const o of approvers) signedSet.set(o.toLowerCase(), "onchain");

    const confirmations = offchain.length + approvers.length;
    const threshold = t.confirmationsRequired ?? confirmations;

    const ownerStates: TxOwnerState[] = (owners.length ? owners : [...signedSet.keys()]).map((o) => {
      const via = signedSet.get(o.toLowerCase()) ?? null;
      const p = prof(o);
      return { address: getAddress(o), name: p?.name ?? "Mitsignierer", avatarUrl: p?.avatarUrl ?? null, signed: via !== null, via };
    });
    const signers: TxSigner[] = ownerStates.filter((o) => o.signed).map((o) => ({ address: o.address, name: o.name, avatarUrl: o.avatarUrl }));

    let status: TxStatus;
    if (t.isExecuted) status = t.isSuccessful === false ? "fehlgeschlagen" : "ausgefuehrt";
    else status = confirmations >= threshold ? "bereit" : "wartet";

    // Build the human title + description + amount per category.
    const recipientName = nm(d.recipient);
    const recipientAvatar = prof(d.recipient)?.avatarUrl ?? null;
    let title = "Aktion";
    let description = "";
    let amount: string | null = null;
    let counterparty: TxView["counterparty"] = null;

    if (d.category === "auszahlung") {
      const human = d.amountAtto != null ? fromAtto(d.amountAtto) : 0;
      if (d.assetId === "muenzen") {
        amount = `${num(human)} Röbel-Münzen`;
        title = `Auszahlung — ${amount}`;
        description = `${amount} an ${recipientName}. Röbel-Münzen sind nicht in Euro einlösbar.`;
      } else {
        const euros = d.assetId === "xdai" ? human * XDAI_EUR : human;
        amount = eur(euros);
        title = `Auszahlung — ${amount} an ${recipientName}`;
        description = `${num(human)} ${d.assetLabel} (≈ ${eur(euros)}) gehen an ${recipientName}.`;
      }
      counterparty = { name: recipientName, avatarUrl: recipientAvatar };
    } else if (d.category === "mitglied_hinzu") {
      title = `Mitglied hinzufügen — ${recipientName}`;
      description = `${recipientName} wird Mitsignierer. Neue Schwelle: ${d.newThreshold} Freigaben.`;
      counterparty = { name: recipientName, avatarUrl: recipientAvatar };
    } else if (d.category === "mitglied_entfernt") {
      title = `Mitglied entfernen — ${recipientName}`;
      description = `${recipientName} verliert das Freigaberecht. Neue Schwelle: ${d.newThreshold} Freigaben.`;
      counterparty = { name: recipientName, avatarUrl: recipientAvatar };
    } else if (d.category === "schwelle") {
      title = `Freigabe-Schwelle ändern`;
      description = `Künftig sind ${d.newThreshold} von ${owners.length || "—"} Freigaben für eine Auszahlung nötig.`;
    } else if (d.category === "circles") {
      const label = (d.funcName && CIRCLES_LABEL[d.funcName]) || "Einstellung ändern";
      title = `Circles-Gruppe — ${label}`;
      description = `Verwaltungsaktion an der Röbel-Münzen-Gruppe (${label}). Bewegt kein Geld aus der Kasse.`;
    } else {
      title = `Vertragsaufruf — ${d.funcName ?? "unbekannt"}`;
      description = `Direkter Aufruf an ${nm(t.to)}. Prüfe die Details vor der Freigabe.`;
    }

    return {
      safeTxHash: t.safeTxHash,
      category: d.category,
      icon: d.icon,
      title,
      description,
      status,
      confirmations,
      threshold,
      executed: !!t.isExecuted,
      signers,
      owners: ownerStates,
      date: t.executionDate ?? t.submissionDate ?? null,
      transactionHash: t.transactionHash ?? null,
      amount,
      assetLabel: d.assetLabel,
      counterparty,
      to: t.to ? getAddress(t.to) : GK_SAFE,
      rawData: t.data && t.data !== "0x" ? t.data : null,
    };
  });
}
