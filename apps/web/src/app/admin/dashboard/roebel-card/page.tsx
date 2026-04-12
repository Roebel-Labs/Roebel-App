import Link from "next/link";
import {
  getRoebelCardOverviewStats,
  listRoebelCardPurchases,
  listVereineContributions,
} from "@/app/actions/roebel-card-admin";
import { formatEuros } from "@/lib/format-euros";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  TrendingUp,
  Wallet,
  Users,
  Coins,
  Clock,
} from "lucide-react";
import { BuyerCell } from "./_components/buyer-cell";
import { StatusBadge } from "./_components/status-badge";

export const dynamic = "force-dynamic";

export default async function RoebelCardOverviewPage() {
  const [stats, latestResult, contributions] = await Promise.all([
    getRoebelCardOverviewStats(),
    // Show the 10 newest purchases regardless of status so pending rows
    // are visible as soon as they're created.
    listRoebelCardPurchases({}, 1, 10),
    listVereineContributions(),
  ]);

  const topVereine = [...contributions]
    .sort(
      (a, b) =>
        b.pending_amount_cents +
        b.paid_amount_cents -
        (a.pending_amount_cents + a.paid_amount_cents),
    )
    .slice(0, 5);

  const pendingTotalCents =
    stats.pendingFaceValueCents + stats.pendingFeeVolumeCents;

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Bruttoumsatz"
          value={formatEuros(stats.grossVolumeCents)}
          sub={`${stats.purchaseCount} Käufe`}
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Ausstehend"
          value={formatEuros(pendingTotalCents)}
          sub={`${stats.pendingCount} offene Käufe`}
          accent="pending"
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Offene Guthaben"
          value={formatEuros(stats.outstandingCardBalanceCents)}
          sub="auf allen Karten"
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Vereine erhalten"
          value={formatEuros(stats.vereineCreditedCents)}
          sub="gesamte Förderanteile"
        />
        <KpiCard
          icon={<Coins className="h-4 w-4" />}
          label="Röbeler Topf"
          value={formatEuros(stats.roebelerTopfBalanceCents)}
          sub="gemeinsamer Fund"
        />
      </div>

      {/* Latest transactions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Letzte Transaktionen</h2>
          <Link
            href="/admin/dashboard/roebel-card/purchases"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Alle ansehen <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left font-medium px-4 py-2">Datum</th>
                <th className="text-left font-medium px-4 py-2">Käufer</th>
                <th className="text-right font-medium px-4 py-2">Betrag</th>
                <th className="text-right font-medium px-4 py-2">Gebühr</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-left font-medium px-4 py-2">
                  Begünstigter
                </th>
              </tr>
            </thead>
            <tbody>
              {latestResult.purchases.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Noch keine Käufe
                  </td>
                </tr>
              ) : (
                latestResult.purchases.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {formatDate(p.paid_at ?? p.created_at)}
                    </td>
                    <td className="px-4 py-2">
                      <BuyerCell
                        walletAddress={p.purchaser_wallet_address}
                        username={p.purchaser_username}
                        avatarUrl={p.purchaser_avatar_url}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatEuros(p.amount_cents)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatEuros(p.fee_cents)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2">
                      {p.beneficiary_name ?? (
                        <Badge variant="secondary">Röbeler Topf</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top vereine */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Top Vereine</h2>
          <Link
            href="/admin/dashboard/roebel-card/vereine"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Alle ansehen <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          {topVereine.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">
              Noch keine Verein-Förderungen
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {topVereine.map((c) => (
                <li
                  key={c.id}
                  className="px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-sm">{c.account_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Ausstehend {formatEuros(c.pending_amount_cents)} ·
                      ausgezahlt {formatEuros(c.paid_amount_cents)}
                    </div>
                  </div>
                  <div className="text-right font-semibold text-sm">
                    {formatEuros(
                      c.pending_amount_cents + c.paid_amount_cents,
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: "pending";
}) {
  const labelClass =
    accent === "pending"
      ? "flex items-center gap-2 text-xs uppercase tracking-wider mb-2 text-amber-700 dark:text-amber-400"
      : "flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-2";
  return (
    <div className="bg-card border border-border rounded-[10px] p-4">
      <div className={labelClass}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
