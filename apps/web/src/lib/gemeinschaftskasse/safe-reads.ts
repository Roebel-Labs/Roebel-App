import "server-only";
import { getAddress } from "viem";
import { gnosisClient, nativeBalance, eureBalance, rcrcBalance } from "@/lib/muenzen/gnosis";
import { XDAI_EUR, attoToNumber, shortAddr } from "@/lib/muenzen/constants";
import { GK_SAFE, SAFE_ABI, type OwnerView, type AssetHolding } from "./constants";
import { resolveCitizenProfiles } from "./citizens";

export async function getSafeOverview(you?: string) {
  const safe = getAddress(GK_SAFE);
  const [ownersRaw, thresholdRaw, nonceRaw, xdai, eure, muenzen] = await Promise.all([
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getOwners" }),
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getThreshold" }),
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "nonce" }),
    nativeBalance(GK_SAFE),
    eureBalance(GK_SAFE),
    rcrcBalance(GK_SAFE).catch(() => 0n),
  ]);
  const ownerAddrs = (ownersRaw as readonly string[]).map((a) => getAddress(a));
  const profiles = await resolveCitizenProfiles(ownerAddrs);
  const owners: OwnerView[] = ownerAddrs.map((a) => {
    const p = profiles.get(a.toLowerCase());
    return {
      address: a,
      name: p?.name ?? "Externe Wallet",
      short: shortAddr(a),
      isYou: you ? a.toLowerCase() === you.toLowerCase() : false,
      avatarUrl: p?.avatarUrl ?? null,
      username: p?.username ?? null,
      verified: p?.verified ?? false,
      source: p?.source ?? "external",
    };
  });

  const euroXdai = (Number(xdai) / 1e18) * XDAI_EUR;
  const euroEure = Number(eure) / 1e18;
  const euroTotal = euroXdai + euroEure;
  const assets: AssetHolding[] = [
    { id: "xdai", label: "xDAI", amount: Number(xdai) / 1e18, atto: xdai.toString(), eur: euroXdai, sharePct: euroTotal ? (euroXdai / euroTotal) * 100 : 0, redeemable: true },
    { id: "eure", label: "EURe", amount: Number(eure) / 1e18, atto: eure.toString(), eur: euroEure, sharePct: euroTotal ? (euroEure / euroTotal) * 100 : 0, redeemable: true },
    { id: "muenzen", label: "Röbel-Münzen", amount: attoToNumber(muenzen), atto: muenzen.toString(), eur: null, sharePct: null, redeemable: false },
  ];

  return {
    owners,
    assets,
    euroTotal,
    threshold: Number(thresholdRaw),
    ownerCount: ownerAddrs.length,
    nonce: Number(nonceRaw),
    safeAddress: safe,
    safeVersion: "1.4.1",
  };
}
