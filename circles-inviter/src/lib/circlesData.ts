// Read-only Circles data for the Röbel Circles dashboards. Public Circles RPC queries
// (no wallet needed). Every function catches and returns empty/zero — the UI never throws.
// Query shapes verified live against rpc.aboutcircles.com (circles_tables schema).
import { isHuman, ROEBEL_GROUP } from "./circles";
import { ROEBEL_CITIZENS } from "./citizens";

const RPC = "https://rpc.aboutcircles.com/";
const GROUP = ROEBEL_GROUP.toLowerCase();

type Row = Record<string, unknown>;
async function q(Namespace: string, Table: string, Filter: unknown[] = [], Order: unknown[] = [], Limit?: number): Promise<Row[]> {
  try {
    const params: Record<string, unknown> = { Namespace, Table, Columns: [], Filter, Order };
    if (Limit) params.Limit = Limit;
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_query", params: [params] }),
    });
    const json = await res.json();
    const cols: string[] = json?.result?.columns ?? [];
    const rows: unknown[][] = json?.result?.rows ?? [];
    return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  } catch {
    return [];
  }
}
const eq = (Column: string, Value: unknown) => ({ Type: "FilterPredicate", FilterType: "Equals", Column, Value });
const toCrc = (atto: unknown): number => {
  try { return atto ? Number(BigInt(atto as string)) / 1e18 : 0; } catch { return 0; }
};

/** Citizens (lowercased) that are registered Circles humans. */
export async function getVerifiedSet(): Promise<Set<string>> {
  const entries = await Promise.all(
    ROEBEL_CITIZENS.map(async (c) => [c.address.toLowerCase(), await isHuman(c.address).catch(() => false)] as const),
  );
  return new Set(entries.filter(([, v]) => v).map(([a]) => a));
}

export interface TownStats { supply: number; collateral: number; holders: number; verified: number; citizens: number; }
export async function getTownStats(verified: number): Promise<TownStats> {
  const [supplyRows, collRows, holderRows] = await Promise.all([
    q("V_CrcV2", "GroupTokenSupply", [eq("group", GROUP)]),
    q("V_CrcV2", "GroupCollateralByToken", [eq("group", GROUP)]),
    q("V_CrcV2", "GroupTokenHoldersBalance", [eq("group", GROUP)]),
  ]);
  const supply = toCrc(supplyRows[0]?.demurragedTotalSupply ?? supplyRows[0]?.totalSupply);
  const collateral = collRows.reduce((s, r) => s + toCrc(r.demurragedAmountLocked ?? r.amountLocked), 0);
  return { supply, collateral, holders: holderRows.length, verified, citizens: ROEBEL_CITIZENS.length };
}

export type NodeTone = "verified" | "attester" | "open";
export interface GraphNode { id: string; label: string; tone: NodeTone; trusted: boolean; }
export interface TrustGraph { centerLabel: string; nodes: GraphNode[] }
export async function getTrustGraph(verifiedSet: Set<string>): Promise<TrustGraph> {
  // The group trusts its citizens (truster = group) → group-centered star.
  const rows = await q("V_Crc", "TrustRelations", [eq("version", 2), eq("truster", GROUP)]);
  const trusted = new Set(rows.map((r) => String(r.trustee).toLowerCase()));
  const attester = new Set(ROEBEL_CITIZENS.filter((c) => c.attester).map((c) => c.address.toLowerCase()));
  const nodes: GraphNode[] = ROEBEL_CITIZENS.map((c) => {
    const a = c.address.toLowerCase();
    const tone: NodeTone = verifiedSet.has(a) ? "verified" : attester.has(a) ? "attester" : "open";
    return { id: c.address, label: `${c.address.slice(0, 6)}…`, tone, trusted: trusted.has(a) };
  });
  return { centerLabel: "Röbel-Taler", nodes };
}

export interface Transfer { from: string; to: string; amount: number; time: number; tx: string; }
export async function getRecentTransfers(limit = 12): Promise<Transfer[]> {
  const rows = await q("V_CrcV2", "Transfers", [eq("tokenAddress", GROUP)], [{ Column: "blockNumber", SortOrder: "Desc" }], limit);
  return rows.map((r) => ({
    from: String(r.from ?? ""),
    to: String(r.to ?? ""),
    amount: toCrc(r.value),
    time: Number(r.timestamp ?? 0),
    tx: String(r.transactionHash ?? ""),
  }));
}
