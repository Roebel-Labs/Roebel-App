"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins, ShoppingCart, KeyRound, UserPlus } from "lucide-react";
import { useMuenzen } from "@/components/admin/muenzen/data";
import { fmt, fmtRcrc, fmtDateTime } from "@/components/admin/muenzen/format";
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
import { RewardConfigEditor, type ConfigRow } from "@/components/admin/muenzen/RewardConfigEditor";
import { LootboxManager, type LootboxRow } from "@/components/admin/muenzen/LootboxManager";
import { EventManager, type EventRow } from "@/components/admin/muenzen/EventManager";
import { InviteTool } from "@/components/admin/muenzen/InviteTool";
import { ACTION_COLORS, FLOW_COLORS } from "@/lib/muenzen/constants";

interface RewardsData {
  config: ConfigRow[];
  earn: {
    byAction: { action: string; label: string; count: number; rcrc: number }[];
    byStatus: { status: string; count: number }[];
    daily: { date: string; rcrc: number; count: number }[];
    errored: { id: string; wallet: string; name: string | null; action: string; error: string | null; createdAt: number | null }[];
    topEarners: { address: string; name: string | null; rcrc: number; count: number }[];
    totalPaid: number;
    claimCount: number;
  };
  spend: {
    daily: { date: string; rcrc: number; count: number }[];
    chargesByStatus: { status: string; count: number }[];
    totalRevenue: number;
    settledCount: number;
  };
  lootboxes: LootboxRow[];
  events: EventRow[];
  referral: { redemptions: number; referrers: number; awardedReferrer: number; awardedReferred: number };
  generatedAt: number;
}

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  fontSize: 12,
};
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "muted"> = {
  paid: "success",
  pending: "warning",
  rejected: "muted",
  failed: "danger",
  settled: "success",
};

export default function BelohnungenPage() {
  const { data, loading, error, refresh, refreshing } = useMuenzen<RewardsData>("rewards");

  const keysOutstanding = data?.lootboxes.reduce((s, l) => s + l.keysOutstanding, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Belohnungen & Senken"
        description="Die Verdienen-Schiene (claim-reward) und die Ausgeben-Schiene (Lootboxen) — Auszahlungs-Analytik plus die operative Steuerung: Belohnungssätze, Events, Lootboxen und Einladungen."
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
            <KpiCard label="Ausgezahlt gesamt" value={fmtRcrc(data.earn.totalPaid)} sub={`${data.earn.claimCount} Claims`} tone="success" icon={<Coins className="h-5 w-5" />} />
            <KpiCard label="Lootbox-Erlös" value={fmtRcrc(data.spend.totalRevenue)} sub={`${data.spend.settledCount} Käufe`} tone="danger" icon={<ShoppingCart className="h-5 w-5" />} />
            <KpiCard label="Offene Schlüssel" value={fmt(keysOutstanding, 0)} sub={`${data.lootboxes.length} Lootboxen`} tone="info" icon={<KeyRound className="h-5 w-5" />} />
            <KpiCard label="Einladungen eingelöst" value={fmt(data.referral.redemptions, 0)} sub={`${data.referral.referrers} Werber:innen`} tone="primary" icon={<UserPlus className="h-5 w-5" />} />
          </div>

          {/* Earn analytics */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Belohnungen nach Aktion" subtitle="Ausgezahlte RCRC je Aktionstyp">
              {data.earn.byAction.length === 0 ? (
                <EmptyHint>Noch keine ausgezahlten Belohnungen.</EmptyHint>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.earn.byAction} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                      <Bar dataKey="rcrc" name="RCRC" radius={[4, 4, 0, 0]}>
                        {data.earn.byAction.map((d) => (
                          <Cell key={d.action} fill={ACTION_COLORS[d.action] ?? "#194383"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {data.earn.byStatus.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.earn.byStatus.map((s) => (
                    <Pill key={s.status} tone={STATUS_TONE[s.status] ?? "muted"}>
                      {s.status}: {s.count}
                    </Pill>
                  ))}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Auszahlungen über Zeit" subtitle="Tägliche ausgezahlte RCRC">
              {data.earn.daily.length === 0 ? (
                <EmptyHint>Noch keine Auszahlungs-Historie.</EmptyHint>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.earn.daily} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="earnDaily" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={FLOW_COLORS.earn} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={FLOW_COLORS.earn} stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="rcrc" name="RCRC" stroke={FLOW_COLORS.earn} strokeWidth={2} fill="url(#earnDaily)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          {(data.earn.topEarners.length > 0 || data.earn.errored.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.earn.topEarners.length > 0 && (
                <ChartCard title="Top-Verdiener:innen" subtitle="Meiste verdiente Röbel Münzen">
                  <div className="divide-y divide-border">
                    {data.earn.topEarners.map((t, i) => (
                      <div key={t.address} className="flex items-center justify-between gap-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                          <IdentityCell address={t.address} name={t.name} />
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{fmtRcrc(t.rcrc)}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}
              {data.earn.errored.length > 0 && (
                <ChartCard title="Fehlgeschlagene Auszahlungen" subtitle="Claims mit Status „failed“ — prüfen">
                  <div className="divide-y divide-border">
                    {data.earn.errored.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <IdentityCell address={e.wallet} name={e.name} />
                          <p className="mt-0.5 text-xs text-red-600">{e.action}: {e.error}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}
            </div>
          )}

          {/* Operational console */}
          <ChartCard title="Belohnungssätze" subtitle="Beträge, Tageslimits und Cooldowns — direkt anpassbar (kein Deploy nötig)">
            <RewardConfigEditor rows={data.config} onChanged={refresh} />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Lootboxen verwalten" subtitle="Die Senke: RCRC-Preis, Veröffentlichung und Verkäufe">
              <LootboxManager rows={data.lootboxes} onChanged={refresh} />
            </ChartCard>
            <ChartCard title="Events verwalten" subtitle="reward_events-Registry für Smart-Event-QR & event_attend">
              <EventManager rows={data.events} onChanged={refresh} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Einladungs-Trichter" subtitle="referral_redemptions" className="lg:col-span-1">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Eingelöst</dt><dd className="font-semibold tabular-nums">{data.referral.redemptions}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Werber:innen</dt><dd className="font-semibold tabular-nums">{data.referral.referrers}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Punkte an Werber</dt><dd className="font-semibold tabular-nums">{fmt(data.referral.awardedReferrer, 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Punkte an Eingeladene</dt><dd className="font-semibold tabular-nums">{fmt(data.referral.awardedReferred, 0)}</dd></div>
              </dl>
            </ChartCard>
            <ChartCard title="Bürger:in einladen (Circles)" subtitle="Operator-Onboarding auslösen" className="lg:col-span-2">
              <InviteTool />
            </ChartCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
