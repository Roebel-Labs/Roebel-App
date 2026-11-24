import { deltaPercent } from '@/lib/charts/ranges';
import type { AnalyticsMetric, AnalyticsObjectType, Totals } from '@/lib/analytics/queries';

/** Key-metric tiles on Übersicht. Each tile = a sum of metrics, optionally for one object type. */
export type TileDef = { key: string; label: string; metrics: AnalyticsMetric[]; objectType: AnalyticsObjectType | null };

export const OVERVIEW_TILES: TileDef[] = [
  { key: 'post_views', label: 'Beitragsaufrufe', metrics: ['view', 'impression'], objectType: 'post' },
  { key: 'profile_views', label: 'Profilaufrufe', metrics: ['view'], objectType: 'profile' },
  { key: 'likes', label: 'Likes', metrics: ['like'], objectType: null },
  { key: 'comments', label: 'Kommentare', metrics: ['comment'], objectType: null },
  { key: 'shares', label: 'Geteilt', metrics: ['share'], objectType: null },
  { key: 'clicks', label: 'Klicks', metrics: ['click', 'link_tap'], objectType: null },
  { key: 'follows', label: 'Neue Follower', metrics: ['follow'], objectType: null },
  { key: 'all_views', label: 'Alle Aufrufe', metrics: ['view', 'impression', 'open'], objectType: null },
];

export function tileTotal(t: TileDef, totals: Totals | undefined): { current: number; previous: number } {
  if (!totals) return { current: 0, previous: 0 };
  return t.metrics.reduce(
    (acc, m) => ({ current: acc.current + totals[m].current, previous: acc.previous + totals[m].previous }),
    { current: 0, previous: 0 }
  );
}

export const INTERACTION_METRICS: { metric: AnalyticsMetric; label: string }[] = [
  { metric: 'like', label: 'Likes' },
  { metric: 'comment', label: 'Kommentare' },
  { metric: 'share', label: 'Geteilt' },
  { metric: 'click', label: 'Klicks' },
  { metric: 'save', label: 'Gemerkt' },
];

export const SURFACE_LABELS: Record<string, string> = {
  feed: 'Feed',
  post: 'Beitragsseite',
  profile: 'Profil',
  event: 'Veranstaltung',
  listing: 'Marktplatz',
  deal: 'Anzeige',
  mini_app: 'Mini-App',
  share_sheet: 'Teilen-Menü',
  like: 'Like',
  comment: 'Kommentar',
  interest: 'Interesse',
  sonstige: 'Sonstige',
};

/** Interactions ÷ views, as a percent with one decimal. */
export function engagementRate(interactions: number, views: number): string {
  if (views <= 0) return '–';
  return `${(Math.round((interactions / views) * 1000) / 10).toString().replace('.', ',')} %`;
}


/** The four numbers on the org Profil overview card (28 days). */
export function orgOverviewMetrics(
  all: Totals,
  posts: Totals,
  profile: Totals
): { label: string; value: number; delta: number | null }[] {
  const sum = (t: Totals, ms: AnalyticsMetric[]) =>
    ms.reduce((a, m) => ({ current: a.current + t[m].current, previous: a.previous + t[m].previous }), { current: 0, previous: 0 });
  const rows: [string, { current: number; previous: number }][] = [
    ['Beitragsaufrufe', sum(posts, ['view', 'impression'])],
    ['Profilaufrufe', sum(profile, ['view'])],
    ['Neue Follower', sum(all, ['follow'])],
    ['Interaktionen', sum(all, ['like', 'comment', 'share', 'click', 'link_tap'])],
  ];
  return rows.map(([label, v]) => ({ label, value: v.current, delta: deltaPercent(v.current, v.previous) }));
}
