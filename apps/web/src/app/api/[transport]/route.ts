/**
 * Netizen Mini Apps MCP server — POST https://www.roebel.app/api/mcp
 * (Streamable HTTP via mcp-handler; SSE is not enabled — no Redis).
 *
 * Lets ANY MCP-capable agent (Claude Code, Cursor, custom agents) build and
 * publish Röbel mini apps: docs, validation, listing, single-file publishing,
 * external-URL submission, manifest updates, analytics.
 *
 * Auth: `Authorization: Bearer nz_<api-key>` (dashboard → API & MCP). During
 * rollout (until the developer_api_keys migration is applied) a wallet address
 * as bearer token is accepted — the same MVP trust tier as the dashboard's
 * x-wallet-address header. Docs/validate tools work unauthenticated.
 *
 * Claude Code:
 *   claude mcp add --transport http netizen https://www.roebel.app/api/mcp \
 *     --header "Authorization: Bearer nz_KEY"
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { publishHtmlMiniApp } from "@/lib/miniapp/ai/publishHtml";
import { manifestDraftSchema } from "@/lib/miniapp/ai/manifest";
import {
  getApp,
  getOrCreateDeveloper,
  listApps,
  listVersions,
  queryAnalytics,
  submitApp,
  updateAppManifest,
} from "@/lib/miniapp/data";
import { deleteData, listData, setData } from "@/lib/miniapp/dataStore";
import { importImagesFromWebsite } from "@/lib/miniapp/images/importFromWebsite";
import { getDocsSection, buildLlmsFullTxt, DOCS_BASE_URL } from "@/lib/miniapp/devdocs";
import { MINI_APPS_SITE_DOMAIN } from "@/lib/miniapp/siteDomain";
import { verifyApiKey } from "@/lib/miniapp/keys";
import { validateManifest } from "@/lib/miniapp/manifest";
import { SDK_ESM_URL } from "@/lib/miniapp/ai/htmlPrompt";
import type { DeveloperRow, MiniAppRow } from "@/lib/miniapp/types";

export const maxDuration = 60;
export const runtime = "nodejs";

// ── auth ─────────────────────────────────────────────────────────────────────

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  let dev: DeveloperRow | null = null;
  if (bearerToken.startsWith("nz_")) {
    dev = await verifyApiKey(bearerToken);
  } else if (/^0x[0-9a-fA-F]{40}$/.test(bearerToken)) {
    // Rollout fallback — same trust tier as the dashboard's wallet header.
    dev = await getOrCreateDeveloper(bearerToken);
  }
  if (!dev) return undefined;
  return {
    token: bearerToken,
    scopes: ["miniapps"],
    clientId: dev.wallet,
    extra: { developerId: dev.id, wallet: dev.wallet },
  };
}

function requireDev(extra: { authInfo?: AuthInfo }): { developerId: string; wallet: string } {
  const info = extra.authInfo?.extra as { developerId?: string; wallet?: string } | undefined;
  if (!info?.developerId) {
    throw new Error(
      `Nicht angemeldet. Sende "Authorization: Bearer nz_<API-Key>" — Key erstellen unter ${DOCS_BASE_URL}/dashboard/mini-apps/api (Übergangsweise geht auch die Wallet-Adresse als Token).`,
    );
  }
  return { developerId: info.developerId, wallet: info.wallet ?? "" };
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function json(v: unknown) {
  return text(JSON.stringify(v, null, 2));
}

function appSummary(a: MiniAppRow) {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    status: a.status,
    category: a.category,
    home_url: a.home_url,
    source: a.source,
    reward_budget: a.reward_budget,
    reward_spent: a.reward_spent,
    review_notes: a.review_notes,
    updated_at: a.updated_at,
  };
}

/** Static single-file checks — mirrors publishHtml's gate + the screens contract. */
function validateHtmlDocument(html: string): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const head = html.trimStart().slice(0, 200).toLowerCase();
  if (!head.startsWith("<!doctype html") && !head.startsWith("<html")) {
    errors.push("Document must start with <!doctype html>.");
  }
  if (html.length < 500) errors.push("Document is too small (<500 bytes).");
  if (html.length > 900_000) errors.push("Document is too large (>900 KB).");
  if (!html.includes("actions.ready")) {
    errors.push("Missing sdk.actions.ready() — the host splash would never dismiss.");
  }
  if (!/<\/html\s*>/i.test(html.slice(-400))) {
    errors.push("Document is incomplete (missing </html>) — likely truncated output.");
  }
  if (!/data-screen=/.test(html)) {
    warnings.push(
      'No <section data-screen="…"> structure found — the editor canvas and store previews work better with it (see get_docs section "screens").',
    );
  }
  // Bottom safe area: the host WebView extends under the phone's home
  // indicator / gesture bar — fixed bottom bars must pad for it.
  const hasFixedBottom = /class="[^"]*\b(?:fixed|sticky)\b[^"]*\bbottom-0\b|class="[^"]*\bbottom-0\b[^"]*\b(?:fixed|sticky)\b/.test(
    html,
  );
  const usesSafeBottom =
    /class="[^"]*\bpb-safe\b/.test(html) || /pb-\[calc\([^\]]*--safe-bottom/.test(html);
  if (hasFixedBottom && !usesSafeBottom) {
    warnings.push(
      'Fixed bottom element without safe-area padding — on phones it sits under the home indicator / gesture bar. Add the boilerplate class "pb-safe" to the bar (and end scrollable content with pb-[calc(5rem+var(--safe-bottom))]).',
    );
  }
  if (!html.includes("miniapp-sdk")) {
    warnings.push(`Netizen SDK import not detected — expected: import { sdk } from "${SDK_ESM_URL}".`);
  }
  if (/lang="en"/i.test(html)) warnings.push('UI copy must be German (html lang="de").');
  return { ok: errors.length === 0, errors, warnings };
}

// ── server ───────────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "get_started",
      "How the Röbel/Netizen mini-app platform works and how to build + publish an app (start here).",
      {},
      async () =>
        text(
          `Röbel Mini Apps: build a German-language mini app for the Röbel civic app.\n\n` +
            `Fast path (recommended for agents):\n` +
            `1. get_docs {section:"all"} — read the full contract (SDK, screens, design, copy rules, boilerplate).\n` +
            `2. Build ONE self-contained HTML document following it.\n` +
            `3. validate_html {html} — fix everything it reports.\n` +
            `4. publish_html_app {html, manifest} — creates/updates your app, serves it at https://<slug>.${MINI_APPS_SITE_DOMAIN}, status "pending" until an admin approves.\n\n` +
            `Hosted apps (Lovable/Vercel/own server): build with @netizen-labs/miniapp-sdk from npm, allow iframe embedding (frame-ancestors *), then submit_external_app {manifest incl. homeUrl}.\n\n` +
            `Auth for publishing tools: Authorization: Bearer nz_<api-key> — create at ${DOCS_BASE_URL}/dashboard/mini-apps/api.`,
        ),
    );

    server.tool(
      "get_docs",
      "Developer documentation. Sections: sdk (SDK reference), screens (mandatory screen structure), design (design system), copy (German copy rules), publish (single-file boilerplate + publishing API), all (everything).",
      { section: z.enum(["sdk", "screens", "design", "copy", "publish", "all"]).default("all") },
      async ({ section }) => text(getDocsSection(section)),
    );

    server.tool(
      "validate_html",
      "Statically validate a single-file mini-app HTML document (doctype, ready() call, size, screens contract, SDK import) BEFORE publishing.",
      { html: z.string().min(1).max(1_000_000) },
      async ({ html }) => json(validateHtmlDocument(html)),
    );

    server.tool(
      "list_my_apps",
      "List the authenticated developer's mini apps (slug, status, URLs, budgets).",
      {},
      async (_args, extra) => {
        const { developerId } = requireDev(extra);
        const apps = await listApps({ developerId });
        return json({ apps: apps.map(appSummary) });
      },
    );

    server.tool(
      "get_app",
      "Get one of your apps (by slug or id) incl. versions and review notes.",
      { app: z.string().min(1).describe("slug or uuid") },
      async ({ app }, extra) => {
        const { developerId } = requireDev(extra);
        const row = await getApp(app);
        if (!row || row.developer_id !== developerId) {
          throw new Error(`App "${app}" not found for this account.`);
        }
        const versions = await listVersions(row.id);
        return json({
          app: appSummary(row),
          versions: versions.map((v) => ({
            version: v.version,
            status: v.status,
            created_at: v.created_at,
          })),
        });
      },
    );

    server.tool(
      "publish_html_app",
      `Publish a single-file HTML mini app (new app, or a new version when the slug already belongs to you). The app is served from https://<slug>.${MINI_APPS_SITE_DOMAIN} and enters admin review (status pending).`,
      {
        html: z.string().min(500).max(900_000),
        manifest: manifestDraftSchema.describe(
          "Store manifest: name (≤32), slug (lowercase url-safe), description (≤200, German), category, tags (≤5), permissions (only what the app uses), primaryColor, optional iconSvg (inline SVG, viewBox 0 0 64 64)",
        ),
      },
      async ({ html, manifest }, extra) => {
        const { developerId } = requireDev(extra);
        const validation = validateHtmlDocument(html);
        if (!validation.ok) {
          return json({ published: false, ...validation });
        }
        const result = await publishHtmlMiniApp({
          html,
          manifest,
          developerId,
          origin: DOCS_BASE_URL,
        });
        if (!result.ok) {
          return json({ published: false, error: result.error, errorCode: result.errorCode });
        }
        return json({
          published: true,
          slug: result.slug,
          homeUrl: result.homeUrl,
          version: result.version,
          republished: result.republished,
          status: "pending",
          note: "Ein Admin prüft die App im Playground und schaltet sie live.",
          warnings: validation.warnings,
        });
      },
    );

    server.tool(
      "submit_external_app",
      "Submit an app hosted elsewhere (Lovable, Vercel, own server) to the store. The page must allow iframe embedding (frame-ancestors *) and bundle @netizen-labs/miniapp-sdk.",
      {
        manifest: z.object({
          slug: z.string().min(2).max(48),
          name: z.string().min(1).max(32),
          iconUrl: z.string().url().or(z.literal("")).default(""),
          homeUrl: z.string().url(),
          description: z.string().min(1).max(200),
          category: z.string(),
          tags: z.array(z.string().max(20)).max(5).default([]),
          permissions: z.array(z.string()).default([]),
          primaryColor: z.string().default("#00498B"),
        }),
      },
      async ({ manifest }, extra) => {
        const { developerId } = requireDev(extra);
        const clean = validateManifest(manifest);
        const app = await submitApp({ manifest: clean, developerId, source: "external" });
        return json({ submitted: true, app: appSummary(app), status: "pending" });
      },
    );

    server.tool(
      "update_app_manifest",
      "Update the store manifest of one of your apps (name, description, category, tags, permissions, …). The app re-enters review.",
      {
        app: z.string().min(1).describe("slug or uuid"),
        manifest: z.record(z.unknown()).describe("Full MiniAppManifest (same shape as submit_external_app)"),
      },
      async ({ app, manifest }, extra) => {
        const { developerId } = requireDev(extra);
        const row = await getApp(app);
        if (!row || row.developer_id !== developerId) {
          throw new Error(`App "${app}" not found for this account.`);
        }
        const updated = await updateAppManifest(row.id, manifest);
        return json({ updated: true, app: appSummary(updated) });
      },
    );

    server.tool(
      "get_app_analytics",
      "Analytics summary (opens, unique users, top events) for one of your apps.",
      {
        app: z.string().min(1).describe("slug or uuid"),
        range: z.enum(["24h", "7d", "30d", "90d"]).default("30d"),
      },
      async ({ app, range }, extra) => {
        const { developerId } = requireDev(extra);
        const row = await getApp(app);
        if (!row || row.developer_id !== developerId) {
          throw new Error(`App "${app}" not found for this account.`);
        }
        return json(await queryAnalytics(row.id, range));
      },
    );

    server.tool(
      "get_app_content",
      "List the app's shared content (Mini-CMS, scope 'app') — the keys the app reads at runtime via sdk.data.get/list.",
      { app: z.string().min(1).describe("slug or uuid") },
      async ({ app }, extra) => {
        const { developerId } = requireDev(extra);
        const row = await getApp(app);
        if (!row || row.developer_id !== developerId) {
          throw new Error(`App "${app}" not found for this account.`);
        }
        return json({ items: await listData(row.id, "app") });
      },
    );

    server.tool(
      "set_app_content",
      "Create or update one content key of your app (Mini-CMS). The running app picks it up on next load — no re-publish needed. Value is arbitrary JSON.",
      {
        app: z.string().min(1).describe("slug or uuid"),
        key: z.string().min(1).max(64).describe("a-z0-9-_. (e.g. 'lektionen')"),
        value: z.unknown().describe("JSON value (string, array, object, …)"),
      },
      async ({ app, key, value }, extra) => {
        const { developerId } = requireDev(extra);
        const row = await getApp(app);
        if (!row || row.developer_id !== developerId) {
          throw new Error(`App "${app}" not found for this account.`);
        }
        const item = await setData(row.id, "app", key, value, null);
        return json({ ok: true, item });
      },
    );

    server.tool(
      "import_images_from_url",
      "Import images from an external website into one of your apps' Mini-CMS: fetches the page, stores its images on the Röbel platform (no hotlinking) and writes [{url, alt}] into the content key (default 'bilder'). The app reads them at runtime via sdk.data.get(key).",
      {
        app: z.string().min(1).describe("slug or uuid"),
        url: z.string().url().describe("website (or direct image URL) to import from"),
        key: z.string().min(1).max(64).optional().describe("content key, default 'bilder'"),
        limit: z.number().int().min(1).max(16).optional().describe("max images, default 8"),
      },
      async ({ app, url, key, limit }, extra) => {
        const { developerId } = requireDev(extra);
        const row = await getApp(app);
        if (!row || row.developer_id !== developerId) {
          throw new Error(`App "${app}" not found for this account.`);
        }
        const result = await importImagesFromWebsite({ appId: row.id, pageUrl: url, key, limit });
        return json({ ok: true, ...result });
      },
    );

    server.tool(
      "delete_app_content",
      "Delete one content key of your app (Mini-CMS).",
      {
        app: z.string().min(1).describe("slug or uuid"),
        key: z.string().min(1).max(64),
      },
      async ({ app, key }, extra) => {
        const { developerId } = requireDev(extra);
        const row = await getApp(app);
        if (!row || row.developer_id !== developerId) {
          throw new Error(`App "${app}" not found for this account.`);
        }
        await deleteData(row.id, "app", key, null);
        return json({ ok: true });
      },
    );

    server.tool(
      "get_llms_full",
      "The complete llms-full.txt developer guide as one document (same as get_docs section 'all').",
      {},
      async () => text(buildLlmsFullTxt()),
    );
  },
  {
    serverInfo: { name: "netizen-miniapps", version: "1.0.0" },
  },
  {
    basePath: "/api",
    verboseLogs: false,
    maxDuration: 60,
    disableSse: true,
  },
);

const authedHandler = withMcpAuth(handler, verifyToken, { required: false });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
