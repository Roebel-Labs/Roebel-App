// Town overview — the town's on-chain Röbel Coin economy at a glance: KPIs, collateral
// backing gauge, citizen verification progress, and the group → citizens trust graph.
import { useCallback, useEffect, useState } from "react";
import { getVerifiedSet, getTownStats, getTrustGraph, type TownStats, type TrustGraph } from "../lib/circlesData";
import { fmt, fmtInt, pct } from "../lib/format";
import { ChartCard, PageHeader, KpiCard, SkeletonGrid, Skeleton, ScoreBar } from "../components/ui";
import { Donut } from "../components/charts";
import { Coins, ShieldCheck, Users, Lock } from "../components/icons";
import RadialGraph, { type RadialNode } from "../components/RadialGraph";

export default function TownView() {
  const [stats, setStats] = useState<TownStats | null>(null);
  const [graph, setGraph] = useState<TrustGraph | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const verified = await getVerifiedSet();
    const [s, g] = await Promise.all([getTownStats(verified.size), getTrustGraph(verified)]);
    setStats(s);
    setGraph(g);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const nodes: RadialNode[] = (graph?.nodes ?? []).map((nd) => ({ id: nd.id, label: nd.label, tone: nd.tone, dashed: !nd.trusted }));
  const backing = stats && stats.supply > 0 ? stats.collateral / stats.supply : 0;
  const verifiedPct = stats && stats.citizens > 0 ? (stats.verified / stats.citizens) * 100 : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Town overview" description="The town's on-chain economy, live from Circles v2 on Gnosis." onRefresh={load} refreshing={loading} />

      {/* KPI grid */}
      {!stats ? (
        <SkeletonGrid count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Verified" value={`${stats.verified}/${stats.citizens}`} sub="citizens" tone="success" icon={<ShieldCheck className="h-5 w-5" />} />
          <KpiCard label="Supply" value={fmt(stats.supply, 0)} sub="Röbel Coins" tone="primary" icon={<Coins className="h-5 w-5" />} />
          <KpiCard label="Holders" value={fmtInt(stats.holders)} sub="wallets" tone="info" icon={<Users className="h-5 w-5" />} />
          <KpiCard label="Collateral" value={fmt(stats.collateral, 0)} sub="personal CRC locked" tone="violet" icon={<Lock className="h-5 w-5" />} />
        </div>
      )}

      {/* Backing + verification */}
      <div className="grid grid-cols-2 gap-3">
        <ChartCard title="Backing" subtitle="Collateral ÷ supply">
          {!stats ? (
            <Skeleton className="h-[132px]" />
          ) : (
            <div className="flex flex-col items-center">
              <Donut value={backing} label={backing >= 1 ? "100%" : pct(backing, 0)} sub="backed" color="#194383" />
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {backing >= 0.999 ? "Every coin is fully backed 1:1." : "Each coin is backed by locked personal CRC."}
              </p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Verification" subtitle="Citizens onboarded">
          {!stats ? (
            <Skeleton className="h-[132px]" />
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              <div>
                <div className="text-3xl font-semibold leading-none tracking-tight text-foreground tnum">{pct(verifiedPct / 100, 0)}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {stats.verified} of {stats.citizens} verified
                </div>
              </div>
              <ScoreBar value={verifiedPct} tone="success" />
              <div className="text-[11px] text-muted-foreground">
                {stats.citizens - stats.verified === 0 ? "All citizens verified 🎉" : `${stats.citizens - stats.verified} still to onboard`}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Trust graph */}
      <ChartCard title="Trust graph" subtitle="Citizens trusted by the Röbel Coin group">
        {loading && !graph ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <RadialGraph
              center={{ label: graph?.centerLabel ?? "Röbel Coins", sub: stats ? `${stats.verified} verified` : undefined }}
              nodes={nodes}
              emptyLabel="no citizens yet"
            />
            <Legend />
          </>
        )}
      </ChartCard>
    </div>
  );
}

function Legend() {
  const items = [
    { c: "#16A34A", l: "Verified human" },
    { c: "#194383", l: "Attester" },
    { c: "#94A3B8", l: "Not yet trusted" },
  ];
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.c }} />
          {i.l}
        </span>
      ))}
    </div>
  );
}
