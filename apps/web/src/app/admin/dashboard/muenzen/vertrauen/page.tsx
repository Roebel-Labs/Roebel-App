"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Network, Users, UserCheck, ShieldCheck } from "lucide-react";
import { useMuenzen } from "@/components/admin/muenzen/data";
import { fmt } from "@/components/admin/muenzen/format";
import {
  PageHeader,
  KpiCard,
  ChartCard,
  ErrorState,
  SkeletonGrid,
  EmptyHint,
  IdentityCell,
} from "@/components/admin/muenzen/ui";
import { TrustGraph, type GraphNode, type GraphEdge } from "@/components/admin/muenzen/TrustGraph";
import { REPUTATION_WEIGHTS } from "@/lib/muenzen/reputation";

interface LeaderRow {
  address: string;
  name: string | null;
  avatarUrl: string | null;
  score: number;
  parts: { trust: number; attendance: number; civic: number; economic: number };
  trustIn: number;
  attendance: number;
  civic: number;
  economic: number;
  rcrc: number;
}
interface TrustData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  leaderboard: LeaderRow[];
  distribution: { bucket: string; count: number }[];
  stats: {
    nodes: number;
    edges: number;
    citizensTrusted: number;
    citizensJoined: number;
    attesters: number;
  };
  generatedAt: number;
}

const PART_COLORS = {
  trust: "#00498B",
  attendance: "#f59e0b",
  civic: "#16a34a",
  economic: "#8b5cf6",
} as const;
const PART_LABELS = {
  trust: "Vertrauen",
  attendance: "Teilnahme",
  civic: "Bürger-Aktivität",
  economic: "Wirtschaft",
} as const;

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  fontSize: 12,
};

function ScoreBar({ parts }: { parts: LeaderRow["parts"] }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {(Object.keys(parts) as (keyof typeof parts)[]).map((k) =>
        parts[k] > 0 ? (
          <div key={k} style={{ width: `${parts[k]}%`, background: PART_COLORS[k] }} title={`${PART_LABELS[k]}: ${parts[k].toFixed(0)}`} />
        ) : null,
      )}
    </div>
  );
}

export default function VertrauenPage() {
  const { data, loading, error, refresh, refreshing } = useMuenzen<TrustData>("trust");

  return (
    <div>
      <PageHeader
        title="Vertrauen & Reputation"
        description="Das Röbel-Netz aus Circles-Vertrauen plus eine zusammengesetzte Bürger-Reputation aus Vertrauensgrad, Event-Teilnahme, bürgerlicher Aktivität und wirtschaftlichem Fußabdruck."
        generatedAt={data?.generatedAt}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      {error && <ErrorState error={error} onRetry={refresh} />}

      {loading && !data ? (
        <SkeletonGrid count={4} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Knoten im Netz" value={fmt(data.stats.nodes, 0)} tone="primary" icon={<Network className="h-5 w-5" />} />
            <KpiCard label="Vertrauenskanten" value={fmt(data.stats.edges, 0)} tone="info" />
            <KpiCard
              label="Bürger:innen aktiv"
              value={`${data.stats.citizensJoined} / ${data.stats.citizensTrusted}`}
              sub="geprägt / berechtigt"
              tone="success"
              icon={<UserCheck className="h-5 w-5" />}
            />
            <KpiCard label="Attester" value={fmt(data.stats.attesters, 0)} tone="warning" icon={<ShieldCheck className="h-5 w-5" />} />
          </div>

          <ChartCard
            title="Web-of-Trust"
            subtitle="Gruppe im Zentrum · Bürger:innen (Gate) · Halter · Knotengröße = Reputation"
          >
            <TrustGraph nodes={data.nodes} edges={data.edges} />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title="Reputations-Rangliste"
              subtitle={`Gewichtung: Vertrauen ${REPUTATION_WEIGHTS.trust * 100}% · Teilnahme ${REPUTATION_WEIGHTS.attendance * 100}% · Aktivität ${REPUTATION_WEIGHTS.civic * 100}% · Wirtschaft ${REPUTATION_WEIGHTS.economic * 100}%`}
              className="lg:col-span-2"
            >
              {data.leaderboard.length === 0 ? (
                <EmptyHint>Noch keine Reputationsdaten.</EmptyHint>
              ) : (
                <div className="space-y-3">
                  {data.leaderboard.map((r, i) => (
                    <div key={r.address} className="flex items-center gap-3">
                      <span className="w-5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                      <div className="w-48 shrink-0">
                        <IdentityCell address={r.address} name={r.name} avatarUrl={r.avatarUrl} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <ScoreBar parts={r.parts} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.trustIn} Vertrauen · {r.attendance} Events · {r.civic} Aktionen · {fmt(r.economic)} RCRC bewegt
                        </p>
                      </div>
                      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {r.score.toFixed(0)}
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                    {(Object.keys(PART_LABELS) as (keyof typeof PART_LABELS)[]).map((k) => (
                      <span key={k} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PART_COLORS[k] }} />
                        {PART_LABELS[k]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Verteilung" subtitle="Anzahl Halter je Reputations-Spanne">
              {data.distribution.every((d) => d.count === 0) ? (
                <EmptyHint>Noch keine Verteilung.</EmptyHint>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.distribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="bucket" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                      <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                      <Bar dataKey="count" name="Halter" fill="#00498B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
