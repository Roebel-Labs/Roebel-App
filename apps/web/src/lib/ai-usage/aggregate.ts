// Pure aggregation for the KI-Kosten (burn rate) page: ledger rows from
// ai_usage_events + chat_runs + event_poster_proposals in, chart-ready totals out.
// No I/O so it stays unit-testable.

export const PROVIDERS = ["anthropic", "openai", "kie", "elevenlabs", "zai"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface UsageRow {
  /** ISO timestamp. */
  at: string;
  source: "web" | "expo" | "edge";
  feature: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  units: number;
  unitType: string | null;
  usd: number;
}

export type DailyPoint = { date: string; total: number } & Record<Provider | "other", number>;

export interface Breakdown {
  key: string;
  provider: string;
  calls: number;
  usd: number;
  inputTokens: number;
  outputTokens: number;
  units: number;
  unitType: string | null;
}

export interface BurnSummary {
  rangeDays: number;
  totals: { usd: number; calls: number; inputTokens: number; outputTokens: number };
  burn: {
    dailyAvgUsd: number;
    last7dDailyAvgUsd: number;
    monthlyRunRateUsd: number;
    monthToDateUsd: number;
    projectedMonthUsd: number;
  };
  daily: DailyPoint[];
  byFeature: Breakdown[];
  byModel: Breakdown[];
  bySource: { source: string; calls: number; usd: number }[];
}

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.44;

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function providerSlot(provider: string): Provider | "other" {
  return (PROVIDERS as readonly string[]).includes(provider) ? (provider as Provider) : "other";
}

function emptyPoint(date: string): DailyPoint {
  const p = { date, total: 0, other: 0 } as DailyPoint;
  for (const k of PROVIDERS) p[k] = 0;
  return p;
}

function addTo(map: Map<string, Breakdown>, key: string, r: UsageRow) {
  const b = map.get(key) ?? {
    key,
    provider: r.provider,
    calls: 0,
    usd: 0,
    inputTokens: 0,
    outputTokens: 0,
    units: 0,
    unitType: r.unitType,
  };
  b.calls += 1;
  b.usd += r.usd;
  b.inputTokens += r.inputTokens;
  b.outputTokens += r.outputTokens;
  b.units += r.units;
  b.unitType ??= r.unitType;
  if (b.provider !== r.provider) b.provider = "mehrere";
  map.set(key, b);
}

/**
 * `rows` must cover at least [now - rangeDays, now] and the current UTC month
 * (for month-to-date); anything older than the range is ignored for the
 * range views.
 */
export function summarize(rows: UsageRow[], rangeDays: number, now: Date = new Date()): BurnSummary {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rangeStart = new Date(today.getTime() - (rangeDays - 1) * DAY_MS);
  const last7Start = new Date(today.getTime() - 6 * DAY_MS);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const daily = new Map<string, DailyPoint>();
  for (let t = rangeStart.getTime(); t <= today.getTime(); t += DAY_MS) {
    const key = utcDay(new Date(t));
    daily.set(key, emptyPoint(key));
  }

  const features = new Map<string, Breakdown>();
  const models = new Map<string, Breakdown>();
  const sources = new Map<string, { source: string; calls: number; usd: number }>();
  const totals = { usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
  let last7 = 0;
  let mtd = 0;

  for (const r of rows) {
    const at = new Date(r.at);
    if (Number.isNaN(at.getTime())) continue;
    if (at >= monthStart) mtd += r.usd;
    if (at >= last7Start) last7 += r.usd;
    if (at < rangeStart) continue;

    const point = daily.get(utcDay(at));
    if (point) {
      point[providerSlot(r.provider)] += r.usd;
      point.total += r.usd;
    }
    totals.usd += r.usd;
    totals.calls += 1;
    totals.inputTokens += r.inputTokens;
    totals.outputTokens += r.outputTokens;
    addTo(features, r.feature, r);
    addTo(models, `${r.provider}:${r.model}`, r);
    const s = sources.get(r.source) ?? { source: r.source, calls: 0, usd: 0 };
    s.calls += 1;
    s.usd += r.usd;
    sources.set(r.source, s);
  }

  const dailyAvgUsd = totals.usd / rangeDays;
  const elapsedMonthDays = now.getUTCDate() - 1 + (now.getTime() - today.getTime()) / DAY_MS;
  const byUsd = <T extends { usd: number; calls: number }>(a: T, b: T) => b.usd - a.usd || b.calls - a.calls;

  return {
    rangeDays,
    totals,
    burn: {
      dailyAvgUsd,
      last7dDailyAvgUsd: last7 / 7,
      monthlyRunRateUsd: dailyAvgUsd * AVG_MONTH_DAYS,
      monthToDateUsd: mtd,
      projectedMonthUsd: elapsedMonthDays > 0 ? (mtd / elapsedMonthDays) * daysInMonth : 0,
    },
    daily: [...daily.values()],
    byFeature: [...features.values()].sort(byUsd),
    byModel: [...models.values()].sort(byUsd),
    bySource: [...sources.values()].sort(byUsd),
  };
}
