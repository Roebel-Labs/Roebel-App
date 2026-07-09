/**
 * Managed publish for single-file AI-built mini apps (builder v2).
 *
 * Stores the complete HTML document on a `mini_app_versions` row and registers
 * the app in the review queue (`mini_apps`: source='ai_builder', status='pending',
 * reward_budget 0). The app is served by `GET /mini/[slug]` from this web app —
 * no filesystem writes, no external deploy pipeline; works on Vercel.
 *
 * Re-publish: the owning developer can publish the same slug again — this adds
 * a new version row and puts the app back into review.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { siteDomainActiveForPublish, siteOriginForSlug } from "../siteDomain";
import { manifestDraftSchema, safeIconDataUri, type ManifestDraft } from "./manifest";

/**
 * Slugs that must never be claimed (existing apps, template, route namespaces —
 * and, since slugs are also *.roebel.site subdomains, well-known DNS/infra and
 * product hostnames someone could squat for phishing).
 */
const RESERVED_SLUGS = new Set([
  "_template",
  "roebel-data",
  "preview",
  "new",
  "api",
  "admin",
  "mini",
  "app",
  // DNS / mail / infra labels
  "www",
  "mail",
  "smtp",
  "imap",
  "pop",
  "mx",
  "ns1",
  "ns2",
  "ftp",
  "cdn",
  "static",
  "assets",
  "vercel",
  // product / trust surfaces
  "editor",
  "dashboard",
  "store",
  "docs",
  "dev",
  "blog",
  "status",
  "help",
  "support",
  "login",
  "auth",
  "sdk",
  "mcp",
  "roebel",
]);

const HTML_MIN_BYTES = 500;
const HTML_MAX_BYTES = 900_000;

export interface PublishHtmlResult {
  ok: boolean;
  slug: string;
  miniAppId?: string;
  homeUrl: string;
  version?: string;
  /** true when this publish added a version to an existing app of the same developer */
  republished?: boolean;
  status: "pending";
  error?: string;
  errorCode?: "invalid_manifest" | "invalid_html" | "slug_reserved" | "slug_taken" | "db_error";
}

/**
 * Where the app will be served. On production every app gets its own origin
 * (https://<slug>.roebel.site); the wildcard host is rewritten back to
 * /mini/[slug] in next.config.mjs. Local/preview publishes keep the request
 * origin's /mini/ path so the URL stays openable there.
 */
export function homeUrlForSlug(slug: string, origin: string): string {
  if (siteDomainActiveForPublish()) {
    return siteOriginForSlug(slug);
  }
  const base = process.env.MINI_APPS_WEB_ORIGIN || origin;
  return `${base.replace(/\/$/, "")}/mini/${slug}`;
}

function fail(
  slug: string,
  errorCode: NonNullable<PublishHtmlResult["errorCode"]>,
  error: string,
): PublishHtmlResult {
  return { ok: false, slug, homeUrl: "", status: "pending", error, errorCode };
}

export async function publishHtmlMiniApp(input: {
  html: unknown;
  manifest: unknown;
  developerId: string | null;
  origin: string;
}): Promise<PublishHtmlResult> {
  // 1. Validate the manifest (model + user edited — untrusted).
  const parsedManifest = manifestDraftSchema.safeParse(input.manifest);
  if (!parsedManifest.success) {
    const detail = parsedManifest.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return fail("", "invalid_manifest", `invalid_manifest: ${detail}`);
  }
  const manifest: ManifestDraft = parsedManifest.data;
  const slug = manifest.slug;

  if (RESERVED_SLUGS.has(slug)) {
    return fail(slug, "slug_reserved", "slug_reserved");
  }

  // 2. Validate the HTML document (untrusted model output; served verbatim).
  if (typeof input.html !== "string") {
    return fail(slug, "invalid_html", "invalid_html: not a string");
  }
  const html = input.html.trim();
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes < HTML_MIN_BYTES || bytes > HTML_MAX_BYTES) {
    return fail(slug, "invalid_html", `invalid_html: size ${bytes} out of bounds`);
  }
  const lower = html.slice(0, 400).toLowerCase();
  if (!lower.startsWith("<!doctype html") && !lower.startsWith("<html")) {
    return fail(slug, "invalid_html", "invalid_html: not an HTML document");
  }
  // The host splash never dismisses without ready(); refuse to ship such an app.
  if (!html.includes("actions.ready")) {
    return fail(slug, "invalid_html", "invalid_html: missing sdk.actions.ready() call");
  }
  // A document without </html> was cut off mid-stream (e.g. the model's output
  // budget) — its script is broken and the app would hang at the splash.
  if (!/<\/html\s*>/i.test(html.slice(-400))) {
    return fail(
      slug,
      "invalid_html",
      "invalid_html: document is incomplete (missing </html>) — the generation was truncated",
    );
  }

  const homeUrl = homeUrlForSlug(slug, input.origin);
  const iconUrl = safeIconDataUri(manifest.iconSvg);
  const supabase = createAdminClient();

  // 3. Existing slug → same developer may re-publish; anyone else conflicts.
  const { data: existing, error: lookupErr } = await supabase
    .from("mini_apps")
    .select("id, developer_id, source")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupErr) {
    return fail(slug, "db_error", `registry_lookup_failed: ${lookupErr.message}`);
  }

  const appFields = {
    name: manifest.name,
    icon_url: iconUrl,
    home_url: homeUrl,
    description: manifest.description,
    category: manifest.category,
    tags: manifest.tags ?? [],
    permissions: manifest.permissions ?? [],
    primary_color: manifest.primaryColor ?? "#00498B",
    status: "pending" as const,
  };

  let miniAppId: string;
  let republished = false;

  if (existing) {
    const ownedBySameDeveloper =
      existing.developer_id != null && existing.developer_id === input.developerId;
    if (!ownedBySameDeveloper || existing.source !== "ai_builder") {
      return fail(slug, "slug_taken", "slug_taken");
    }
    // Re-publish without a fresh icon keeps the existing one instead of nulling it.
    const { icon_url: newIcon, ...withoutIcon } = appFields;
    const { error: updateErr } = await supabase
      .from("mini_apps")
      .update(newIcon ? appFields : withoutIcon)
      .eq("id", existing.id);
    if (updateErr) {
      return fail(slug, "db_error", `registry_update_failed: ${updateErr.message}`);
    }
    miniAppId = existing.id;
    republished = true;
  } else {
    const { data: row, error: insertErr } = await supabase
      .from("mini_apps")
      .insert({
        developer_id: input.developerId,
        slug,
        ...appFields,
        screenshots: [],
        source: "ai_builder",
        reward_budget: 0,
      })
      .select("id")
      .single();
    if (insertErr || !row) {
      return fail(slug, "db_error", `registry_insert_failed: ${insertErr?.message ?? "no row"}`);
    }
    miniAppId = row.id;
  }

  // 4. Version row carries the actual app (the served HTML).
  const { count } = await supabase
    .from("mini_app_versions")
    .select("id", { count: "exact", head: true })
    .eq("mini_app_id", miniAppId);
  const version = `${(count ?? 0) + 1}.0.0`;

  const { error: versionErr } = await supabase.from("mini_app_versions").insert({
    mini_app_id: miniAppId,
    version,
    home_url: homeUrl,
    manifest: { ...manifest, iconSvg: undefined, iconUrl, homeUrl },
    status: "pending",
    html,
  });
  if (versionErr) {
    return fail(slug, "db_error", `version_insert_failed: ${versionErr.message}`);
  }

  // 5. Mini-CMS: register every sdk.data.get("<key>") the code references so
  // the keys show up in the dashboard "Inhalte" section — also when the CMS
  // was requested mid-chat ("richte ein CMS ein") instead of via the
  // pre-flight card. Creates MISSING keys with value null (the app's built-in
  // fallback shows until content is filled); never overwrites existing
  // content. Best-effort — publishing must not fail on a missing data table.
  await registerReferencedDataKeys(miniAppId, html);

  return { ok: true, slug, miniAppId, homeUrl, version, republished, status: "pending" };
}

async function registerReferencedDataKeys(miniAppId: string, html: string): Promise<void> {
  try {
    const keys = new Set<string>();
    const re = /sdk\s*\.\s*data\s*\.\s*get\s*\(\s*["'`]([a-z0-9][a-z0-9-_.]{0,63})["'`]/g;
    for (let m = re.exec(html); m && keys.size < 20; m = re.exec(html)) keys.add(m[1]);
    if (keys.size === 0) return;
    const { getData, setData } = await import("../dataStore");
    for (const key of keys) {
      try {
        const existing = await getData(miniAppId, "app", key);
        if (!existing) await setData(miniAppId, "app", key, null, null);
      } catch {
        return; // data table not applied yet / transient — skip silently
      }
    }
  } catch (e) {
    console.error("[mini-apps/publish] data-key registration skipped", e);
  }
}
