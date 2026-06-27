// Read-only Circles data for the Röbel Circles dashboards. Public Circles RPC queries
// (no wallet needed). Every function catches and returns empty/zero — the UI never throws.
// Query shapes verified live against rpc.aboutcircles.com (circles_tables schema).
import { isHuman, getCollateralLocked, ROEBEL_GROUP } from "./circles";
import { ROEBEL_CITIZENS } from "./citizens";
import { fetchRoebelCitizens } from "./citizens-onchain";

const RPC = "https://rpc.aboutcircles.com/";
const GROUP = ROEBEL_GROUP.toLowerCase();
// The Transfers view is NOT filterable by `tokenAddress` (it's a computed output
// column → the RPC rejects it with -32602 and q() silently returns []). Filter by
// the ERC-1155 token id instead = uint256(group address) as a decimal string. This
// matches the proven query in the apps/web Münzen console (lib/muenzen/circles-rpc.ts)
// and is what makes the Pulse flow data actually load.
const GROUP_TOKEN_ID = BigInt(ROEBEL_GROUP).toString();

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

// ── Circles profiles (real avatar name + picture) ─────────────────────────────
// On-chain Avatars row (name + metadata digest) → optional IPFS profile for the
// display name/picture. Mirrors the proven query in the apps/web Münzen console
// (lib/muenzen/circles-rpc.ts getAvatarsBatch). Best-effort: every failure
// resolves to nulls so the UI falls back to a placeholder.
const PROFILE_GET = "https://rpc.aboutcircles.com/profiles/get?cid=";
const ZERO_DIGEST = "0x" + "0".repeat(64);

export interface Profile { name: string | null; imageUrl: string | null; }

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function digestToCidV0(hex: string): string {
  const h = hex.replace(/^0x/, "");
  const bytes = [0x12, 0x20];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let out = "";
  while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
  return "1".repeat(zeros) + out;
}

/** Real Circles avatar name + profile picture for a batch of addresses. Deduped, capped at 80. */
export async function getProfiles(addresses: string[]): Promise<Map<string, Profile>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))].slice(0, 80);
  const map = new Map<string, Profile>();
  await Promise.all(
    uniq.map(async (a) => {
      try {
        const rows = await q("V_CrcV2", "Avatars", [eq("avatar", a)], [], 1);
        if (!rows.length) { map.set(a, { name: null, imageUrl: null }); return; }
        let name = (rows[0].name as string) || null;
        let imageUrl: string | null = null;
        const digest = rows[0].cidV0Digest as string | undefined;
        if (digest && digest !== ZERO_DIGEST) {
          try {
            const cid = digestToCidV0(digest);
            const p = await fetch(`${PROFILE_GET}${cid}`).then((r) => r.json());
            name = p?.name || name;
            imageUrl = p?.imageUrl || p?.previewImageUrl || null;
          } catch { /* keep the on-chain name */ }
        }
        map.set(a, { name, imageUrl });
      } catch {
        map.set(a, { name: null, imageUrl: null });
      }
    }),
  );
  return map;
}

/** Citizens (lowercased) that are registered Circles humans. */
export async function getVerifiedSet(): Promise<Set<string>> {
  const citizens = await fetchRoebelCitizens().catch(() => ROEBEL_CITIZENS);
  const entries = await Promise.all(
    citizens.map(async (c) => [c.address.toLowerCase(), await isHuman(c.address).catch(() => false)] as const),
  );
  return new Set(entries.filter(([, v]) => v).map(([a]) => a));
}

export interface TownStats { supply: number; collateral: number; holders: number; verified: number; citizens: number; }
export async function getTownStats(verified: number): Promise<TownStats> {
  const [supplyRows, collateral, holderRows, citizenList] = await Promise.all([
    q("V_CrcV2", "GroupTokenSupply", [eq("group", GROUP)]),
    // BaseGroup collateral lives in its own vault, not the legacy GroupCollateralByToken
    // view — read the vault's real personal-CRC holdings instead.
    getCollateralLocked(),
    q("V_CrcV2", "GroupTokenHoldersBalance", [eq("group", GROUP)]),
    fetchRoebelCitizens().catch(() => ROEBEL_CITIZENS),
  ]);
  const supply = toCrc(supplyRows[0]?.demurragedTotalSupply ?? supplyRows[0]?.totalSupply);
  return { supply, collateral, holders: holderRows.length, verified, citizens: citizenList.length };
}

export type NodeTone = "verified" | "attester" | "open";
export interface GraphNode { id: string; label: string; tone: NodeTone; trusted: boolean; }
export interface TrustGraph { centerLabel: string; nodes: GraphNode[] }
export async function getTrustGraph(verifiedSet: Set<string>): Promise<TrustGraph> {
  // The group trusts its citizens (truster = group) → group-centered star.
  const [rows, citizens] = await Promise.all([
    q("V_Crc", "TrustRelations", [eq("version", 2), eq("truster", GROUP)]),
    fetchRoebelCitizens().catch(() => ROEBEL_CITIZENS),
  ]);
  const trusted = new Set(rows.map((r) => String(r.trustee).toLowerCase()));
  const attester = new Set(citizens.filter((c) => c.attester).map((c) => c.address.toLowerCase()));
  const nodes: GraphNode[] = citizens.map((c) => {
    const a = c.address.toLowerCase();
    const tone: NodeTone = verifiedSet.has(a) ? "verified" : attester.has(a) ? "attester" : "open";
    return { id: c.address, label: `${c.address.slice(0, 6)}…`, tone, trusted: trusted.has(a) };
  });
  return { centerLabel: "Röbel Münzen", nodes };
}

// The operational funder (rewards out + lootbox spend in) — classifies the token flows.
export const FUNDER = "0x5ac82fd7f576c86aed8d174074ba707ec1979d9b";
const ZERO = "0x0000000000000000000000000000000000000000";

export type FlowKind = "mint" | "reward" | "spend" | "transfer";
const KIND_LABEL: Record<FlowKind, string> = { mint: "Mint", reward: "Reward", spend: "Lootbox", transfer: "Transfer" };
export const flowLabel = (k: FlowKind) => KIND_LABEL[k];
function classify(from: string, to: string): FlowKind {
  const f = from.toLowerCase(), t = to.toLowerCase();
  if (f === ZERO || f === GROUP) return "mint";       // RCRC minted (citizen groupMint)
  if (t === FUNDER) return "spend";                    // payment into the funder (e.g. lootbox key)
  if (f === FUNDER) return "reward";                   // funder reward payout
  return "transfer";                                   // peer-to-peer
}

export interface Transfer { from: string; to: string; amount: number; time: number; tx: string; kind: FlowKind; }
export async function getRecentTransfers(limit = 40): Promise<Transfer[]> {
  const rows = await q("V_CrcV2", "Transfers", [eq("id", GROUP_TOKEN_ID)], [{ Column: "blockNumber", SortOrder: "Desc" }], limit);
  return rows.map((r) => {
    const from = String(r.from ?? ""), to = String(r.to ?? "");
    return { from, to, amount: toCrc(r.value), time: Number(r.timestamp ?? 0), tx: String(r.transactionHash ?? ""), kind: classify(from, to) };
  });
}

// Per-address reputation: RCRC held + flow activity. A simple, transparent score for the
// reputation graph (held weighted highest, then inbound, then outbound flows).
export interface RepNode { address: string; held: number; inCount: number; outCount: number; score: number; verified: boolean; }
export async function getReputation(verifiedSet: Set<string>): Promise<RepNode[]> {
  const [holders, transfers] = await Promise.all([
    q("V_CrcV2", "GroupTokenHoldersBalance", [eq("group", GROUP)]),
    getRecentTransfers(200),
  ]);
  const map = new Map<string, RepNode>();
  const get = (addr: string) => {
    const k = addr.toLowerCase();
    if (!map.has(k)) map.set(k, { address: k, held: 0, inCount: 0, outCount: 0, score: 0, verified: verifiedSet.has(k) });
    return map.get(k)!;
  };
  for (const h of holders) get(String(h.holder)).held = toCrc(h.demurragedTotalBalance ?? h.totalBalance);
  for (const t of transfers) {
    if (t.from && t.from.toLowerCase() !== ZERO) get(t.from).outCount++;
    if (t.to) get(t.to).inCount++;
  }
  for (const n of map.values()) n.score = n.held + n.inCount * 0.5 + n.outCount * 0.25;
  return [...map.values()]
    .filter((n) => n.address !== ZERO && n.address !== GROUP && (n.held > 0 || n.inCount || n.outCount))
    .sort((a, b) => b.score - a.score);
}

// ── Derived analytics (pure — no extra RPC; computed from real transfers) ─────
// Monochrome split: navy (the single accent) for minting — the headline flow —
// then descending neutral grays. No green/amber/red/violet.
export const FLOW_COLOR: Record<FlowKind, string> = {
  mint: "#00498B", // navy — new coins minted
  reward: "#525252", // neutral-600 — reward payouts from the town treasury
  spend: "#a3a3a3", // neutral-400 — paid into the treasury (e.g. lootbox)
  transfer: "#d4d4d4", // neutral-300 — peer-to-peer
};

export interface FlowSummary {
  kind: FlowKind;
  label: string;
  color: string;
  count: number;
  amount: number;
}
export function summarizeFlows(transfers: Transfer[]): {
  byKind: FlowSummary[];
  totalAmount: number;
  totalCount: number;
  activeAddresses: number;
} {
  const kinds: FlowKind[] = ["mint", "reward", "spend", "transfer"];
  const byKind = kinds.map((k) => {
    const items = transfers.filter((t) => t.kind === k);
    return { kind: k, label: KIND_LABEL[k], color: FLOW_COLOR[k], count: items.length, amount: items.reduce((a, t) => a + t.amount, 0) };
  });
  const active = new Set<string>();
  for (const t of transfers) {
    if (t.from && t.from.toLowerCase() !== ZERO) active.add(t.from.toLowerCase());
    if (t.to) active.add(t.to.toLowerCase());
  }
  active.delete(GROUP);
  active.delete(ZERO);
  return { byKind, totalAmount: byKind.reduce((a, s) => a + s.amount, 0), totalCount: transfers.length, activeAddresses: active.size };
}

export interface DayBucket {
  label: string;
  mint: number;
  reward: number;
  spend: number;
  transfer: number;
  total: number;
}
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
// Personal "your impact" for the connected wallet, derived from the reputation
// list the dashboards already fetch (no extra RPC). A coin-holder is always in
// the reputation list (it includes every holder), so held === group balance.
export interface MyImpact {
  balance: number;
  rank: number | null;
  total: number;
  inCount: number;
  outCount: number;
}
export function getMyImpact(wallet: string, rep: RepNode[]): MyImpact {
  const w = wallet.toLowerCase();
  const idx = rep.findIndex((r) => r.address.toLowerCase() === w);
  const node = idx >= 0 ? rep[idx] : null;
  return { balance: node?.held ?? 0, rank: idx >= 0 ? idx + 1 : null, total: rep.length, inCount: node?.inCount ?? 0, outCount: node?.outCount ?? 0 };
}

/** Bucket transfer volume by day over the last `days` (oldest → newest) for the area chart. */
export function dailyVolume(transfers: Transfer[], days = 14): DayBucket[] {
  const dayMs = 86_400_000;
  const todayStart = startOfDay(Date.now());
  const buckets: DayBucket[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(todayStart - (days - 1 - i) * dayMs);
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), mint: 0, reward: 0, spend: 0, transfer: 0, total: 0 };
  });
  for (const t of transfers) {
    const ms = t.time < 1e12 ? t.time * 1000 : t.time;
    const idx = days - 1 - Math.round((todayStart - startOfDay(ms)) / dayMs);
    if (idx < 0 || idx >= days) continue;
    buckets[idx][t.kind] += t.amount;
    buckets[idx].total += t.amount;
  }
  return buckets;
}
