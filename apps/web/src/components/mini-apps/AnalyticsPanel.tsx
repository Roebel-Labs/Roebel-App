"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Eye, Users, Repeat, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KpiCard, ChartCard, EmptyHint } from "./ui";
import { useMiniAppApi, type AnalyticsSummary } from "./client";
import type { AnalyticsRange } from "@/lib/miniapp/types";

const RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: "7d", label: "7 T" },
  { key: "30d", label: "30 T" },
  { key: "90d", label: "90 T" },
  { key: "all", label: "Alle" },
];

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  fontSize: 12,
};

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/**
 * Analytics dashboard for one app (`appId`) or the whole platform (`'all'`).
 * When `wallet` is passed it is sent as `x-wallet-address` so a developer can
 * read their own app's numbers without an admin session.
 */
export function AnalyticsPanel({
  appId,
  wallet,
}: {
  appId: string;
  wallet?: string;
}) {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const { data, loading, error } = useMiniAppApi<AnalyticsSummary>(
    `analytics?appId=${encodeURIComponent(appId)}&range=${range}`,
    wallet,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Nutzung</h2>
        <div className="inline-flex items-center gap-1 rounded-md bg-muted p-0.5">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              variant="ghost"
              size="sm"
              onClick={() => setRange(r.key)}
              className={cn(
                "h-7 px-3 text-xs",
                range === r.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
              )}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[10px] border border-border bg-muted/40" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Öffnungen"
              value={nf.format(data.opens)}
              tone="primary"
              icon={<Eye className="h-5 w-5" />}
            />
            <KpiCard
              label="Aktive Wallets"
              value={nf.format(data.uniqueWallets)}
              sub={`${nf.format(data.events)} Events`}
              tone="info"
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              label="Wiederkehrer"
              value={`${(data.retentionRate * 100).toFixed(0)} %`}
              sub={`${nf.format(data.returningWallets)} Wallets`}
              tone="success"
              icon={<Repeat className="h-5 w-5" />}
            />
            <KpiCard
              label="Belohnungen"
              value={`${nf.format(data.rewardsAmount)} RÖ`}
              sub={
                data.budget != null
                  ? `${nf.format(data.spent ?? 0)} / ${nf.format(data.budget)} Budget`
                  : `${nf.format(data.rewardsGranted)} vergeben`
              }
              tone="primary"
              icon={<Coins className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Öffnungen & aktive Wallets" subtitle="Tägliche Nutzung im Zeitraum">
              {data.series.length === 0 ? (
                <EmptyHint>Noch keine Nutzungsdaten.</EmptyHint>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="opensFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00498B" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#00498B" stopOpacity={0.03} />
                        </linearGradient>
                        <linearGradient id="walletsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} minTickGap={24} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="opens" name="Öffnungen" stroke="#00498B" strokeWidth={2} fill="url(#opensFill)" />
                      <Area type="monotone" dataKey="uniqueWallets" name="Aktive Wallets" stroke="#0ea5e9" strokeWidth={2} fill="url(#walletsFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Top-Events" subtitle="Häufigste Aktionen">
              {data.topEvents.length === 0 ? (
                <EmptyHint>Noch keine Events.</EmptyHint>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topEvents}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="event"
                        tick={axisTick}
                        tickLine={false}
                        axisLine={false}
                        width={100}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Anzahl" fill="#00498B" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
