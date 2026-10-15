"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  PageHeader,
  KpiCard,
  ChartCard,
  ErrorState,
  SkeletonGrid,
  EmptyHint,
  Pill,
  AlertBanner,
} from "@/components/admin/muenzen/ui";
import { cn } from "@/lib/utils";

type Provider = "anthropic" | "openai" | "kie" | "elevenlabs" | "zai" | "other";

interface Breakdown {
  key: string;
  provider: string;
  calls: number;
  usd: number;
  inputTokens: number;
  outputTokens: number;
  units: number;
  unitType: string | null;
}

interface BillingReport {
  provider: "anthropic" | "openai";
  configured: boolean;
  ok: boolean;
  error?: string;
  totalUsd: number;
  lineItems: { name: string; usd: number }[];
}

interface KiKostenData {
  range: string;
  rangeDays: number;
  totals: { usd: number; calls: number; inputTokens: number; outputTokens: number };
  burn: {
    dailyAvgUsd: number;
    last7dDailyAvgUsd: number;
    monthlyRunRateUsd: number;
    monthToDateUsd: number;
    projectedMonthUsd: number;
  };
  daily: ({ date: string; total: number } & Record<Provider, number>)[];
  byFeature: Breakdown[];
  byModel: Breakdown[];
  bySource: { source: string; calls: number; usd: number }[];
  billing: BillingReport[];
  trackedSince: string | null;
  generatedAt: number;
}

const RANGES = [
  { key: "7d", label: "7 T." },
  { key: "30d", label: "30 T." },
  { key: "90d", label: "90 T." },
];

// Fixed categorical order (never re-assigned by rank): a provider keeps its color in every range.
const PROVIDERS: { key: Provider; label: string }[] = [
  { key: "anthropic", label: "Anthropic (Claude)" },
  { key: "openai", label: "OpenAI" },
  { key: "kie", label: "kie.ai (Bilder)" },
  { key: "elevenlabs", label: "ElevenLabs (Sprache)" },
  { key: "zai", label: "Z.ai (GLM)" },
  { key: "other", label: "Sonstige" },
];
const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(PROVIDERS.map((p) => [p.key, p.label]));

const FEATURE_LABEL: Record<string, string> = {
  "expo.anthropic-proxy": "App-KI (Mecky, Event- & Flyer-Erkennung)",
  "mecky.chat": "Mecky Web-Chat",
  "mecky.comment-reply": "@Mecky Kommentar-Antworten",
  "mecky.story-chat": "Mecky Story-Chat",
  "mecky.story-draft": "Mecky Story-Entwurf",
  "mecky.outreach": "Mecky Outreach (Cron)",
  moderation: "Beitrags-Moderation",
  "chat.bot-fast": "Chat-Suite (schnell)",
  "chat.bot-smart": "Chat-Suite (stark)",
  "chat.vision": "Chat-Suite (Bilder)",
  "chat.transcribe": "Chat-Sprachnachrichten",
  "poster.image": "Plakat-Bilder",
  "poster.copy": "Plakat-Texte & Analyse",
  "newsletter.draft": "Newsletter-Entwürfe",
  "event-radio.script": "Wochen-Radio Skripte",
  "event-radio.tts": "Wochen-Radio Sprache",
  "news.vorlesen": "News vorlesen",
  "menu.image": "Speisekarten-Fotos",
  "flyer.copy": "Flyer-Texte",
  "flyer.image": "Flyer-Bilder",
  "flyer.extraction": "Flyer-Erkennung (Web)",
  "event.submission-chat": "Event-Einreichung (Chat)",
  "miniapp.codegen": "Mini-App-Builder",
  "miniapp.cms-plan": "Mini-App CMS-Plan",
  "miniapp.manifest": "Mini-App Manifest",
  "miniapp.vision": "Mini-App Bildanalyse",
  "miniapp.image": "Mini-App Store-Bilder",
  "foerdermittel.fit": "Fördermittel-Check",
  "dev-tickets.triage": "Dev-Ticket-Triage",
  "admin.transcription": "Transkription (Admin)",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "Website & Admin",
  expo: "App (über Web-Proxy)",
  edge: "Supabase Edge Functions",
};

const UNIT_LABEL: Record<string, string> = {
  image: "Bilder",
  char: "Zeichen",
  second: "Sek. Audio",
  search: "Websuchen",
};

const usdFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD" });
const numFmt = new Intl.NumberFormat("de-DE");
const compactFmt = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });

function fmtUsd(v: number): string {
  if (v > 0 && v < 0.01) return "< 0,01 $";
  return usdFmt.format(v);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function volume(b: Breakdown): string {
  const parts: string[] = [];
  const tokens = b.inputTokens + b.outputTokens;
  if (tokens > 0) parts.push(`${compactFmt.format(tokens)} Tokens`);
  if (b.units > 0 && b.unitType) parts.push(`${compactFmt.format(b.units)} ${UNIT_LABEL[b.unitType] ?? b.unitType}`);
  return parts.join(" · ") || "–";
}

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  fontSize: 12,
};

// Series colors as CSS custom properties so light/dark swap in one place.
const VIZ_STYLE = `
.ki-viz {
  --series-anthropic: #2a78d6;
  --series-openai: #eb6834;
  --series-kie: #1baf7a;
  --series-elevenlabs: #eda100;
  --series-zai: #e87ba4;
  --series-other: #9a9893;
}
.dark .ki-viz {
  --series-anthropic: #3987e5;
  --series-openai: #d95926;
  --series-kie: #199e70;
  --series-elevenlabs: #c98500;
  --series-zai: #d55181;
  --series-other: #7a7975;
}`;

function useKiKosten(range: string) {
  const [data, setData] = useState<KiKostenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (fresh: boolean) => {
      if (fresh) setRefreshing(true);
      setError(null);
      try {
        const res = await fetch(`/api/ki-kosten?range=${range}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        setData((await res.json()) as KiKostenData);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range],
  );

  useEffect(() => {
    setLoading(true);
    load(false);
  }, [load]);

  return { data, loading, error, refreshing, refresh: () => load(true) };
}

function ProviderDot({ provider }: { provider: string }) {
  const key = PROVIDER_LABEL[provider] ? provider : "other";
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--series-${key})` }}
    />
  );
}

function BreakdownTable({ rows, label, max = 12 }: { rows: Breakdown[]; label: (b: Breakdown) => string; max?: number }) {
  if (rows.length === 0) return <EmptyHint>Keine KI-Aufrufe im gewählten Zeitraum.</EmptyHint>;
  const top = rows.reduce((m, r) => Math.max(m, r.usd), 0) || 1;
  return (
    <div className="divide-y divide-border">
      {rows.slice(0, max).map((b) => (
        <div key={b.key} className="py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <ProviderDot provider={b.provider} />
              <span className="truncate text-sm font-medium">{label(b)}</span>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtUsd(b.usd)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(1, (b.usd / top) * 100)}%`,
                  backgroundColor: `var(--series-${PROVIDER_LABEL[b.provider] ? b.provider : "other"})`,
                }}
              />
            </div>
            <span className="w-44 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {numFmt.format(b.calls)} Aufrufe · {volume(b)}
            </span>
          </div>
        </div>
      ))}
      {rows.length > max && (
        <p className="pt-2 text-xs text-muted-foreground">+ {rows.length - max} weitere mit zusammen {fmtUsd(rows.slice(max).reduce((s, r) => s + r.usd, 0))}</p>
      )}
    </div>
  );
}

export default function KiKostenPage() {
  const [range, setRange] = useState("30d");
  const { data, loading, error, refresh, refreshing } = useKiKosten(range);

  const alerts: { level: "warning" | "info"; key: string; message: string }[] = [];
  if (data) {
    const since = data.trackedSince ? fmtDate(data.trackedSince) : null;
    alerts.push({
      level: "info",
      key: "coverage",
      message: since
        ? `Vollständige Erfassung aller KI-Aufrufe seit ${since}. Davor sind nur Chat-Suite und Plakat-Bilder enthalten. Alle Beträge sind Schätzungen zu Listenpreisen.`
        : "Die vollständige Erfassung startet mit dem nächsten KI-Aufruf. Bis dahin sind nur Chat-Suite und Plakat-Bilder enthalten. Alle Beträge sind Schätzungen zu Listenpreisen.",
    });
    for (const b of data.billing) {
      if (b.configured && !b.ok) {
        alerts.push({
          level: "warning",
          key: `billing-${b.provider}`,
          message: `${PROVIDER_LABEL[b.provider]}-Abrechnung konnte nicht geladen werden: ${b.error ?? "unbekannter Fehler"}`,
        });
      }
    }
  }

  const estimateFor = (provider: string) =>
    data?.byModel.filter((m) => m.provider === provider).reduce((s, m) => s + m.usd, 0) ?? 0;

  return (
    <div className="ki-viz">
      <style>{VIZ_STYLE}</style>
      <PageHeader
        title="KI-Kosten"
        description="Burn-Rate aller bezahlten KI-Dienste von Website, App und Edge Functions: Claude, OpenAI, kie.ai-Bilder, ElevenLabs-Sprache und Z.ai."
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
                range === r.key ? "bg-[#00498B] text-white" : "text-muted-foreground hover:text-foreground",
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
          <AlertBanner alerts={alerts} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Burn-Rate pro Monat"
              value={fmtUsd(data.burn.monthlyRunRateUsd)}
              sub={`Hochrechnung aus ${data.rangeDays} Tagen`}
              tone="primary"
            />
            <KpiCard
              label="Ø pro Tag (7 Tage)"
              value={fmtUsd(data.burn.last7dDailyAvgUsd)}
              sub={`Ø im Zeitraum: ${fmtUsd(data.burn.dailyAvgUsd)}`}
              tone="info"
            />
            <KpiCard
              label="Dieser Monat bisher"
              value={fmtUsd(data.burn.monthToDateUsd)}
              sub={`Prognose Monatsende: ${fmtUsd(data.burn.projectedMonthUsd)}`}
              tone="warning"
            />
            <KpiCard
              label="Im Zeitraum"
              value={fmtUsd(data.totals.usd)}
              sub={`${numFmt.format(data.totals.calls)} Aufrufe · ${compactFmt.format(data.totals.inputTokens + data.totals.outputTokens)} Tokens`}
              tone="muted"
            />
          </div>

          <ChartCard title="Kosten pro Tag" subtitle="Geschätzte Kosten nach Anbieter (UTC-Tage)">
            {data.totals.usd === 0 ? (
              <EmptyHint>Noch keine Kosten im gewählten Zeitraum erfasst.</EmptyHint>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barCategoryGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={axisTick}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      tickFormatter={(d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`}
                      minTickGap={16}
                    />
                    <YAxis
                      tick={axisTick}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v: number) => usdFmt.format(v)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                      labelFormatter={(d) => fmtDate(String(d))}
                      formatter={(v, name) => [fmtUsd(Number(v)), String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} iconType="circle" iconSize={8} />
                    {PROVIDERS.map((p) => (
                      <Bar
                        key={p.key}
                        dataKey={p.key}
                        name={p.label}
                        stackId="cost"
                        fill={`var(--series-${p.key})`}
                        stroke="hsl(var(--card))"
                        strokeWidth={1}
                        maxBarSize={28}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Kosten nach Funktion" subtitle="Wofür das Geld ausgegeben wird">
              <BreakdownTable rows={data.byFeature} label={(b) => FEATURE_LABEL[b.key] ?? b.key} />
            </ChartCard>
            <ChartCard title="Kosten nach Modell" subtitle="Welche Modelle die Kosten treiben">
              <BreakdownTable rows={data.byModel} label={(b) => b.key.split(":").slice(1).join(":")} />
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Abrechnung der Anbieter"
              subtitle="Tatsächlich berechnete Kosten im Zeitraum (Admin-API) im Vergleich zur eigenen Schätzung"
            >
              <div className="divide-y divide-border">
                {data.billing.map((b) => (
                  <div key={b.provider} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ProviderDot provider={b.provider} />
                        <span className="text-sm font-medium">{PROVIDER_LABEL[b.provider]}</span>
                        {!b.configured ? (
                          <Pill tone="muted">nicht verbunden</Pill>
                        ) : b.ok ? (
                          <Pill tone="success">live</Pill>
                        ) : (
                          <Pill tone="danger">Fehler</Pill>
                        )}
                      </div>
                      {b.configured && b.ok && (
                        <span className="text-sm font-semibold tabular-nums">{fmtUsd(b.totalUsd)}</span>
                      )}
                    </div>
                    {!b.configured ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Für echte Rechnungsbeträge{" "}
                        <code className="rounded bg-muted px-1">
                          {b.provider === "anthropic" ? "ANTHROPIC_ADMIN_KEY" : "OPENAI_ADMIN_KEY"}
                        </code>{" "}
                        in Vercel setzen (Admin-Schlüssel, kein normaler API-Key).
                      </p>
                    ) : b.ok ? (
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        <p>
                          Eigene Schätzung: {fmtUsd(estimateFor(b.provider))}. Die Abrechnung enthält auch Aufrufe
                          außerhalb der App (z. B. Entwicklung, andere Projekte mit demselben Konto).
                        </p>
                        {b.lineItems.slice(0, 4).map((li) => (
                          <p key={li.name} className="flex justify-between gap-3">
                            <span className="truncate">{li.name}</span>
                            <span className="tabular-nums">{fmtUsd(li.usd)}</span>
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Herkunft" subtitle="Wo die Aufrufe ausgelöst werden">
              {data.bySource.length === 0 ? (
                <EmptyHint>Keine Aufrufe im gewählten Zeitraum.</EmptyHint>
              ) : (
                <div className="divide-y divide-border">
                  {data.bySource.map((s) => (
                    <div key={s.source} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm font-medium">{SOURCE_LABEL[s.source] ?? s.source}</span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums">{fmtUsd(s.usd)}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {numFmt.format(s.calls)} Aufrufe
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Feste Kosten (Vercel, Supabase, Fly, Hetzner) sind hier nicht enthalten.
              </p>
            </ChartCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
