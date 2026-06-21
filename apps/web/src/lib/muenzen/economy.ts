// Higher-level Röbel Münzen economy reads, composed from on-chain Circles data
// and cached. Shared by the overview / flow / trust / wallets routes so the
// expensive transfer + balance queries run once per TTL window. Server-only.
import "server-only";
import { getAddress } from "viem";
import { gnosisClient } from "./gnosis";
import {
  getGroupTransfers,
  getVaultCollateralAtto,
  trusteesOf,
  type CirclesTransfer,
} from "./circles-rpc";
import {
  ADDR,
  HUB_ABI,
  GROUP_TOKEN_ID,
  ZERO_ADDRESS,
  attoToNumber,
} from "./constants";
import { cached, TTL } from "./cache";

export type FlowKind = "mint" | "earn" | "spend" | "peer";

/** Classify a group-token transfer into an economic flow category. */
export function classifyTransfer(t: CirclesTransfer): FlowKind {
  const funder = ADDR.funder.toLowerCase();
  if (t.from === ZERO_ADDRESS) return "mint";
  if (t.to === funder) return "spend"; // RCRC paid back to the funder (lootbox sink)
  if (t.from === funder) return "earn"; // reward payout from the funder
  return "peer";
}

export interface Holder {
  address: string;
  rcrc: number;
}

/** Multicall RCRC balances for many addresses (allowFailure → 0n). */
async function rcrcBalancesMulti(addresses: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  if (addresses.length === 0) return out;
  try {
    const results = await gnosisClient.multicall({
      allowFailure: true,
      contracts: addresses.map((a) => ({
        address: getAddress(ADDR.hub),
        abi: HUB_ABI,
        functionName: "balanceOf" as const,
        args: [getAddress(a), GROUP_TOKEN_ID] as const,
      })),
    });
    addresses.forEach((a, i) => {
      const r = results[i];
      out.set(a, r?.status === "success" ? (r.result as bigint) : 0n);
    });
  } catch {
    // Fallback: sequential reads (kept small by the caller's caps).
    await Promise.all(
      addresses.map(async (a) => {
        try {
          const bal = await gnosisClient.readContract({
            address: getAddress(ADDR.hub),
            abi: HUB_ABI,
            functionName: "balanceOf",
            args: [getAddress(a), GROUP_TOKEN_ID],
          });
          out.set(a, bal);
        } catch {
          out.set(a, 0n);
        }
      }),
    );
  }
  return out;
}

export const loadTransfers = (fresh = false) =>
  cached<CirclesTransfer[]>("transfers", TTL.chain, () => getGroupTransfers(1000), fresh);

export interface HolderSet {
  holders: Holder[];
  supply: number;
}

/**
 * Current RCRC holders (positive demurraged balance) derived from the transfer
 * log, with supply = sum of live balances (more accurate than a static total
 * under demurrage).
 */
export const loadHolders = (fresh = false) =>
  cached<HolderSet>(
    "holders",
    TTL.chain,
    async () => {
      const transfers = await loadTransfers(fresh);
      const candidates = [
        ...new Set(
          transfers
            .flatMap((t) => [t.from, t.to])
            .filter((a) => a && a !== ZERO_ADDRESS),
        ),
      ].slice(0, 200);
      const balances = await rcrcBalancesMulti(candidates);
      const holders: Holder[] = [];
      let supplyAtto = 0n;
      for (const [address, bal] of balances) {
        if (bal > 0n) {
          holders.push({ address, rcrc: attoToNumber(bal) });
          supplyAtto += bal;
        }
      }
      holders.sort((a, b) => b.rcrc - a.rcrc);
      return { holders, supply: attoToNumber(supplyAtto) };
    },
    fresh,
  );

export interface CitizenStats {
  /** Citizens the group trusts (the mint gate). */
  trusted: string[];
  /** Of those, how many have actually minted (hold RCRC > 0). */
  joined: number;
}

export const loadCitizens = (fresh = false) =>
  cached<CitizenStats>(
    "citizens",
    TTL.chain,
    async () => {
      const trusted = await trusteesOf(ADDR.group, 200);
      const balances = await rcrcBalancesMulti(trusted);
      let joined = 0;
      for (const a of trusted) if ((balances.get(a) ?? 0n) > 0n) joined += 1;
      return { trusted, joined };
    },
    fresh,
  );

export interface CollateralInfo {
  collateral: number;
  supply: number;
  /** collateral ÷ supply (1.0 = fully backed). */
  ratio: number;
}

export const loadCollateral = (fresh = false) =>
  cached<CollateralInfo>(
    "collateral",
    TTL.chain,
    async () => {
      const [collateralAtto, holderSet] = await Promise.all([
        getVaultCollateralAtto(),
        loadHolders(fresh),
      ]);
      const collateral = attoToNumber(collateralAtto);
      const supply = holderSet.supply;
      return { collateral, supply, ratio: supply > 0 ? collateral / supply : 0 };
    },
    fresh,
  );

export interface RangeWindow {
  key: "24h" | "7d" | "30d" | "all";
  sinceMs: number;
}

export function rangeWindow(key: string, nowMs: number): RangeWindow {
  switch (key) {
    case "24h":
      return { key: "24h", sinceMs: nowMs - 24 * 3600_000 };
    case "7d":
      return { key: "7d", sinceMs: nowMs - 7 * 86_400_000 };
    case "90d":
      return { key: "30d", sinceMs: nowMs - 90 * 86_400_000 };
    case "all":
      return { key: "all", sinceMs: 0 };
    default:
      return { key: "30d", sinceMs: nowMs - 30 * 86_400_000 };
  }
}

export interface FlowTotals {
  mint: number;
  earn: number;
  spend: number;
  peer: number;
}

/** Sum transfer values by flow kind within [sinceMs, now]. */
export function totalsSince(transfers: CirclesTransfer[], sinceMs: number): FlowTotals {
  const totals: FlowTotals = { mint: 0, earn: 0, spend: 0, peer: 0 };
  for (const t of transfers) {
    if (t.timestamp < sinceMs) continue;
    totals[classifyTransfer(t)] += attoToNumber(t.value);
  }
  return totals;
}
