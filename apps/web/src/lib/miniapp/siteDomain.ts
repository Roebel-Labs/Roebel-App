/**
 * Mini-app site domain — every published single-file app is served on its own
 * subdomain (https://<slug>.roebel.site), the chatgpt.site / lovable.site
 * pattern. A real per-app origin replaces the CSP `sandbox` opaque-origin
 * workaround: apps gain localStorage/cookies on their own origin while the
 * roebel.app dashboard session stays physically unreachable.
 *
 * next.config.mjs repeats the default (it cannot import TS) — keep in sync.
 */
export const MINI_APPS_SITE_DOMAIN = (
  process.env.MINI_APPS_SITE_DOMAIN || "roebel.site"
).toLowerCase();

/** The dedicated origin a published app is served from. */
export function siteOriginForSlug(slug: string): string {
  return `https://${slug}.${MINI_APPS_SITE_DOMAIN}`;
}

/**
 * Whether publish should bake subdomain URLs into `home_url`. Production
 * always does; elsewhere it needs an explicit MINI_APPS_SITE_DOMAIN so local
 * and preview publishes keep pointing at their own origin's /mini/ path.
 */
export function siteDomainActiveForPublish(): boolean {
  return Boolean(process.env.MINI_APPS_SITE_DOMAIN) || process.env.VERCEL_ENV === "production";
}
