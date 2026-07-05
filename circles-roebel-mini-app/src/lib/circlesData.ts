// Read-only Circles data for the Röbel Circles dashboards. Public Circles RPC queries
// (no wallet needed). Every function catches and returns empty/zero — the UI never throws.
// Query shapes verified live against rpc.aboutcircles.com (circles_tables schema).
import { isHuman, getCollateralLocked, ROEBEL_GROUP, ROEBEL_VAULT } from "./circles";
import { ROEBEL_CITIZENS } from "./citizens";
import { fetchRoebelCitizens } from "./citizens-onchain";
import { C, FLOW_COLOR } from "./chartTheme";

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
// Flow colours come from the brand chart theme (navy mint / sky reward / gold
// spend / gray peer). Re-exported here so existing call sites and the new
// Economy sections all share one source of truth (src/lib/chartTheme.ts).
export { FLOW_COLOR };

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

// ─────────────────────────────────────────────────────────────────────────────
// Data-rich Economy tab — one batched snapshot + pure derived series.
// Every series below is computed from the snapshot (no extra RPC), so changing
// the selected time range never refetches; it just recomputes in memory.
// ─────────────────────────────────────────────────────────────────────────────

export type RangeKey = "7d" | "30d" | "90d" | "all";
const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 86_400_000;
/** Circles timestamps are unix seconds; normalize to ms (0 stays 0). */
const toMs = (t: number) => (t > 0 && t < 1e12 ? t * 1000 : t);
/** System wallets excluded from citizen-facing distribution / active counts. */
const SYSTEM = new Set([ZERO, GROUP, FUNDER, ROEBEL_VAULT.toLowerCase()]);
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Day-buckets a range spans — data-driven (oldest transfer → today) for "all". */
export function rangeDays(transfers: Transfer[], range: RangeKey): number {
  if (range !== "all") return RANGE_DAYS[range];
  const times = transfers.map((t) => toMs(t.time)).filter((x) => x > 0);
  if (!times.length) return 30;
  const span = Math.ceil((startOfDay(Date.now()) - startOfDay(Math.min(...times))) / DAY_MS) + 1;
  return Math.min(Math.max(span, 7), 180);
}

// ── Holders ───────────────────────────────────────────────────────────────────
export interface Holder { address: string; balance: number; }
/** Every wallet holding the group token, citizen-facing (system wallets removed). */
export async function getHolders(): Promise<Holder[]> {
  const rows = await q("V_CrcV2", "GroupTokenHoldersBalance", [eq("group", GROUP)]);
  return rows
    .map((r) => ({ address: String(r.holder ?? "").toLowerCase(), balance: toCrc(r.demurragedTotalBalance ?? r.totalBalance) }))
    .filter((h) => h.address && !SYSTEM.has(h.address));
}

// ── One batched snapshot for the whole tab ─────────────────────────────────────
export interface EconomySnapshot {
  supply: number;
  collateral: number;
  holders: Holder[];
  transfers: Transfer[];
  verified: Set<string>;
}
export async function getEconomy(): Promise<EconomySnapshot> {
  const verified = await getVerifiedSet().catch(() => new Set<string>());
  const [supplyRows, collateral, holders, transfers] = await Promise.all([
    q("V_CrcV2", "GroupTokenSupply", [eq("group", GROUP)]),
    getCollateralLocked(),
    getHolders().catch(() => [] as Holder[]),
    getRecentTransfers(1000),
  ]);
  const supply = toCrc(supplyRows[0]?.demurragedTotalSupply ?? supplyRows[0]?.totalSupply);
  return { supply, collateral, holders, transfers, verified };
}

/** Net change to supply a transfer represents: +mint, −burn, 0 for peer moves. */
function netMint(t: Transfer): number {
  const f = t.from.toLowerCase(), to = t.to.toLowerCase();
  const isMint = f === ZERO || f === GROUP;
  const isBurn = to === ZERO || to === GROUP;
  if (isMint && !isBurn) return t.amount;
  if (isBurn && !isMint) return -t.amount;
  return 0;
}

// ── Supply over time (anchored to the live demurraged supply) ──────────────────
export interface SupplyPoint { label: string; ms: number; supply: number; }
/** Cumulative net supply per day. Anchors the last point to the live supply and
 *  integrates backward via mint/burn — correct for any window we hold transfers for. */
export function cumulativeSupplySeries(transfers: Transfer[], currentSupply: number, range: RangeKey): SupplyPoint[] {
  const days = rangeDays(transfers, range);
  const todayStart = startOfDay(Date.now());
  const net = new Array<number>(days).fill(0);
  for (const t of transfers) {
    const ms = toMs(t.time);
    if (!ms) continue;
    const idx = days - 1 - Math.round((todayStart - startOfDay(ms)) / DAY_MS);
    if (idx < 0 || idx >= days) continue;
    net[idx] += netMint(t);
  }
  const supplyEnd = new Array<number>(days).fill(0);
  supplyEnd[days - 1] = currentSupply;
  for (let i = days - 2; i >= 0; i--) supplyEnd[i] = supplyEnd[i + 1] - net[i + 1];
  return Array.from({ length: days }, (_, i) => {
    const ms = todayStart - (days - 1 - i) * DAY_MS;
    return { label: dayLabel(ms), ms, supply: Math.max(0, supplyEnd[i]) };
  });
}

/** Daily flow buckets across the selected range (generalizes dailyVolume). */
export function flowsByDay(transfers: Transfer[], range: RangeKey): DayBucket[] {
  return dailyVolume(transfers, rangeDays(transfers, range));
}

// ── Holder distribution (histogram + Gini + Lorenz + concentration) ────────────
export interface DistBucket { label: string; count: number; color: string; min: number; max: number; }
export interface HolderDistribution {
  buckets: DistBucket[];
  gini: number;
  lorenz: { x: number; y: number }[];
  topShare: { n: number; share: number };
  holderCount: number;
  total: number;
  median: number;
  mean: number;
}
const DIST_EDGES = [0, 10, 25, 50, 100, 250, Infinity];
const DIST_LABELS = ["<10", "10–25", "25–50", "50–100", "100–250", "250+"];
export function holderDistribution(holders: Holder[]): HolderDistribution {
  const vals = holders.map((h) => h.balance).filter((b) => b > 0).sort((a, b) => a - b);
  const n = vals.length;
  const total = vals.reduce((a, b) => a + b, 0);
  const buckets: DistBucket[] = DIST_LABELS.map((label, i) => ({ label, count: 0, color: C.navy, min: DIST_EDGES[i], max: DIST_EDGES[i + 1] }));
  for (const v of vals) {
    const bi = DIST_EDGES.findIndex((e, i) => v >= e && v < DIST_EDGES[i + 1]);
    if (bi >= 0 && bi < buckets.length) buckets[bi].count++;
  }
  let cum = 0;
  for (let i = 0; i < n; i++) cum += vals[i] * (i + 1);
  const gini = n === 0 || total === 0 ? 0 : (2 * cum) / (n * total) - (n + 1) / n;
  const lorenz: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  let cw = 0;
  for (let i = 0; i < n; i++) { cw += vals[i]; lorenz.push({ x: (i + 1) / n, y: total ? cw / total : 0 }); }
  const topN = Math.min(n, Math.max(5, Math.ceil(n * 0.1)));
  const topShare = { n: topN, share: total ? vals.slice(-topN).reduce((a, b) => a + b, 0) / total : 0 };
  return {
    buckets,
    gini: Math.max(0, Math.min(1, gini)),
    lorenz,
    topShare,
    holderCount: n,
    total,
    median: n ? vals[Math.floor(n / 2)] : 0,
    mean: n ? total / n : 0,
  };
}

// ── Velocity / circulation health ──────────────────────────────────────────────
export interface VelocityPoint { label: string; ms: number; velocity: number; volume: number; active: number; txPerWallet: number; }
export interface VelocitySummary { points: VelocityPoint[]; avgVelocity: number; avgTxPerWallet: number; peak: VelocityPoint | null; }
/** Money velocity (circulating volume ÷ supply) + transfers per active wallet, daily. */
export function velocitySeries(transfers: Transfer[], supply: number, range: RangeKey): VelocitySummary {
  const days = rangeDays(transfers, range);
  const todayStart = startOfDay(Date.now());
  const vol = new Array<number>(days).fill(0);
  const txs = new Array<number>(days).fill(0);
  const actives: Set<string>[] = Array.from({ length: days }, () => new Set<string>());
  for (const t of transfers) {
    const ms = toMs(t.time);
    if (!ms) continue;
    const idx = days - 1 - Math.round((todayStart - startOfDay(ms)) / DAY_MS);
    if (idx < 0 || idx >= days) continue;
    if (t.kind !== "mint") { vol[idx] += t.amount; txs[idx]++; } // circulation excludes coin creation
    const f = t.from.toLowerCase(), to = t.to.toLowerCase();
    if (!SYSTEM.has(f)) actives[idx].add(f);
    if (!SYSTEM.has(to)) actives[idx].add(to);
  }
  const denom = supply > 0 ? supply : 1;
  const points: VelocityPoint[] = Array.from({ length: days }, (_, i) => {
    const ms = todayStart - (days - 1 - i) * DAY_MS;
    const active = actives[i].size;
    return { label: dayLabel(ms), ms, velocity: vol[i] / denom, volume: vol[i], active, txPerWallet: active ? txs[i] / active : 0 };
  });
  const avgVelocity = points.reduce((a, p) => a + p.velocity, 0) / (points.length || 1);
  const withActivity = points.filter((p) => p.active > 0);
  const avgTxPerWallet = withActivity.length ? withActivity.reduce((a, p) => a + p.txPerWallet, 0) / withActivity.length : 0;
  const peak = points.reduce<VelocityPoint | null>((m, p) => (!m || p.velocity > m.velocity ? p : m), null);
  return { points, avgVelocity, avgTxPerWallet, peak };
}

// ── Growth (new holders over time) ─────────────────────────────────────────────
export interface GrowthPoint { label: string; ms: number; added: number; cumulative: number; }
/** First time each (non-system) wallet RECEIVED coins → new holders/day + cumulative. */
export function newHoldersSeries(transfers: Transfer[], range: RangeKey): { points: GrowthPoint[]; addedInRange: number } {
  const firstSeen = new Map<string, number>();
  for (const t of transfers) {
    const ms = toMs(t.time);
    if (!ms) continue;
    const to = t.to.toLowerCase();
    if (SYSTEM.has(to)) continue;
    const prev = firstSeen.get(to);
    if (prev === undefined || ms < prev) firstSeen.set(to, ms);
  }
  const days = rangeDays(transfers, range);
  const todayStart = startOfDay(Date.now());
  const windowStart = todayStart - (days - 1) * DAY_MS;
  const added = new Array<number>(days).fill(0);
  let base = 0;
  for (const ms of firstSeen.values()) {
    const d = startOfDay(ms);
    if (d < windowStart) base++;
    else {
      const idx = days - 1 - Math.round((todayStart - d) / DAY_MS);
      if (idx >= 0 && idx < days) added[idx]++;
    }
  }
  let cum = base;
  const points: GrowthPoint[] = Array.from({ length: days }, (_, i) => {
    cum += added[i];
    return { label: dayLabel(windowStart + i * DAY_MS), ms: windowStart + i * DAY_MS, added: added[i], cumulative: cum };
  });
  return { points, addedInRange: added.reduce((a, b) => a + b, 0) };
}

// ── KPI strip (value + Δ% vs the previous equal window + sparkline) ─────────────
export type KpiFormat = "int" | "num0" | "pct";
export interface Kpi { key: string; label: string; value: number; format: KpiFormat; sub: string; deltaPct: number | null; spark: number[]; }
const deltaPct = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

export function buildKpis(snap: EconomySnapshot, range: RangeKey): Kpi[] {
  const { transfers, holders, supply, collateral } = snap;
  const days = rangeDays(transfers, range);
  const todayStart = startOfDay(Date.now());
  const curStart = todayStart - (days - 1) * DAY_MS;
  const curEnd = todayStart + DAY_MS;
  const prevStart = curStart - days * DAY_MS;

  // single pass: current-window daily sparks + current/previous window aggregates
  const vSpark = new Array<number>(days).fill(0), tSpark = new Array<number>(days).fill(0), mSpark = new Array<number>(days).fill(0);
  const aSpark: Set<string>[] = Array.from({ length: days }, () => new Set<string>());
  let curVol = 0, curTx = 0, curMint = 0, prevVol = 0, prevTx = 0, prevMint = 0;
  const curActive = new Set<string>(), prevActive = new Set<string>();
  const firstSeen = new Map<string, number>();
  for (const t of transfers) {
    const ms = toMs(t.time);
    if (!ms) continue;
    const f = t.from.toLowerCase(), to = t.to.toLowerCase();
    if (!SYSTEM.has(to)) { const p = firstSeen.get(to); if (p === undefined || ms < p) firstSeen.set(to, ms); }
    if (ms >= curStart && ms < curEnd) {
      curVol += t.amount; curTx++;
      if (t.kind === "mint") curMint += t.amount;
      if (!SYSTEM.has(f)) curActive.add(f);
      if (!SYSTEM.has(to)) curActive.add(to);
      const idx = days - 1 - Math.round((todayStart - startOfDay(ms)) / DAY_MS);
      if (idx >= 0 && idx < days) {
        vSpark[idx] += t.amount; tSpark[idx]++;
        if (t.kind === "mint") mSpark[idx] += t.amount;
        if (!SYSTEM.has(f)) aSpark[idx].add(f);
        if (!SYSTEM.has(to)) aSpark[idx].add(to);
      }
    } else if (ms >= prevStart && ms < curStart) {
      prevVol += t.amount; prevTx++;
      if (t.kind === "mint") prevMint += t.amount;
      if (!SYSTEM.has(f)) prevActive.add(f);
      if (!SYSTEM.has(to)) prevActive.add(to);
    }
  }
  let curNew = 0, prevNew = 0;
  for (const ms of firstSeen.values()) {
    if (ms >= curStart && ms < curEnd) curNew++;
    else if (ms >= prevStart && ms < curStart) prevNew++;
  }

  const supplyPts = cumulativeSupplySeries(transfers, supply, range);
  const supplySpark = supplyPts.map((p) => p.supply);
  const growth = newHoldersSeries(transfers, range);
  const backing = supply > 0 ? collateral / supply : 0;

  return [
    { key: "supply", label: "Supply", value: supply, format: "num0", sub: "Röbel Coins in circulation", deltaPct: deltaPct(supply, supplySpark[0] ?? supply), spark: supplySpark },
    { key: "backing", label: "Backing", value: backing * 100, format: "pct", sub: "collateral ÷ supply", deltaPct: null, spark: [] },
    { key: "volume", label: "Volume", value: curVol, format: "num0", sub: "coins moved", deltaPct: deltaPct(curVol, prevVol), spark: vSpark },
    { key: "transfers", label: "Transfers", value: curTx, format: "int", sub: "on-chain events", deltaPct: deltaPct(curTx, prevTx), spark: tSpark },
    { key: "active", label: "Active", value: curActive.size, format: "int", sub: "wallets moving coins", deltaPct: deltaPct(curActive.size, prevActive.size), spark: aSpark.map((s) => s.size) },
    { key: "holders", label: "Holders", value: holders.length, format: "int", sub: "hold Röbel Coins", deltaPct: deltaPct(holders.length, Math.max(0, holders.length - curNew)), spark: growth.points.map((p) => p.cumulative) },
    { key: "mints", label: "Mints", value: curMint, format: "num0", sub: "new coins minted", deltaPct: deltaPct(curMint, prevMint), spark: mSpark },
    { key: "newHolders", label: "New holders", value: curNew, format: "int", sub: "joined this period", deltaPct: deltaPct(curNew, prevNew), spark: growth.points.map((p) => p.added) },
  ];
}

/** Transfers within the selected range (for range-aware composition). */
export function transfersInRange(transfers: Transfer[], range: RangeKey): Transfer[] {
  if (range === "all") return transfers;
  const cutoff = startOfDay(Date.now()) - (RANGE_DAYS[range] - 1) * DAY_MS;
  return transfers.filter((t) => toMs(t.time) >= cutoff);
}

/** Reputation leaderboard computed from the snapshot — no extra RPC. */
export function reputationFrom(snap: EconomySnapshot): RepNode[] {
  const { holders, transfers, verified } = snap;
  const map = new Map<string, RepNode>();
  const get = (addr: string) => {
    const k = addr.toLowerCase();
    if (!map.has(k)) map.set(k, { address: k, held: 0, inCount: 0, outCount: 0, score: 0, verified: verified.has(k) });
    return map.get(k)!;
  };
  for (const h of holders) get(h.address).held = h.balance;
  for (const t of transfers) {
    if (t.from && t.from.toLowerCase() !== ZERO) get(t.from).outCount++;
    if (t.to) get(t.to).inCount++;
  }
  for (const n of map.values()) n.score = n.held + n.inCount * 0.5 + n.outCount * 0.25;
  return [...map.values()]
    .filter((n) => !SYSTEM.has(n.address) && (n.held > 0 || n.inCount || n.outCount))
    .sort((a, b) => b.score - a.score);
}
