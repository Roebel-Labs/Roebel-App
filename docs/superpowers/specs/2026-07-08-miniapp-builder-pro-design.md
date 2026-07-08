# Mini-App Builder Pro — Lovable-grade editor, open SDK, MCP server

**Date:** 2026-07-08 · **Scope:** `apps/web`, `packages/miniapp-sdk`, docs
**Platform contract:** `docs/superpowers/specs/2026-07-03-netizen-mini-apps-design.md` (unchanged)
**Goal:** tonight, a mini app can be built professionally through ANY of four doors —
the `/editor` AI builder (with image upload), Claude Code + SDK, an external AI
editor (Lovable), or any MCP-capable agent — and managed in the personal dashboard.

Session note: built autonomously on the user's direct request ("extend and improve
the entire building process … tonight"); design decisions below are documented
instead of interactively approved.

---

## 1. Verified facts driving the design

- `@netizen-labs/miniapp-sdk@0.1.0` **is on npm** (2026-07-04), but this machine has
  no npm auth → we cannot publish 0.2.0 here. Generated HTML apps import
  `esm.sh/@netizen-labs/miniapp-sdk@0.1.0` — improvements would be stuck behind a
  publish. **Fix: self-host the built SDK bundle on the web origin.**
- z.ai coding-plan key: `glm-5.2` is **text-only** (`messages.content.type` rejects
  image parts — verified live), but **`glm-4.6v` accepts image_url parts on the same
  key/endpoint** (verified live). → vision sidecar, codegen mandate (GLM-5.2) intact.
- SDK standalone behavior today: `post()` throws `no Netizen host detected`;
  every call outside a host rejects or times out (30s). Bad for Lovable preview /
  local dev. Package ships raw TS (`main: src/index.ts`), no `dist/` → Vite
  consumers must transpile TS from node_modules (fragile).
- Builder/dev auth today = trusted `x-wallet-address` header (documented MVP gap).
- Supabase MCP is unauthenticated in this session → **no live DDL**; new tables
  ship as a staged migration + resilient code paths.
- Admin = HMAC cookie session; personal dashboard scoping = `developer_id` in the
  app layer (`list?mine=1`), already works.

## 2. Deliverables

### A. SDK v0.2.0 (`packages/miniapp-sdk`) — "works everywhere"

1. **Host detection + mock mode.** New exports:
   - `getHostEnvironment(): 'webview' | 'iframe' | 'standalone'`
   - Standalone (no host): the bridge enters **mock mode** instead of throwing —
     `ready()` resolves, `getContext()` returns a demo user (override via
     `window.__NETIZEN_MOCK__ = { context?, account?, balance? }`), wallet
     `getAccount()` → mock account or null, `getMuenzenBalance()` → mock,
     `grantReward()` → `{ granted: false, amount: 0 }`, `track()` no-ops,
     `haptics` no-op, `actions.share/openUrl` fall back to `navigator.share`/
     `window.open`. One `console.info` notice. **Apps built in Lovable or a plain
     browser now render and are fully demo-able without the Röbel host.**
   - In-host behavior is byte-for-byte unchanged (mock only activates when neither
     `ReactNativeWebView` nor a parent frame exists).
2. **Build + self-hosted bundle.** `tsup` already configured. Add root-served
   bundle: build → copy `dist/index.js` (ESM) to
   `apps/web/public/sdk/miniapp-sdk-0.2.0.mjs` + alias `miniapp-sdk.mjs`
   (checked in; regenerated via `packages/miniapp-sdk/scripts/sync-web.mjs`,
   wired as `pnpm --filter @netizen-labs/miniapp-sdk run sync-web`).
   `next.config` headers: `/sdk/*` gets `Access-Control-Allow-Origin: *` +
   immutable cache (same pattern as `/fonts`). `htmlPrompt.ts` switches the import
   to `https://www.roebel.app/sdk/miniapp-sdk.mjs` (absolute — works in srcdoc
   preview, `/mini/[slug]` sandbox, and any external host).
3. **npm publish staged** (not run): version bump to 0.2.0 + changeset; command in
   §6. esm.sh consumers keep working after the user publishes.

### B. `/editor` — Lovable-grade features

1. **Image upload (vision).** Composer accepts attachments (button, drag-drop,
   paste): up to 4 images, client-side downscale to ≤1280px JPEG (~≤1MB each), sent
   as data URLs in the `generate` POST. Server (`generate/route.ts`):
   when images present → one `glm-4.6v` call ("UI-Analyse": layout, screens,
   components, colors, text content, style — structured German brief) → brief is
   appended to that user turn for GLM-5.2. Brief also streams back a marker so the
   chat can show "Bild analysiert". Attachments render as thumbnails in the sent
   bubble (persisted in the localStorage session as compact thumbs only).
   Same pipeline powers "clone this screenshot" and "use my logo/photo" flows.
2. **Element inspect ("Bearbeiten" mode).** Preview toolbar toggle. The editor
   injects an inspector script into the preview `srcdoc` at render time (never into
   published HTML): hover outline, click → `netizen:inspect` postMessage with
   `{ selector, tag, text, classes, html (truncated), screen }`. Editor pins a chip
   ("Ausgewählt: …") and prepends the element context to the next chat message so
   GLM-5.2 makes a targeted edit. Esc/toggle clears.
3. **Runtime error capture + one-click fix.** Same injected script hooks
   `window.onerror` + `unhandledrejection` + `console.error` → `netizen:error`
   postMessage. Editor dedupes and shows a red "Fehler beheben" chip; clicking sends
   a structured fix request (error message + stack lines) through the normal
   iterate flow.
4. **Version history polish.** Stage header gets a version dropdown (v1…vN,
   timestamps, "Wiederherstellen") on top of the existing per-bubble restore pills.

### C. Personal dashboard — import + API keys + versions

1. **Import** (`/dashboard/mini-apps/import`, linked "App importieren"):
   - **Tab "URL"** (Lovable/Vercel/anywhere): paste `https://…` →
     `POST /api/mini-apps/import/inspect` fetches the page server-side and
     prefills the manifest (title, description, og-image/favicon → icon), embed
     headers checked (`X-Frame-Options`/`frame-ancestors`) with a warning if the
     host can't iframe it → existing `submit` route.
   - **Tab "HTML-Datei"** (Claude Code single-file): drop/paste a self-contained
     HTML file → draft manifest via existing `/api/mini-apps/manifest` → publish
     via existing `/api/mini-apps/publish` (served from `/mini/[slug]`).
   - **Tab "Claude Code & MCP"**: copy-paste setup snippets (llms link, MCP add
     command, API-key hint).
2. **Developer API keys** (`ApiKeysSection` on the dashboard; new endpoints
   `/api/mini-apps/keys` GET/POST/DELETE): key `nz_<40hex>`, shown once, stored as
   SHA-256 hash. Table (staged migration `supabase/migrations/20260708_developer_api_keys.sql`):
   `developer_api_keys(id, created_at, developer_id fk, name, key_prefix, key_hash unique,
   last_used_at, revoked_at)`, RLS service-role-only. Code degrades gracefully with
   a clear German error if the table isn't applied yet.
3. **Versions list** on `/dashboard/mini-apps/[id]`: render the `versions` array the
   API already returns (version, date, status badge).

### D. MCP server — `POST /api/mcp` (Streamable HTTP)

- Dependency `mcp-handler` (Vercel). Route `apps/web/src/app/api/[transport]/route.ts`
  → endpoint `https://www.roebel.app/api/mcp`. Streamable HTTP only (no SSE/Redis).
- **Auth:** `Authorization: Bearer nz_…` (API key → developer) or, fallback,
  `Bearer 0x<wallet>` (same trust tier as the existing `x-wallet-address` MVP auth;
  removed when SIWE lands). Docs/read-only tools work unauthenticated.
- **Tools** (all return compact JSON/text):
  | tool | auth | behavior |
  |---|---|---|
  | `get_started` | – | how the platform works + doc section index |
  | `get_docs` | – | `section: sdk\|design\|publish\|manifest\|all` → llms-full content |
  | `validate_html` | – | static checks (doctype, `actions.ready`, `data-screen` contract, size, SDK import) |
  | `list_my_apps` | ✓ | own apps: slug, status, home_url, budget |
  | `get_app` | ✓ | detail + versions + review notes |
  | `publish_html_app` | ✓ | single-file HTML + manifest → `publishHtmlMiniApp` (new or new-version) |
  | `submit_external_app` | ✓ | manifest w/ own `home_url` → `submitApp` |
  | `update_app_manifest` | ✓ | owner PATCH (re-enters review) |
  | `get_app_analytics` | ✓ | summary for own app |
- Reuses the existing data layer 1:1 — MCP is a thin surface, no new business logic.
- Claude Code setup: `claude mcp add --transport http netizen https://www.roebel.app/api/mcp --header "Authorization: Bearer nz_…"`.

### E. Docs for external builders

- `apps/web/public/mini-apps/llms.txt` (index) + `llms-full.txt` (complete machine
  guide: bridge, SDK API, mock mode, manifest, design system digest, publish paths,
  MCP + API-key setup, iframe-embed headers requirement, hard rules: `ready()`,
  German copy, never CRC, never raw wallets, 1-Münze cap).
- `/developers/mini-apps` page (German, EN hint): the four doors (Editor, Claude
  Code, Lovable, MCP), quickstart snippets, "Lovable prompt" copy block, links.
- SDK README updated (mock mode, CDN URL, llms links).

## 3. Explicitly out of scope tonight

- Expo app changes (dev-mode preview already shipped; OTA is user-run).
- SIWE auth hardening (API keys narrow the gap; full SIWE later).
- Deploying `miniapp-grant-reward` edge fn + applying migrations (Supabase MCP
  OAuth unavailable in this session — staged in §6).
- Multi-file/Next.js AI generation, custom domains, app monetization.

## 4. Key risks & mitigations

- **Vercel build memory** (exit-137 history): all new editor features are
  client-side or small route additions; MCP route is one handler. No new heavy deps
  besides `mcp-handler` (small). Verify with a local `pnpm build` of web.
- **glm-4.6v output wrapped in reasoning**: request with high max_tokens, strip
  `reasoning_content`, take `content`; fall back to passing the raw user text if
  the vision call fails (never block generation).
- **Checked-in SDK bundle drift**: `sync-web` script is the single generator;
  README + spec note to re-run it on SDK changes.

## 5. Definition of done (tonight)

1. An image dropped into `/editor` chat produces an app whose layout follows the
   mockup (vision brief visible in the chat).
2. Inspect mode: click a button in the preview, type "mach ihn grün", get a
   targeted edit. A thrown error in the preview surfaces a working "Fehler beheben".
3. A single-file HTML app built in Claude Code publishes via dashboard import
   **and** via MCP tool, appears in the personal dashboard as pending.
4. A Lovable-built app (SDK from npm, mock mode in Lovable's preview) submits via
   the URL import tab with manifest prefill.
5. `curl` against `/api/mcp` lists tools; `get_docs` + `publish_html_app` round-trip
   with a Bearer key (wallet fallback until migration applied).
6. Everything committed + pushed; staged commands for: npm publish, Supabase
   migration, Vercel env (`KIE_API_KEY` reminder).

## 6. Staged operator commands (user-run)

```bash
# 1) publish SDK 0.2.0 (needs npm login as netizen-labs owner)
cd packages/miniapp-sdk && npm publish

# 2) apply the API-keys migration (Supabase MCP or dashboard SQL editor)
#    supabase/migrations/20260708_developer_api_keys.sql

# 3) (still open from before) deploy miniapp-grant-reward edge fn + KIE_API_KEY on Vercel
```
