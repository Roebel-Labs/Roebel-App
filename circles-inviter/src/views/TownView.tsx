import { useCallback, useEffect, useState } from "react";
import { getVerifiedSet, getTownStats, getTrustGraph, type TownStats, type TrustGraph } from "../lib/circlesData";
import { Stat, Loading } from "../components/ui";
import RadialGraph, { type RadialNode } from "../components/RadialGraph";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">The town's on-chain economy, live.</p>
        <button onClick={load} className="text-xs text-navy hover:underline">Refresh</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Verified citizens"><span className="text-xl font-semibold text-navy tabular-nums">{stats ? `${stats.verified}/${stats.citizens}` : "…"}</span></Stat>
        <Stat label="Röbel Münzen supply"><span className="text-xl font-semibold text-slate-900 tabular-nums">{stats ? fmt(stats.supply) : "…"}</span></Stat>
        <Stat label="Holders"><span className="text-xl font-semibold text-slate-900 tabular-nums">{stats ? stats.holders : "…"}</span></Stat>
        <Stat label="Collateral locked"><span className="text-xl font-semibold text-slate-900 tabular-nums">{stats ? fmt(stats.collateral) : "…"}</span></Stat>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium text-slate-700 mb-1">Trust graph</div>
        <p className="text-xs text-slate-400 mb-2">
          Citizens trusted by the Röbel Münzen group. Green = verified human · navy = attester · gray dashed = not yet
          trusted/verified.
        </p>
        {loading && !graph ? (
          <Loading />
        ) : (
          <RadialGraph
            center={{ label: graph?.centerLabel ?? "Röbel Münzen", sub: stats ? `${stats.verified} verified` : undefined }}
            nodes={nodes}
            emptyLabel="no citizens yet"
          />
        )}
      </div>
    </div>
  );
}
