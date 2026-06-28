// Economy tab — the town's Röbel Coin economy, live from Circles v2 on Gnosis.
// One batched snapshot (getEconomy) feeds an interactive, data-rich dashboard:
// a KPI strip, supply & backing, money flows, composition, holder distribution,
// velocity, reputation, and a flow feed. The range selector recomputes every
// series in memory — no refetch.
import { useEffect, useMemo, useState } from "react";
import {
  getEconomy,
  getProfiles,
  buildKpis,
  cumulativeSupplySeries,
  flowsByDay,
  transfersInRange,
  velocitySeries,
  reputationFrom,
  type EconomySnapshot,
  type RangeKey,
  type Profile,
} from "../lib/circlesData";
import { fmtInt } from "../lib/format";
import { PageHeader, SkeletonGrid, Skeleton } from "../components/ui";
import { RangeSelector } from "./economy/RangeSelector";
import { KpiStrip } from "./economy/KpiStrip";
import { SupplyBackingSection } from "./economy/SupplyBackingSection";
import { MoneyFlowsSection } from "./economy/MoneyFlowsSection";
import { FlowCompositionSection } from "./economy/FlowCompositionSection";
import { HolderDistributionSection } from "./economy/HolderDistributionSection";
import { VelocitySection } from "./economy/VelocitySection";
import { ReputationSection } from "./economy/ReputationSection";
import { FlowFeedSection } from "./economy/FlowFeedSection";

export default function PulseView() {
  const [snap, setSnap] = useState<EconomySnapshot | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setSnap(null);
    setProfiles(new Map());
    const s = await getEconomy();
    setSnap(s);
    setLoading(false);
    // Progressive enhancement: resolve real Circles names + pictures for the
    // leaderboard and the recent feed, then re-render. Best-effort, never blocks.
    const reps = reputationFrom(s).slice(0, 12).map((n) => n.address);
    const recent = s.transfers.slice(0, 40).flatMap((t) => [t.from, t.to]);
    getProfiles([...reps, ...recent]).then(setProfiles).catch(() => {});
  };
  useEffect(() => {
    void load();
  }, []);

  const kpis = useMemo(() => (snap ? buildKpis(snap, range) : []), [snap, range]);
  const supplySeries = useMemo(() => (snap ? cumulativeSupplySeries(snap.transfers, snap.supply, range) : []), [snap, range]);
  const flows = useMemo(() => (snap ? flowsByDay(snap.transfers, range) : []), [snap, range]);
  const inRange = useMemo(() => (snap ? transfersInRange(snap.transfers, range) : []), [snap, range]);
  const vel = useMemo(() => (snap ? velocitySeries(snap.transfers, snap.supply, range) : null), [snap, range]);
  const rep = useMemo(() => (snap ? reputationFrom(snap) : []), [snap]);

  return (
    <div className="space-y-4">
      <PageHeader title="Economy" description="The town's live Röbel Coin economy — on-chain from Circles v2 on Gnosis." onRefresh={load} refreshing={loading} />

      {/* Live status + global range selector */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${snap ? "bg-[#00498B]" : "bg-neutral-300"}`} />
          {snap ? `${fmtInt(snap.transfers.length)} transfers · ${fmtInt(snap.holders.length)} holders` : "Loading on-chain data…"}
        </span>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {snap === null ? (
        <>
          <SkeletonGrid count={8} />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </>
      ) : (
        <>
          <KpiStrip kpis={kpis} />
          <SupplyBackingSection series={supplySeries} supply={snap.supply} collateral={snap.collateral} />
          <MoneyFlowsSection buckets={flows} />
          <FlowCompositionSection transfers={inRange} />
          <HolderDistributionSection holders={snap.holders} />
          {vel && <VelocitySection vel={vel} />}
          <ReputationSection rep={rep} profiles={profiles} />
          <FlowFeedSection transfers={snap.transfers} profiles={profiles} />
        </>
      )}
    </div>
  );
}
