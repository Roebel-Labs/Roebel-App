"use client";

import type { ReactNode } from "react";
import {
  Landmark,
  Flame,
  Vault,
  Bot,
  KeyRound,
  Wallet as WalletIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useMuenzen } from "@/components/admin/muenzen/data";
import { fmt, fmtRcrc, fmtEuro, fmtPercent, timeAgo } from "@/components/admin/muenzen/format";
import {
  PageHeader,
  KpiCard,
  ChartCard,
  ErrorState,
  SkeletonGrid,
  Pill,
  HealthDot,
  AddressTag,
} from "@/components/admin/muenzen/ui";

interface WalletRow {
  key: string;
  address: string;
  label: string;
  role: string;
  kind: "reserve" | "hot" | "vault" | "service" | "operator" | "holder";
  description: string;
  watch: "rcrc" | "personalCrc" | null;
  name: string | null;
  assets: { rcrc: number; personalCrc: number; xdai: number; eure: number };
  euro: number;
  health: { level: "ok" | "warning"; note: string } | null;
  lastActivity: number | null;
}
interface WalletsData {
  wallets: WalletRow[];
  collateral: { collateral: number; supply: number; ratio: number };
  treasury: { reserveEuro: number; funderRcrc: number; totalEuro: number };
  operatorConfigured: boolean;
  generatedAt: number;
}

const KIND_ICON: Record<string, ReactNode> = {
  reserve: <Landmark className="h-5 w-5" />,
  hot: <Flame className="h-5 w-5" />,
  vault: <Vault className="h-5 w-5" />,
  service: <Bot className="h-5 w-5" />,
  operator: <KeyRound className="h-5 w-5" />,
  holder: <WalletIcon className="h-5 w-5" />,
};
const KIND_TONE: Record<string, string> = {
  reserve: "text-[#00498B] bg-[#00498B]/10",
  hot: "text-amber-600 bg-amber-100 dark:bg-amber-950",
  vault: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950",
  service: "text-sky-600 bg-sky-100 dark:bg-sky-950",
  operator: "text-purple-600 bg-purple-100 dark:bg-purple-950",
  holder: "text-slate-600 bg-slate-100 dark:bg-slate-800",
};

function AssetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export default function WalletsPage() {
  const { data, loading, error, refresh, refreshing } = useMuenzen<WalletsData>("wallets");

  return (
    <div>
      <PageHeader
        title="Wallets & Kasse"
        description="Die Wallets hinter der Ökonomie — Multisig-Reserve, heiße Betriebskasse, Sicherheiten-Tresor, Einladungs-Bot und (optional) Operator — mit Live-Guthaben (RCRC, persönliche CRC, xDAI, EURe)."
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
            <KpiCard label="Reserve-Wert" value={fmtEuro(data.treasury.reserveEuro)} sub="Stadtkasse (xDAI + EURe + RCRC)" tone="primary" />
            <KpiCard label="Funder-Float" value={fmtRcrc(data.treasury.funderRcrc)} sub="heiße Betriebskasse" tone={data.treasury.funderRcrc < 5 ? "warning" : "success"} />
            <KpiCard
              label="Deckung"
              value={fmtPercent(data.collateral.ratio)}
              sub={`${fmt(data.collateral.collateral)} / ${fmt(data.collateral.supply)} CRC`}
              tone={data.collateral.supply === 0 ? "muted" : Math.abs(data.collateral.ratio - 1) <= 0.02 ? "success" : "warning"}
            />
            <KpiCard label="Gesamt (alle Wallets)" value={fmtEuro(data.treasury.totalEuro)} sub="indikativer €-Wert" tone="info" />
          </div>

          <ChartCard title="Sicherheiten-Deckung" subtitle="Persönliche CRC im Tresor gegenüber dem RCRC-Umlauf (Ziel: 100 %)">
            <div className="space-y-2">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, data.collateral.ratio * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{fmt(data.collateral.collateral)} CRC Sicherheiten</span>
                <span>{fmtPercent(data.collateral.ratio)}</span>
                <span>{fmt(data.collateral.supply)} RCRC Umlauf</span>
              </div>
            </div>
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.wallets.map((w) => (
              <Card key={w.key} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${KIND_TONE[w.kind]}`}>
                      {KIND_ICON[w.kind]}
                    </span>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{w.label}</p>
                      <p className="text-xs text-muted-foreground">{w.role}</p>
                    </div>
                  </div>
                  {w.health && (
                    <span className="flex shrink-0 items-center gap-1" title={w.health.note}>
                      <HealthDot level={w.health.level} />
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <AssetRow label="Röbel Münzen" value={fmt(w.assets.rcrc)} />
                  <AssetRow label="Pers. CRC" value={fmt(w.assets.personalCrc)} />
                  <AssetRow label="xDAI" value={fmt(w.assets.xdai)} />
                  <AssetRow label="EURe" value={fmt(w.assets.eure)} />
                </div>

                {w.health && (
                  <div className="mt-3">
                    <Pill tone={w.health.level === "ok" ? "success" : "warning"}>{w.health.note}</Pill>
                  </div>
                )}

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{w.description}</p>

                <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>≈ {fmtEuro(w.euro)}</span>
                  <span>{w.lastActivity ? `aktiv ${timeAgo(w.lastActivity)}` : "keine RCRC-Aktivität"}</span>
                  <AddressTag address={w.address} />
                </div>
              </Card>
            ))}
          </div>

          {!data.operatorConfigured && (
            <Card className="border-dashed p-4 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Operator-Wallet nicht konfiguriert.</span>{" "}
                Setze <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">MUENZEN_OPERATOR_ADDRESS</code> in den
                Web-Umgebungsvariablen, um das CRC-Einlade-Budget des Operators (Touristen-/Event-Einladungen) hier zu überwachen.
              </p>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
