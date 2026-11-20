/**
 * Pure helpers for the home-screen widget (iOS WidgetKit + Android widget):
 * which mini apps it shows, and the platform-neutral payload both widgets read.
 * Side effects (storage, icons, OS reloads) live in lib/widget-sync.ts.
 */
import type { MiniApp } from './miniapps';

/** 15 apps + the fixed "Alle" store tile fill the large 4×4 widget. */
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
 * The apps the widget shows. An explicit choice (even an empty one) wins and keeps its
 * order; without one, the installed apps in store order, else the featured apps.
 * Apps that are no longer live are dropped.
 */
export function resolveSelection(
  selected: string[] | null,
  installed: string[],
  live: MiniApp[],
): MiniApp[] {
  const bySlug = new Map(live.map((a) => [a.slug, a]));
  let apps: MiniApp[];
  if (selected) {
    apps = selected.map((s) => bySlug.get(s)).filter((a): a is MiniApp => !!a);
  } else {
    const inst = new Set(installed);
    apps = live.filter((a) => inst.has(a.slug));
    if (apps.length === 0) apps = live.filter((a) => a.featured);
  }
  return apps.slice(0, WIDGET_MAX_APPS);
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
