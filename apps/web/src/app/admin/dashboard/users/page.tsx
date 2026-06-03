import {
  Activity,
  Coins,
  Clock,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/admin/dao/KpiCard";
import { TierDonut } from "@/components/admin/users/TierDonut";
import { SignupsAreaChart } from "@/components/admin/users/SignupsAreaChart";
import { VerificationFunnel } from "@/components/admin/users/VerificationFunnel";
import { TopUsersBars } from "@/components/admin/users/TopUsersBars";
import { getUsersAdminData } from "@/app/actions/users-admin";
import { UsersTable } from "./_components/users-table";

export const dynamic = "force-dynamic";

const numberFmt = new Intl.NumberFormat("de-DE");

export default async function UsersAdminPage() {
  const result = await getUsersAdminData();

  if (!result.success || !result.rows || !result.metrics) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Nutzer</h1>
          <p className="text-sm text-muted-foreground">
            Übersicht aller App-Nutzer, Verifizierungen und Engagement.
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm text-red-800 dark:text-red-200">
            Nutzerdaten konnten nicht geladen werden:{" "}
            {result.error ?? "Unbekannter Fehler"}
          </p>
        </div>
      </div>
    );
  }

  const { rows, metrics } = result;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Nutzer</h1>
        <p className="text-sm text-muted-foreground">
          Übersicht aller App-Nutzer, Verifizierungen und Engagement.
          E-Mail und Telefon sind aus Datenschutzgründen maskiert.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Nutzer gesamt"
          value={numberFmt.format(metrics.totalUsers)}
          hint="registrierte Accounts"
          icon={Users}
        />
        <KpiCard
          label="Verifizierte Bürger"
          value={numberFmt.format(metrics.verifiedCitizens)}
          hint={`${Math.round(
            (metrics.verifiedCitizens / Math.max(1, metrics.totalUsers)) * 100
          )} % aller Nutzer`}
          icon={ShieldCheck}
        />
        <KpiCard
          label="Offene Verifizierungen"
          value={numberFmt.format(metrics.pendingVerifications)}
          hint="warten auf Prüfung"
          icon={Clock}
        />
        <KpiCard
          label="Neu (30 Tage)"
          value={numberFmt.format(metrics.newLast30Days)}
          hint="neue Registrierungen"
          icon={UserPlus}
        />
        <KpiCard
          label="Aktiv (30 Tage)"
          value={numberFmt.format(metrics.activeLast30Days)}
          hint="zuletzt angemeldet"
          icon={Activity}
        />
        <KpiCard
          label="Punkte im Umlauf"
          value={numberFmt.format(metrics.totalPointsInCirculation)}
          hint="Summe aller Guthaben"
          icon={Coins}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Nutzer nach Stufe</CardTitle>
            <CardDescription>
              Verteilung von Gast, Tourist und Bürger.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TierDonut data={metrics.tierDistribution} />
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle>Registrierungen im Zeitverlauf</CardTitle>
            <CardDescription>
              Kumulierte Nutzerzahl pro Woche.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupsAreaChart data={metrics.signups} />
          </CardContent>
        </Card>
      </div>

      {/* Verification funnel */}
      <Card className="bg-card border border-border shadow-none">
        <CardHeader>
          <CardTitle>Verifizierungs-Status</CardTitle>
          <CardDescription>
            Aufschlüsselung nach Bürger-Verifizierungsstatus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerificationFunnel data={metrics.verificationFunnel} />
        </CardContent>
      </Card>

      {/* Charts row 2 — engagement */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Top-Nutzer nach Punkten</CardTitle>
            <CardDescription>Höchste Röbel-Punkte-Guthaben.</CardDescription>
          </CardHeader>
          <CardContent>
            <TopUsersBars
              data={metrics.topByPoints}
              unit="Punkte"
              emptyLabel="Noch keine Punkte vergeben"
            />
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Top-Nutzer nach Stimmen</CardTitle>
            <CardDescription>
              Wer hat am häufigsten abgestimmt?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TopUsersBars
              data={metrics.topByVotes}
              unit="Stimmen"
              emptyLabel="Noch keine Stimmen abgegeben"
            />
          </CardContent>
        </Card>
      </div>

      {/* User table */}
      <Card className="bg-card border border-border shadow-none">
        <CardHeader>
          <CardTitle>Alle Nutzer</CardTitle>
          <CardDescription>
            {numberFmt.format(rows.length)} Accounts — suchen, filtern und
            Details ansehen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
