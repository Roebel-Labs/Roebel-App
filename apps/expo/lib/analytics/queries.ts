/**
 * Dashboard reads (owner/admin of the org only — the RPCs refuse everyone else).
 * See supabase/migrations/20261124_org_analytics.sql.
 */
import { supabase } from '../supabase';
import { eachDay, type DayRange } from '../charts/ranges';

export type AnalyticsMetric =
  | 'view' | 'impression' | 'click' | 'link_tap' | 'share' | 'like' | 'comment'
  | 'follow' | 'unfollow' | 'open' | 'interest' | 'save';

export type AnalyticsObjectType = 'post' | 'deal' | 'listing' | 'event' | 'profile' | 'mini_app' | 'ticket' | 'link' | 'org';

export const ALL_METRICS: AnalyticsMetric[] = [
  'view', 'impression', 'click', 'link_tap', 'share', 'like', 'comment', 'follow', 'unfollow', 'open', 'interest', 'save',
];

export type Series = Record<string, number[]>;
export type Totals = Record<AnalyticsMetric, { current: number; previous: number }>;

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw new Error(error.message ?? 'Analytics nicht verfügbar');
  return (data ?? []) as T[];
}

export async function fetchAnalyticsSeries(
  accountId: string,
  wallet: string,
  range: DayRange,
  metrics: AnalyticsMetric[],
  objectType: AnalyticsObjectType | null = null
): Promise<Series> {
  const rows = await rpc<{ day: string; metric: string; count: number }>('get_account_analytics', {
    p_account_id: accountId,
    p_wallet: wallet,
    p_from: range.from,
    p_to: range.to,
    p_metrics: metrics,
    p_object_type: objectType,
  });
  const days = eachDay(range);
  const index = new Map(days.map((d, i) => [d, i]));
  const out: Series = {};
  for (const m of metrics) out[m] = new Array(days.length).fill(0);
  for (const r of rows) {
    const i = index.get(String(r.day).slice(0, 10));
    if (i !== undefined && out[r.metric]) out[r.metric][i] = Number(r.count) || 0;
  }
  return out;
}

export async function fetchAnalyticsTotals(
  accountId: string,
  wallet: string,
  range: DayRange,
  objectType: AnalyticsObjectType | null = null
): Promise<Totals> {
  const rows = await rpc<{ metric: AnalyticsMetric; current: number; previous: number }>('get_account_analytics_totals', {
    p_account_id: accountId,
    p_wallet: wallet,
    p_from: range.from,
    p_to: range.to,
    p_object_type: objectType,
  });
  const out = Object.fromEntries(ALL_METRICS.map((m) => [m, { current: 0, previous: 0 }])) as Totals;
  for (const r of rows) if (out[r.metric]) out[r.metric] = { current: Number(r.current) || 0, previous: Number(r.previous) || 0 };
  return out;
}

export async function fetchUniques(accountId: string, wallet: string, range: DayRange): Promise<number[]> {
  const rows = await rpc<{ day: string; uniques: number }>('get_account_uniques', {
    p_account_id: accountId,
    p_wallet: wallet,
    p_from: range.from,
    p_to: range.to,
  });
  const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), Number(r.uniques) || 0]));
  return eachDay(range).map((d) => byDay.get(d) ?? 0);
}

export async function fetchSurfaces(accountId: string, wallet: string, range: DayRange): Promise<{ surface: string; count: number }[]> {
  const rows = await rpc<{ surface: string; count: number }>('get_account_surfaces', {
    p_account_id: accountId,
    p_wallet: wallet,
    p_from: range.from,
    p_to: range.to,
  });
  return rows.map((r) => ({ surface: r.surface, count: Number(r.count) || 0 }));
}

export type TopObject = { objectType: AnalyticsObjectType; objectId: string; count: number; title: string; thumbnailUrl: string | null };

const TITLE_SOURCES: Partial<Record<AnalyticsObjectType, { table: string; title: string; thumb: string | null }>> = {
  post: { table: 'posts', title: 'content', thumb: 'media_urls' },
  deal: { table: 'business_deals', title: 'title', thumb: 'image_url' },
  event: { table: 'events', title: 'title', thumb: 'image_url' },
  listing: { table: 'marketplace_listings', title: 'title', thumb: 'media_urls' },
  mini_app: { table: 'mini_apps', title: 'name', thumb: 'icon_url' },
};

function firstUrl(v: unknown): string | null {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : null;
  return typeof v === 'string' ? v : null;
}

export async function fetchTopObjects(
  accountId: string,
  wallet: string,
  range: DayRange,
  metric: AnalyticsMetric,
  limit = 10
): Promise<TopObject[]> {
  const rows = await rpc<{ object_type: AnalyticsObjectType; object_id: string; count: number }>('get_top_objects', {
    p_account_id: accountId,
    p_wallet: wallet,
    p_from: range.from,
    p_to: range.to,
    p_metric: metric,
    p_limit: limit,
  });
  const byType = new Map<AnalyticsObjectType, string[]>();
  for (const r of rows) byType.set(r.object_type, [...(byType.get(r.object_type) ?? []), r.object_id]);
  const meta = new Map<string, { title: string; thumb: string | null }>();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const src = TITLE_SOURCES[type];
      if (!src) return;
      const cols = ['id', src.title, src.thumb].filter(Boolean).join(', ');
      const { data } = await supabase.from(src.table).select(cols).in('id', ids);
      for (const d of (data ?? []) as any[]) {
        meta.set(`${type}:${d.id}`, { title: String(d[src.title] ?? '').slice(0, 80), thumb: src.thumb ? firstUrl(d[src.thumb]) : null });
      }
    })
  );
  const fallback: Record<string, string> = { profile: 'Profil', org: 'Profil', link: 'Link', ticket: 'Ticket' };
  return rows.map((r) => {
    const m = meta.get(`${r.object_type}:${r.object_id}`);
    return {
      objectType: r.object_type,
      objectId: r.object_id,
      count: Number(r.count) || 0,
      title: m?.title || fallback[r.object_type] || 'Inhalt',
      thumbnailUrl: m?.thumb ?? null,
    };
  });
}
