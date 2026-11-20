/**
 * Pure helpers for the home-screen widget (iOS WidgetKit + Android widget):
 * which mini apps it shows, and the platform-neutral payload both widgets read.
 * Side effects (storage, icons, OS reloads) live in lib/widget-sync.ts.
 */
import type { MiniApp } from './miniapps';

/** 15 apps + the store tile fill the large 4×4 widget. */
export const WIDGET_MAX_APPS = 15;

export const WIDGET_STORE_URL = 'roebel://mini-apps';
export const WIDGET_SETTINGS_URL = 'roebel://settings/widget';

export type WidgetApp = {
  slug: string;
  name: string;
  /** Tile color behind the icon; null → the widget's neutral surface color. */
  color: string | null;
  /** Base64 PNG without the data: prefix; null → letter tile. */
  icon: string | null;
  unread: boolean;
  /** Deep link that opens the mini app directly. */
  url: string;
};

export type WidgetPayload = { v: 1; apps: WidgetApp[]; updatedAt: number };

export function widgetDeepLink(slug: string): string {
  return `roebel://mini-app/${encodeURIComponent(slug)}?open=1`;
}

/**
 * The apps the widget shows (the store tile always follows them). An explicit choice
 * (Einstellungen → Widget, even an empty one) wins and keeps its order; without one,
 * the recently opened apps, most recent first. Never opened anything → no apps, the
 * widget shows the store tile alone. Apps that are no longer live are dropped.
 */
export function resolveSelection(
  selected: string[] | null,
  recent: string[],
  live: MiniApp[],
): MiniApp[] {
  const bySlug = new Map(live.map((a) => [a.slug, a]));
  const slugs = selected ?? recent;
  return slugs
    .map((s) => bySlug.get(s))
    .filter((a): a is MiniApp => !!a)
    .slice(0, WIDGET_MAX_APPS);
}

export function buildPayload(
  apps: MiniApp[],
  icons: Record<string, string | null>,
  unreadSlugs: Set<string>,
  now: number,
): WidgetPayload {
  return {
    v: 1,
    updatedAt: now,
    apps: apps.map((a) => ({
      slug: a.slug,
      name: a.name,
      color: a.primaryColor || null,
      icon: icons[a.slug] ?? null,
      unread: unreadSlugs.has(a.slug),
      url: widgetDeepLink(a.slug),
    })),
  };
}

/**
 * Merge rule — an app that once appeared in the widget stays there. Order: the explicit
 * selection (removing an app there is the only way out), else the recent opens followed
 * by everything the widget showed before. Each app takes its fresh entry (new icon,
 * unread flag) or, when the server did not return it (failed / empty answer, app
 * delisted), its previous entry. Deduplicated, capped at WIDGET_MAX_APPS.
 */
export function mergeWidgetApps(
  fresh: WidgetApp[],
  previous: WidgetApp[] | null | undefined,
  selected: string[] | null,
  recent: string[],
): WidgetApp[] {
  const freshBySlug = new Map(fresh.map((a) => [a.slug, a]));
  const prevBySlug = new Map((previous ?? []).map((a) => [a.slug, a]));
  const order = selected ?? [...recent, ...fresh.map((a) => a.slug), ...(previous ?? []).map((a) => a.slug)];
  const out: WidgetApp[] = [];
  const seen = new Set<string>();
  for (const slug of order) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const now = freshBySlug.get(slug);
    const before = prevBySlug.get(slug);
    if (now) out.push(before && !now.icon && before.icon ? { ...now, icon: before.icon } : now);
    else if (before) out.push(before);
  }
  return out.slice(0, WIDGET_MAX_APPS);
}

/** Recent slugs from several stores, first occurrence wins. */
export function dedupeSlugs(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}
