"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMuenzen } from "@/components/admin/muenzen/data";
import { fmtRcrc, fmtDateTime } from "@/components/admin/muenzen/format";
import {
  PageHeader,
  KpiCard,
  ChartCard,
  ErrorState,
  SkeletonGrid,
  EmptyHint,
  Pill,
  IdentityCell,
} from "@/components/admin/muenzen/ui";
import { FlowDiagram, type FlowTotals } from "@/components/admin/muenzen/FlowDiagram";
import { FLOW_COLORS } from "@/lib/muenzen/constants";
import { cn } from "@/lib/utils";

interface FlowData {
  range: string;
  totals: FlowTotals;
  series: { date: string; mint: number; earn: number; spend: number }[];
  diagram: FlowTotals;
  recent: {
    id: string;
    kind: "mint" | "earn" | "spend" | "topup" | "peer";
    from: string;
    to: string;
    fromName: string | null;
    toName: string | null;
    value: number;
    timestamp: number;
    txHash: string;
  }[];
  generatedAt: number;
}

const RANGES = [
  { key: "7d", label: "7 T." },
  { key: "30d", label: "30 T." },
  { key: "90d", label: "90 T." },
  { key: "all", label: "Alle" },
];

const KIND: Record<string, { label: string; tone: "info" | "success" | "danger" | "primary" | "muted" }> = {
  mint: { label: "Prägung", tone: "info" },
  earn: { label: "Belohnung", tone: "success" },
  spend: { label: "Kauf", tone: "danger" },
  topup: { label: "Auffüllung", tone: "primary" },
  peer: { label: "Transfer", tone: "muted" },
};

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  fontSize: 12,
};

export default function GeldflussPage() {
  const [range, setRange] = useState("30d");
  const { data, loading, error, refresh, refreshing } = useMuenzen<FlowData>(`flow?range=${range}`);

  return (
    <div>
      <PageHeader
        title="Geldfluss"
        description="Wie Röbel Münzen durch die Ökonomie fließen — Prägung, Belohnungen aus dem Funder, Lootbox-Käufe zurück in den Funder (der geschlossene Kreislauf)."
        generatedAt={data?.generatedAt}
        onRefresh={refresh}
        refreshing={refreshing}
      >
        <div className="flex rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                range === r.key ? "bg-[#194383] text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorState error={error} onRetry={refresh} />}

      {loading && !data ? (
        <SkeletonGrid count={4} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Geprägt" value={fmtRcrc(data.totals.mint)} tone="info" />
            <KpiCard label="Belohnungen ausgezahlt" value={fmtRcrc(data.totals.earn)} tone="success" />
            <KpiCard label="Ausgegeben (Senken)" value={fmtRcrc(data.totals.spend)} tone="danger" />
            <KpiCard label="Funder aufgefüllt" value={fmtRcrc(data.totals.topup)} tone="primary" />
          </div>

          <ChartCard
            title="Ökonomie-Kreislauf"
            subtitle="Stadtkasse → Funder → Bürger:innen → Lootboxen → Funder · Kantenbeschriftung = Volumen im Zeitraum"
          >
            <FlowDiagram totals={data.diagram} />
          </ChartCard>

          <ChartCard title="Bewegungen über Zeit" subtitle="Tägliches Volumen nach Art">
            {data.series.length === 0 ? (
              <EmptyHint>Noch keine Bewegungen im gewählten Zeitraum.</EmptyHint>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gMint" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={FLOW_COLORS.mint} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={FLOW_COLORS.mint} stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gEarn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={FLOW_COLORS.earn} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={FLOW_COLORS.earn} stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={FLOW_COLORS.spend} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={FLOW_COLORS.spend} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="mint" name="Prägung" stroke={FLOW_COLORS.mint} strokeWidth={2} fill="url(#gMint)" />
                    <Area type="monotone" dataKey="earn" name="Belohnungen" stroke={FLOW_COLORS.earn} strokeWidth={2} fill="url(#gEarn)" />
                    <Area type="monotone" dataKey="spend" name="Ausgegeben" stroke={FLOW_COLORS.spend} strokeWidth={2} fill="url(#gSpend)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Letzte Bewegungen" subtitle="Jüngste On-chain-Transfers der Röbel Münzen">
            {data.recent.length === 0 ? (
              <EmptyHint>Noch keine Transfers im gewählten Zeitraum.</EmptyHint>
            ) : (
              <div className="divide-y divide-border">
                {data.recent.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Pill tone={KIND[t.kind].tone}>{KIND[t.kind].label}</Pill>
                      <div className="hidden min-w-0 items-center gap-2 sm:flex">
                        <IdentityCell address={t.from} name={t.fromName} fallback={t.kind === "mint" ? "Prägung" : "Bürger:in"} />
                        <span className="text-muted-foreground">→</span>
                        <IdentityCell address={t.to} name={t.toName} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{fmtRcrc(t.value)}</p>
                      <p className="text-xs text-muted-foreground">{fmtDateTime(t.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      ) : null}
    </div>
  );
}
