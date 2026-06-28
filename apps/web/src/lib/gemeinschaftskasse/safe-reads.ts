import "server-only";
import { getAddress } from "viem";
import { gnosisClient, nativeBalance, eureBalance, rcrcBalance } from "@/lib/muenzen/gnosis";
import { resolveIdentities } from "@/lib/muenzen/identity";
import { shortAddr, XDAI_EUR } from "@/lib/muenzen/constants";
import { GK_SAFE, SAFE_ABI, type OwnerView } from "./constants";

export async function getSafeOverview(you?: string) {
  const safe = getAddress(GK_SAFE);
  const [ownersRaw, thresholdRaw, xdai, eure, muenzen] = await Promise.all([
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getOwners" }),
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getThreshold" }),
    nativeBalance(GK_SAFE),
    eureBalance(GK_SAFE),
    rcrcBalance(GK_SAFE).catch(() => 0n),
  ]);
  const ownerAddrs = (ownersRaw as readonly string[]).map((a) => getAddress(a));
  // resolveIdentities returns Map<addrLower, Identity> where Identity.name: string | null
  const names = await resolveIdentities(ownerAddrs.map((a) => a.toLowerCase()));
  const owners: OwnerView[] = ownerAddrs.map((a) => ({
    address: a,
    name: names.get(a.toLowerCase())?.name ?? "Unbenannt",
    short: shortAddr(a),
    isYou: you ? a.toLowerCase() === you.toLowerCase() : false,
  }));
  const euro = (Number(xdai) / 1e18) * XDAI_EUR + Number(eure) / 1e18;
  return { owners, threshold: Number(thresholdRaw), balances: { xdai, eure, muenzen }, euro };
}
