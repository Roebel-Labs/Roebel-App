"use client";

// The mini-app developer dashboard, Base-Dashboard-style: app selector top
// left, inbox + settings top right, welcome headline, usage charts and metric
// cards. Everything that is not data or the Build-with-AI CTA lives in the
// settings dialog; the inbox guides the way to a fully published app.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
} from "recharts";
import {
  Award,
  Bell,
  ChevronDown,
  ChevronsUpDown,
  Globe,
  Info,
  PartyPopper,
  Plus,
  Settings,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/mini-apps/ui";
import { useMiniAppApi, type AnalyticsSummary } from "@/components/mini-apps/client";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import { LoginScreen } from "@/components/mini-apps/dashboard/LoginScreen";
import {
  SettingsDialog,
  type SettingsSection,
} from "@/components/mini-apps/dashboard/SettingsDialog";
import { InboxDialog, deriveTasks } from "@/components/mini-apps/dashboard/InboxDialog";
import type { AnalyticsRange, MiniAppRow } from "@/lib/miniapp/types";

const SELECTED_KEY = "miniapp-dash-selected";

const RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: "7d", label: "Letzte Woche" },
  { key: "30d", label: "Letzter Monat" },
  { key: "90d", label: "Letzte 90 Tage" },
  { key: "all", label: "Gesamt" },
];

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

// Sommer-Camp-Teilnehmer landen nach der Anmeldung mit ?welcome=sommercamp hier.
function SommercampWelcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (searchParams.get("welcome") !== "sommercamp") return null;
  return (
    <Card className="mb-6 flex items-center gap-3 border-[#FFD84D] bg-[#FFD84D]/15 p-4">
      <PartyPopper className="h-5 w-5 shrink-0 text-[#00498B]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Willkommen beim Sommer Camp!</p>
        <p className="text-xs text-muted-foreground">
          Du bist angemeldet. Erstelle jetzt deine erste Mini-App mit KI.
        </p>
      </div>
      <Link href="/editor">
        <Button size="sm">Mit KI erstellen</Button>
      </Link>
      <button
        type="button"
        aria-label="Hinweis schließen"
        onClick={() => router.replace("/dashboard/mini-apps")}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </Card>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help align-middle">
      <Info className="h-3.5 w-3.5 text-muted-foreground/70" />
    </span>
  );
}

/** Metric card with the design's thin blue accent line at the bottom. */
function MetricCard({
  title,
  tip,
  value,
  sub,
  children,
  className,
}: {
  title: string;
  tip?: string;
  value?: string;
  sub?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("relative flex flex-col overflow-hidden p-4 pb-5", className)}>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {title} {tip ? <InfoTip text={tip} /> : null}
      </p>
      {value !== undefined ? (
        <p className="mt-1 font-heading text-2xl font-bold tracking-tight">{value}</p>
      ) : null}
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      {children}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-primary/80" />
    </Card>
  );
}

function MiniArea({ data, dataKey }: { data: Record<string, unknown>[]; dataKey: string }) {
  return (
    <div className="mt-auto h-14 pt-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="hsl(var(--primary))"
            fillOpacity={0.08}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MiniAppDashboard() {
  const wallet = useWalletAddress();
  const { data: listData, loading: listLoading, refresh: refreshList } = useMiniAppApi<{
    apps: MiniAppRow[];
  }>(wallet ? "list?mine=1" : null, wallet);
  const apps = useMemo(() => listData?.apps ?? [], [listData]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedId(window.localStorage.getItem(SELECTED_KEY));
  }, []);
  const app = apps.find((a) => a.id === selectedId) ?? apps[0] ?? null;

  const [range, setRange] = useState<AnalyticsRange>("7d");
  const { data: stats } = useMiniAppApi<AnalyticsSummary>(
    app && wallet ? `analytics?appId=${encodeURIComponent(app.id)}&range=${range}` : null,
    wallet ?? undefined,
  );

  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectorOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!selectorRef.current?.contains(e.target as Node)) setSelectorOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [selectorOpen]);

  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const openTasks = deriveTasks(app).filter((t) => !t.done).length;

  if (!wallet) return <LoginScreen />;

  const series = stats?.series ?? [];
  const avgDailyUsers = series.length
    ? Math.round(series.reduce((s, p) => s + p.uniqueWallets, 0) / series.length)
    : 0;

  function selectApp(id: string) {
    setSelectedId(id);
    window.localStorage.setItem(SELECTED_KEY, id);
    setSelectorOpen(false);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar: app selector left, inbox/settings right */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="relative" ref={selectorRef}>
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              aria-expanded={selectorOpen}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-accent"
            >
              {app ? (
                <AppIcon name={app.name} iconUrl={app.icon_url} color={app.primary_color} size={24} />
              ) : (
                <Image src="/logo.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
              )}
              <span className="max-w-40 truncate">{app?.name ?? "Mini-Apps"}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {selectorOpen ? (
              <div className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {listLoading && apps.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">Lädt …</p>
                  ) : apps.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      Noch keine Mini-App.
                    </p>
                  ) : (
                    apps.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectApp(a.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent",
                          a.id === app?.id && "bg-accent/60 font-medium",
                        )}
                      >
                        <AppIcon name={a.name} iconUrl={a.icon_url} color={a.primary_color} size={24} />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            a.status === "live"
                              ? "bg-green-500"
                              : a.status === "pending"
                                ? "bg-amber-500"
                                : "bg-muted-foreground/40",
                          )}
                          title={a.status}
                        />
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t border-border p-1.5">
                  <Link
                    href="/editor"
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-primary hover:bg-accent"
                  >
                    <Sparkles className="h-4 w-4" /> Neue App mit KI
                  </Link>
                  <Link
                    href="/dashboard/mini-apps/import"
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Upload className="h-4 w-4" /> App importieren
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Inbox öffnen${openTasks ? ` (${openTasks} offene Aufgaben)` : ""}`}
              onClick={() => setInboxOpen(true)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Bell className="h-[18px] w-[18px]" />
              {openTasks > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              ) : null}
            </button>
            <button
              type="button"
              aria-label="Einstellungen öffnen"
              onClick={() => setSettingsSection("app")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Settings className="h-[18px] w-[18px]" />
            </button>
            <Link
              href="/app"
              aria-label="Zur Röbel App"
              className="ml-1 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted"
            >
              <Image src="/logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Suspense fallback={null}>
          <SommercampWelcome />
        </Suspense>

        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Willkommen{app ? `, ${app.name}` : ""}
        </h1>

        {/* Range + Rankings row */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="relative">
            <select
              aria-label="Zeitraum"
              value={range}
              onChange={(e) => setRange(e.target.value as AnalyticsRange)}
              className="appearance-none rounded-full border border-border bg-background py-2 pl-4 pr-9 text-sm font-medium hover:bg-accent"
            >
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Link
            href="/dashboard/mini-apps/rankings"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            <Award className="h-4 w-4" /> App-Ranking
            <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
          </Link>
        </div>

        {!listLoading && apps.length === 0 ? (
          <Card className="mt-8 flex flex-col items-center gap-4 p-12 text-center">
            <Image src="/logo.png" alt="" width={48} height={48} className="h-12 w-12 object-contain" />
            <div>
              <p className="font-heading text-xl font-bold">Bau deine erste Mini-App</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Mit KI in Minuten — oder importiere eine bestehende Web-App.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/editor">
                <Button>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Mit KI erstellen
                </Button>
              </Link>
              <Link href="/dashboard/mini-apps/import">
                <Button variant="outline">
                  <Plus className="mr-1.5 h-4 w-4" /> Importieren
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            {/* Hero stat + big chart */}
            <div className="mt-8">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Aktive Nutzer gesamt{" "}
                <InfoTip text="Eindeutige Nutzer mit mindestens einem Ereignis im Zeitraum" />
              </p>
              <p className="mt-1 font-heading text-4xl font-bold tracking-tight">
                {nf.format(stats?.uniqueWallets ?? 0)}
              </p>
              <div className="relative mt-4 h-56 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 0, bottom: 2, left: 0 }}>
                    <Area
                      type="monotone"
                      dataKey="uniqueWallets"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="hsl(var(--primary))"
                      fillOpacity={0.07}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-primary/80" />
              </div>
            </div>

            {/* Build with AI CTA */}
            <Card className="mt-10 flex flex-col items-start gap-4 bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white">
                <Image src="/logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg font-bold">Bau die nächste Mini-App mit KI</p>
                <p className="text-sm text-primary-foreground/80">
                  Idee beschreiben, live testen, veröffentlichen — direkt im Browser.
                </p>
              </div>
              <Link href="/editor" className="shrink-0">
                <Button variant="secondary" className="rounded-full font-bold">
                  <Sparkles className="mr-1.5 h-4 w-4" /> Mit KI erstellen
                </Button>
              </Link>
            </Card>

            {/* Platform chips */}
            <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-border p-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-3.5 py-1.5 text-sm font-semibold shadow-sm">
                <Image src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                Röbel App
              </span>
              <span
                title="Getrennte Web-Auswertung kommt bald"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-muted-foreground/60"
              >
                <Globe className="h-4 w-4" /> Web
              </span>
            </div>

            {/* Metric cards */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard
                title="Täglich aktive Nutzer"
                tip="Durchschnitt eindeutiger Nutzer pro Tag im Zeitraum"
                value={nf.format(avgDailyUsers)}
              >
                <MiniArea data={series} dataKey="uniqueWallets" />
              </MetricCard>
              <MetricCard
                title="Öffnungen"
                tip="app_open-Ereignisse im Zeitraum"
                value={nf.format(stats?.opens ?? 0)}
              >
                <MiniArea data={series} dataKey="opens" />
              </MetricCard>
              <MetricCard
                title="Münzen ausgeschüttet"
                tip="Über deine App verdiente Röbel-Münzen"
                value={`${nf.format(stats?.rewardsAmount ?? 0)} RÖ`}
                sub={`${nf.format(stats?.rewardsGranted ?? 0)} Belohnungen`}
              >
                <div className="mt-auto h-14 pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <Bar
                        dataKey="rewards"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.5}
                        radius={[2, 2, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </MetricCard>
              <MetricCard
                title="Belohnungs-Budget"
                tip="Verbrauchtes / gesamtes Münzen-Budget deiner App"
                value={
                  stats?.budget != null
                    ? `${nf.format(stats.spent ?? 0)} / ${nf.format(stats.budget)} RÖ`
                    : "—"
                }
              >
                <div className="mt-auto pt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: stats?.budget
                          ? `${Math.min(100, ((stats.spent ?? 0) / stats.budget) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              </MetricCard>
              <MetricCard
                title="Sitzungen"
                tip="Eindeutige SDK-Sitzungen im Zeitraum"
                value={nf.format(stats?.sessions ?? 0)}
                sub="eindeutige Sitzungen"
              />
              <MetricCard
                title="Wiederkehrende Nutzer"
                tip="Nutzer der zweiten Zeitraum-Hälfte, die schon in der ersten aktiv waren"
                value={`${Math.round((stats?.retentionRate ?? 0) * 100)} %`}
                sub={`${nf.format(stats?.returningWallets ?? 0)} Nutzer kamen zurück`}
              />
              <MetricCard title="Top-Ereignisse" tip="Häufigste SDK-Ereignisse (sdk.track)">
                <div className="mt-3 space-y-1.5">
                  {(stats?.topEvents ?? []).slice(0, 4).map((e) => (
                    <div
                      key={e.event}
                      className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-sm"
                    >
                      <span className="truncate font-mono text-xs">{e.event}</span>
                      <span className="font-semibold">{nf.format(e.count)}</span>
                    </div>
                  ))}
                  {(stats?.topEvents ?? []).length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      Noch keine Ereignisse — baue <span className="font-mono">sdk.track()</span> ein.
                    </p>
                  ) : null}
                </div>
              </MetricCard>
              <MetricCard title="Aktivität" tip="Alles Erfasste im Zeitraum auf einen Blick">
                <div className="mt-3 space-y-1.5">
                  {[
                    { label: "Ereignisse gesamt", v: stats?.events ?? 0 },
                    { label: "Belohnungen", v: stats?.rewardsGranted ?? 0 },
                    { label: "Sitzungen", v: stats?.sessions ?? 0 },
                  ].map((r) => (
                    <div
                      key={r.label}
                      className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-sm"
                    >
                      <span>{r.label}</span>
                      <span className="font-semibold">{nf.format(r.v)}</span>
                    </div>
                  ))}
                </div>
              </MetricCard>
            </div>
          </>
        )}
      </main>

      {settingsSection ? (
        <SettingsDialog
          app={app}
          wallet={wallet}
          section={settingsSection}
          onSectionChange={setSettingsSection}
          onClose={() => setSettingsSection(null)}
          onChanged={refreshList}
        />
      ) : null}
      {inboxOpen ? (
        <InboxDialog
          app={app}
          onClose={() => setInboxOpen(false)}
          onOpenSettings={(s) => setSettingsSection(s)}
        />
      ) : null}
    </div>
  );
}
