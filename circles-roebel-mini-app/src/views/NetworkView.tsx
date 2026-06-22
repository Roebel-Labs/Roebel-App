// Network of towns — the federation model: a meta-group that trusts verified town
// currencies. Röbel is the one live town today; the rest are placeholders for Stage 2.
import { useEffect, useState } from "react";
import { TOWNS, META_GROUP_LABEL } from "../lib/towns";
import { getVerifiedSet } from "../lib/circlesData";
import { ChartCard, PageHeader, KpiCard, Banner } from "../components/ui";
import { Globe, Sparkles, ShieldCheck } from "../components/icons";
import RadialGraph, { type RadialNode } from "../components/RadialGraph";
import roebelLogo from "../assets/roebel-logo.png";

export default function NetworkView() {
  const [verified, setVerified] = useState<number | null>(null);
  useEffect(() => {
    getVerifiedSet()
      .then((s) => setVerified(s.size))
      .catch(() => setVerified(0));
  }, []);

  const live = TOWNS.filter((t) => t.real).length;
  const planned = TOWNS.length - live;

  const nodes: RadialNode[] = TOWNS.map((t) => ({
    id: t.id,
    address: t.group,
    label: t.name,
    name: t.name,
    imageUrl: t.real ? roebelLogo : null,
    tone: t.real ? "real" : "placeholder",
    dashed: !t.real,
    sub: t.real ? (verified == null ? "" : `${verified} verified`) : "soon",
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Network of towns"
        description="From a town's money to a network of towns — a meta-group that trusts verified town currencies. Acceptance federates; minting stays local."
      />

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Live" value={live} sub="town" tone="primary" icon={<Globe className="h-5 w-5" />} />
        <KpiCard label="Planned" value={planned} sub="towns" tone="muted" icon={<Sparkles className="h-5 w-5" />} />
        <KpiCard label="Verified" value={verified == null ? "…" : verified} sub="in Röbel" tone="success" icon={<ShieldCheck className="h-5 w-5" />} />
      </div>

      <ChartCard title="Federation map" subtitle="Verified Towns meta-group → town currencies">
        <RadialGraph center={{ label: META_GROUP_LABEL, sub: "meta-group" }} nodes={nodes} />
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-[#194383]" /> Live town
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-neutral-300 bg-neutral-50" /> Planned
          </span>
        </div>
      </ChartCard>

      <Banner kind="info">
        Röbel is the one live town today (navy). Dashed nodes are placeholders for future towns running the verified-citizen
        stack — each keeps its own supply and citizen gate. Real towns appear here automatically as they launch.
      </Banner>
    </div>
  );
}
