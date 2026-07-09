/**
 * Developer documentation for external mini-app builders — the single source
 * consumed by:
 *   • GET /mini-apps/llms.txt        (index — llms.txt convention)
 *   • GET /mini-apps/llms-full.txt   (complete machine-readable guide)
 *   • the MCP server's get_docs tool (/api/mcp)
 *   • /developers/mini-apps          (human page, links the above)
 *
 * The SDK/design/screen sections are imported from the AI builder's system
 * prompt (htmlPrompt.ts) so the /editor, Claude Code, Lovable and MCP paths
 * all build against the SAME contract. Those sections are German (the builder
 * mandates German UI copy anyway); framing/how-to text is English for maximum
 * agent compatibility.
 */
import {
  BOILERPLATE,
  COPY_RULES,
  DESIGN_SYSTEM,
  SCREEN_RULES,
  SDK_ESM_URL,
  SDK_REFERENCE,
  SDK_VERSION,
} from "./ai/htmlPrompt";
import { MINI_APPS_SITE_DOMAIN } from "./siteDomain";

export const DOCS_BASE_URL = "https://www.roebel.app";

/** Where a published single-file app is served (its own dedicated origin). */
const SERVED_AT = `https://<slug>.${MINI_APPS_SITE_DOMAIN}`;

const INTRO = `# Röbel Mini Apps — Developer Guide (Netizen platform)

A mini app is a standalone web app rendered inside the Röbel app (Expo WebView)
or a web iframe. It bundles \`@netizen-labs/miniapp-sdk\` (v${SDK_VERSION}) and talks to
the host over a postMessage bridge. Registry, review and rewards are managed by
the Röbel web app (${DOCS_BASE_URL}).

Hard rules (apps violating these fail review):
1. Call \`sdk.actions.ready()\` once your UI is mounted — otherwise the host splash never dismisses.
2. UI copy is GERMAN (target audience: citizens of Röbel/Müritz).
3. Never show a raw wallet address (use displayName, fallback "Jemand").
4. Never say "CRC", "Circles" or crypto jargon — the currency is "Röbel-Münzen" (symbol RÖ).
5. Rewards: request \`amount: 1\` — the server enforces a hard cap of 1 Münze per user per app per day.
6. \`getContext().user\` is UNTRUSTED (display only). Server-side trust = \`auth.getToken()\`.

## Four ways to build & ship

A) **AI editor (KI-Baukasten)** — ${DOCS_BASE_URL}/editor
   Chat (with image upload: mockups/screenshots/logos) → single-file HTML app →
   one-click publish into admin review. Served from ${SERVED_AT}.

B) **Single-file HTML with Claude Code (or any agent)**
   Produce ONE self-contained HTML document following the boilerplate + rules
   below. Publish it either in the dashboard (${DOCS_BASE_URL}/dashboard/mini-apps/import,
   tab "HTML-Datei") or via the MCP tool \`publish_html_app\`.

C) **Hosted app (Lovable, v0, Vercel, own server)**
   Any framework. Install the SDK from npm (\`npm i @netizen-labs/miniapp-sdk\`) or
   import the browser module from ${SDK_ESM_URL}.
   Your host must allow embedding: send \`Content-Security-Policy: frame-ancestors *\`
   (or at least the Röbel domains) and do NOT send X-Frame-Options DENY/SAMEORIGIN.
   Submit the URL in the dashboard (tab "Gehostete URL") or via MCP \`submit_external_app\`.

D) **MCP server** — ${DOCS_BASE_URL}/api/mcp (Streamable HTTP)
   Tools: get_started, get_docs, validate_html, list_my_apps, get_app,
   publish_html_app, submit_external_app, update_app_manifest, get_app_analytics.
   Auth: \`Authorization: Bearer nz_<api-key>\` — create keys at
   ${DOCS_BASE_URL}/dashboard/mini-apps/api. (Fallback during rollout: your
   wallet address as the bearer token.)
   Claude Code: \`claude mcp add --transport http netizen ${DOCS_BASE_URL}/api/mcp --header "Authorization: Bearer nz_KEY"\`

## Mock mode (SDK v0.2) — develop anywhere

If no Röbel host answers the bridge handshake within 1.5s (plain browser tab,
vite/next dev server, Lovable preview iframe), the SDK switches to a local mock:
ready() resolves, getContext() returns a demo user, getMuenzenBalance() returns
demo data, grantReward() resolves { granted: false }, track() no-ops, signing
rejects "unsupported". Check \`sdk.isMockMode()\` after \`await sdk.isReady\`.
Optional overrides (set before the SDK loads):
\`window.__NETIZEN_MOCK__ = { context: {...}, account: {address, chainId: 100}, balance: {...}, rewards: true }\`

## Review & rewards

Every submission lands as status "pending" in the admin review queue; admins
test it in a live playground and set it "live". Reward budgets start at 0 and
are granted by admins — grantReward on an unreviewed app rejects
"budget_exceeded". Analytics arrive automatically via sdk.track + host events.`;

const SINGLE_FILE_GUIDE = `## Single-file HTML apps (path B) — exact requirements

- ONE complete HTML document, starting with \`<!doctype html>\`.
- Use the boilerplate below VERBATIM as the document head (replace {APP_NAME});
  add your own <style> after it. It wires Tailwind (Play CDN) with the Röbel
  tokens, Mona Sans, and the screenshot-capture bridge the editor/store use.
- Import the SDK exactly: \`import { sdk } from "${SDK_ESM_URL}";\`
- Max 900 KB. Allowed external origins: cdn.tailwindcss.com, esm.sh, ${DOCS_BASE_URL}/fonts, ${DOCS_BASE_URL}/sdk.
- localStorage is often UNAVAILABLE in the production sandbox (opaque origin) —
  wrap in try/catch; the app must fully work without persisted state.
- End the document (after </html>) with exactly one comment:
  \`<!--NOTES: 2-3 German sentences about what the app does and how to test it.-->\`

${BOILERPLATE}
`;

const PUBLISH_API = `## Publishing API (what the dashboard/MCP call for you)

- POST ${DOCS_BASE_URL}/api/mini-apps/publish
  headers: x-wallet-address: 0x… (or use the MCP with an API key)
  body: { html: "<!doctype html>…", manifest: { name, slug, description,
          category, tags[], permissions[], primaryColor, iconSvg? } }
  → stores the HTML, serves it at ${SERVED_AT}, creates the
    registry row (status "pending"). Re-publishing the same slug (same
    developer) adds a new version.
- POST ${DOCS_BASE_URL}/api/mini-apps/submit — hosted apps (path C)
  body: { manifest: { slug, name, iconUrl, homeUrl, description, category,
          tags[], permissions[], primaryColor } }
- Categories: community | governance | finance | utility | games | education | news | culture | environment
- Permissions (request only what you use): wallet | rewards | notifications | circles | share`;

export type DocsSection = "sdk" | "design" | "screens" | "copy" | "publish" | "all";

export function getDocsSection(section: DocsSection): string {
  switch (section) {
    case "sdk":
      return SDK_REFERENCE;
    case "design":
      return DESIGN_SYSTEM;
    case "screens":
      return SCREEN_RULES;
    case "copy":
      return COPY_RULES;
    case "publish":
      return `${PUBLISH_API}\n\n${SINGLE_FILE_GUIDE}`;
    case "all":
      return buildLlmsFullTxt();
  }
}

export function buildLlmsFullTxt(): string {
  return [INTRO, SDK_REFERENCE, SCREEN_RULES, DESIGN_SYSTEM, COPY_RULES, SINGLE_FILE_GUIDE, PUBLISH_API].join(
    "\n\n---\n\n",
  );
}

export function buildLlmsIndexTxt(): string {
  return `# Röbel Mini Apps (Netizen platform)

> Build mini apps for the Röbel civic app: single-file HTML or any hosted web
> app, bundling @netizen-labs/miniapp-sdk (postMessage bridge to the host).
> German UI, Röbel design system, server-authorized rewards.

## Docs

- [Full developer guide](${DOCS_BASE_URL}/mini-apps/llms-full.txt): everything —
  SDK reference, bridge, screens contract, design system, copy rules,
  single-file boilerplate, publishing API, MCP server.

## Tools

- MCP server (Streamable HTTP): ${DOCS_BASE_URL}/api/mcp — tools for validating
  and publishing apps. Auth: Bearer nz_<api-key> (${DOCS_BASE_URL}/dashboard/mini-apps/api).
- AI editor: ${DOCS_BASE_URL}/editor
- SDK on npm: @netizen-labs/miniapp-sdk · browser module: ${SDK_ESM_URL}`;
}
