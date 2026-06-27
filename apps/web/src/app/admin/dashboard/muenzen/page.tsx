"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins, ShieldCheck, Users, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { useMuenzen } from "@/components/admin/muenzen/data";
import { fmt, fmtRcrc, fmtEuro, fmtPercent } from "@/components/admin/muenzen/format";
import {
  PageHeader,
  KpiCard,
  ChartCard,
  AlertBanner,
  ErrorState,
  SkeletonGrid,
  EmptyHint,
  IdentityCell,
} from "@/components/admin/muenzen/ui";
import { FLOW_COLORS } from "@/lib/muenzen/constants";

interface FlowTotals {
  mint: number;
  earn: number;
  spend: number;
  peer: number;
}
interface OverviewData {
  supply: number;
  onchainTotalSupply: number | null;
  holders: number;
  citizens: { trusted: number; joined: number };
  collateral: { collateral: number; supply: number; ratio: number };
  funder: { rcrc: number };
  safe: { rcrc: number; xdai: number; eure: number; euro: number };
  totals: { "24h": FlowTotals; "7d": FlowTotals; "30d": FlowTotals; all: FlowTotals };
  series: { date: string; mint: number; earn: number; spend: number; supply: number }[];
  topHolders: { address: string; rcrc: number }[];
  alerts: { level: "warning" | "info"; key: string; message: string }[];
  generatedAt: number;
}

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  fontSize: 12,
};

export default function MuenzenOverviewPage() {
  const { data, loading, error, refresh, refreshing } = useMuenzen<OverviewData>("overview");

  return (
    <div>
      <PageHeader
        title="Röbel Münzen — Übersicht"
        description="Die lokale Circles-v2-Ökonomie auf einen Blick: Umlauf, Deckung, Bürgerbeteiligung und der geschlossene Verdienen-↔-Ausgeben-Kreislauf."
        generatedAt={data?.generatedAt}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      {error && <ErrorState error={error} onRetry={refresh} />}

      {loading && !data ? (
        <div className="space-y-6">
          <SkeletonGrid count={8} />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <AlertBanner alerts={data.alerts} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Umlauf"
              value={fmtRcrc(data.supply)}
              sub={data.onchainTotalSupply != null ? `On-chain: ${fmt(data.onchainTotalSupply)}` : undefined}
              tone="primary"
              icon={<Coins className="h-5 w-5" />}
            />
            <KpiCard
              label="Deckung"
              value={fmtPercent(data.collateral.ratio)}
              sub={`${fmt(data.collateral.collateral)} CRC Sicherheiten`}
              tone={
                data.collateral.supply === 0
                  ? "muted"
                  : Math.abs(data.collateral.ratio - 1) <= 0.02
                    ? "success"
                    : "warning"
              }
              icon={<ShieldCheck className="h-5 w-5" />}
            />
            <KpiCard
              label="Bürger:innen aktiv"
              value={`${data.citizens.joined} / ${data.citizens.trusted}`}
              sub="geprägt / berechtigt (Gate)"
              tone="primary"
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              label="Halter gesamt"
              value={fmt(data.holders, 0)}
              sub="Adressen mit RCRC-Guthaben"
              tone="info"
              icon={<Wallet className="h-5 w-5" />}
            />
            <KpiCard
              label="Funder (Betriebskasse)"
              value={fmtRcrc(data.funder.rcrc)}
              sub="zahlt Belohnungen aus"
              tone={data.funder.rcrc < 5 ? "warning" : "success"}
              icon={<Wallet className="h-5 w-5" />}
            />
            <KpiCard
              label="Stadtkasse-Reserve"
              value={fmtEuro(data.safe.euro)}
              sub={`${fmt(data.safe.xdai)} xDAI · ${fmt(data.safe.eure)} EURe`}
              tone="primary"
            />
            <KpiCard
              label="Verdient (30 T.)"
              value={fmtRcrc(data.totals["30d"].earn)}
              sub="Belohnungen an Bürger:innen"
              tone="success"
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <KpiCard
              label="Ausgegeben (30 T.)"
              value={fmtRcrc(data.totals["30d"].spend)}
              sub="Lootbox-Käufe → Funder"
              tone="danger"
              icon={<TrendingDown className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Ausgegebene Münzen (kumuliert)"
              subtitle="Geprägter Umlauf über die letzten 90 Tage"
            >
              {data.series.length === 0 ? (
                <EmptyHint>Noch keine Prägungen erfasst.</EmptyHint>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="supplyFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00498B" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#00498B" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="supply" name="Umlauf (RCRC)" stroke="#00498B" strokeWidth={2} fill="url(#supplyFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Verdienen ↔ Ausgeben"
              subtitle="Der geschlossene Kreislauf: Belohnungen raus, Lootbox-Käufe zurück"
            >
              {data.series.length === 0 ? (
                <EmptyHint>Noch keine Bewegungen im Belohnungs-/Senken-Kreislauf.</EmptyHint>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={FLOW_COLORS.earn} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={FLOW_COLORS.earn} stopOpacity={0.03} />
                        </linearGradient>
                        <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={FLOW_COLORS.spend} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={FLOW_COLORS.spend} stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="earn" name="Verdient" stroke={FLOW_COLORS.earn} strokeWidth={2} fill="url(#earnFill)" />
                      <Area type="monotone" dataKey="spend" name="Ausgegeben" stroke={FLOW_COLORS.spend} strokeWidth={2} fill="url(#spendFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Größte Halter" subtitle="Adressen mit dem höchsten RCRC-Guthaben">
            {data.topHolders.length === 0 ? (
              <EmptyHint>Noch keine Halter.</EmptyHint>
            ) : (
              <div className="divide-y divide-border">
                {data.topHolders.map((h, i) => (
                  <div key={h.address} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                      <IdentityCell address={h.address} />
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{fmtRcrc(h.rcrc)}</span>
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
