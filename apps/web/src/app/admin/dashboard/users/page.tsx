import { Activity, Apple, Download, Smartphone, ShieldCheck, UserPlus, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/admin/dao/KpiCard";
import { TierDonut } from "@/components/admin/users/TierDonut";
import { SignupsChart } from "@/components/admin/users/SignupsChart";
import { DailyActivityChart } from "@/components/admin/users/DailyActivityChart";
import { OpenVerificationsKpi } from "@/components/admin/users/OpenVerificationsKpi";
import { TopUsersBars } from "@/components/admin/users/TopUsersBars";
import { StoreDownloadsChart } from "@/components/admin/users/StoreDownloadsChart";
import { getUsersAdminData } from "@/app/actions/users-admin";
import { getStoreMetrics } from "@/app/actions/store-admin";
import { UsersTable } from "./_components/users-table";

export const dynamic = "force-dynamic";

const numberFmt = new Intl.NumberFormat("de-DE");

export default async function UsersAdminPage() {
  const [result, storeResult] = await Promise.all([
    getUsersAdminData(),
    getStoreMetrics(),
  ]);
  const store = storeResult.success ? storeResult.data : undefined;

  if (!result.success || !result.rows || !result.metrics || !result.signupRows) {
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

  const { rows, metrics, signupRows } = result;

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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
        <OpenVerificationsKpi />
        <KpiCard
          label="Neu (30 Tage)"
          value={numberFmt.format(metrics.newLast30Days)}
          hint="neue Registrierungen"
          icon={UserPlus}
        />
        <KpiCard
          label="Aktiv (30 Tage)"
          value={numberFmt.format(metrics.activeLast30Days)}
          hint="Login in den letzten 30 Tagen"
          icon={Activity}
        />
      </div>

      {/* Registrations over time (with platform filter) */}
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
              Kumulierte Nutzerzahl pro Woche. Plattform basiert auf erfasstem
              Login/Gerät — ältere Nutzer ohne Geräteinfo zählen als „Unbekannt“.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupsChart rows={signupRows} />
          </CardContent>
        </Card>
      </div>

      {/* Daily activity / DAU */}
      <Card className="bg-card border border-border shadow-none">
        <CardHeader>
          <CardTitle>Tägliche Aktivität (60 Tage)</CardTitle>
          <CardDescription>
            Registrierungen pro Tag, aktive Nutzer als Proxy (Punkte-Aktivität)
            und echte DAU aus dem App-Aktivitätslog. Die echte DAU-Linie füllt
            sich ab jetzt, da das Tracking neu eingeführt wurde.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyActivityChart
            registrations={metrics.dailyRegistrations}
            activeProxy={metrics.dailyActiveProxy}
            activeReal={metrics.dailyActiveReal}
          />
        </CardContent>
      </Card>

      {/* Store downloads */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <KpiCard
            label="App Store Downloads"
            value={numberFmt.format(store?.totals.ios ?? 0)}
            hint="iOS · seit Tracking-Start"
            icon={Apple}
          />
          <KpiCard
            label="Play Store Downloads"
            value={numberFmt.format(store?.totals.android ?? 0)}
            hint="Android · Geräte-Installs"
            icon={Smartphone}
          />
          <KpiCard
            label="Downloads gesamt"
            value={numberFmt.format(store?.totals.combined ?? 0)}
            hint="beide Stores kombiniert"
            icon={Download}
          />
        </div>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Store-Downloads pro Tag (60 Tage)</CardTitle>
            <CardDescription>
              Tägliche Downloads aus App Store (Sales Reports) und Play Store
              (Installs-Export).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {store?.hasData ? (
              <StoreDownloadsChart daily={store.daily} />
            ) : (
              <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
                Noch keine Store-Daten – Zugangsdaten (Apple App Store Connect &amp;
                Google Play) in Vercel hinterlegen. Der tägliche Cron-Job füllt die
                Werte anschließend automatisch.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
