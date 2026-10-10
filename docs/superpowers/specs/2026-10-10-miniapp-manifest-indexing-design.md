# Mini apps: self-hosted apps + indexed manifest

**Date:** 2026-10-10 · **Status:** draft, awaiting Max's review · **Branding:** Röbel (Ortis rebrand comes later)

## 1. Intent

Builders, whatever they use (the `/editor` AI builder, their own Claude Code, Codex, Lovable), deploy their mini app **on their own hosting** (Vercel, Netlify, Lovable, own server) and add **one manifest file**. Röbel **indexes** that manifest, like Farcaster / Base do, and the app appears in the builder's existing dashboard and in the admin review queue. "Publish to the Röbel Mini App Store" must be something an agent can do alone from one instruction URL.

Also:
- The mini-app platform gets its own entry point at `roebel.app/mini-apps` (a placeholder landing page for now) instead of being reached through Sommercamp.
- The dashboard `/dashboard/mini-apps` stays as it is.
- First real case: the contributor game `GiraeffleAeffle/stadtstack-spiel`. That repo is not reachable for Max's GitHub account yet, so it is blocked on access.

**Success:** an agent given *"Lies roebel.app/mini-apps/publish.md und veröffentliche diese App im Röbel Mini App Store"* adds the SDK, deploys, writes the manifest and registers it. The app then shows as `pending` in the owner's dashboard. After admin approval it is live in the Expo store, and later manifest edits flow in without taking the live app offline.

## 2. Out of scope

- Ortis branding and multi-tenant (later).
- Hosting builders' files (no folder upload, no CLI). The AI editor's existing single-file hosting on `<slug>.roebel.site` stays unchanged.
- Signed `accountAssociation` ownership proofs. The manifest's `owner` field is the proof (decision 2026-10-10).
- MCP changes beyond one new tool (§6). Server-side install counts. GitHub auto-deploy.

## 3. The manifest

**Location:** `https://<host>/.well-known/roebel-miniapp.json`, where `<host>` is the origin of `homeUrl`. One app per origin.

```json
{
  "owner": "0x1234…abcd",
  "miniapp": {
    "version": "1",
    "slug": "stadtstack-spiel",
    "name": "Stadtstack",
    "homeUrl": "https://stadtstack-spiel.vercel.app",
    "iconUrl": "https://stadtstack-spiel.vercel.app/icon.png",
    "description": "…",
    "category": "games",
    "tags": ["stadt", "spiel"],
    "screenshots": ["https://…/1.png"],
    "permissions": ["share"],
    "primaryColor": "#00498B"
  }
}
```

**Rules:**
- `owner`: required, an EVM address (the builder's Röbel wallet). It is stored lowercased.
- `miniapp`: validated by the existing `validateManifest()` (`lib/miniapp/manifest.ts`), with two additions:
  - `slug` is **optional**. If it is missing, it is derived from `name` (kebab-case, collisions get a `-2` suffix). Once assigned, it is fixed for that origin.
  - `homeUrl` must be on the **same origin** as the manifest URL.
- The field names inside `miniapp` deliberately mirror Farcaster's `farcaster.json` `miniapp` object (`version`, `name`, `homeUrl`, `iconUrl`, `primaryCategory` ↔ `category`, `tags`, `screenshotUrls` ↔ `screenshots`). An app can then serve both files from the same data. We don't read `farcaster.json` in v1.

**Ownership:** placing the file on the domain proves control of the origin, the same model as DNS-TXT verification. The `owner` wallet gets a `developers` row via `getOrCreateDeveloper()` if it has none. Abuse case: someone names your wallet as owner of their app. The app lands `pending` in your dashboard, and you or the admin reject it. That is accepted.

**Origin already claimed:**
- Same owner: it is a re-index.
- Different owner: registration is refused with 409 `origin_claimed`. The admin can reassign the owner in the admin app page (a new "Besitzer ändern" action).

## 4. Registration and validation API (apps/web)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/mini-apps/validate?url=` | none | Fetch and validate only. Returns `{ ok, manifest, errors[], warnings[] }`. Warnings = embed headers (reused from `import/inspect`), unreachable icon, missing SDK `ready()` cannot be checked so it's a doc note only. |
| `POST /api/mini-apps/register` `{ url }` | none | Fetch, validate, then create or update (§5). Returns `{ app: { id, slug, status }, dashboardUrl, statusUrl }`. |

Both accept any URL on the app's origin and normalize it to `<origin>/.well-known/roebel-miniapp.json`.

**Fetch safety (SSRF):** `lib/miniapp/fetchManifest.ts`
- https only, default port only.
- Resolve DNS and reject private, loopback, link-local and metadata ranges (IPv4 + IPv6).
- At most 3 redirects, each re-checked; redirects must stay on the same origin.
- 5 s timeout, 64 KB body cap, `content-type` must contain `json`.
- Rate limit `register` to 10/hour per IP and 1/minute per origin, using the existing rate-limit helper if one exists, otherwise a small table-backed limiter.

## 5. Indexing and versioning

**Data:** one migration `supabase/migrations/20261010_mini_app_manifest_indexing.sql`.
- `mini_apps`:
  - `origin text unique` (null for single-file and AI-builder apps)
  - `manifest_url text`
  - `last_indexed_at timestamptz`
  - `index_error text`
  - `source` gains the value `indexed`
- `mini_app_versions`: `manifest_hash text`, the sha256 of the canonical `miniapp` JSON, used to skip unchanged re-indexes.

**Logic** (`lib/miniapp/indexing.ts`, `indexOrigin(origin)`):
1. Fetch and validate (§4).
2. **New origin:**
   - Insert into `mini_apps`: `status='pending'`, `source='indexed'`, fields from the manifest.
   - Insert a version row with `pending` status and the hash.
3. **Known origin, hash unchanged:** only set `last_indexed_at` and clear `index_error`.
4. **Known origin, hash changed:**
   - App not live (pending, rejected, draft): apply the fields to `mini_apps` directly, add a new pending version, and set the status to `pending` (a resubmit).
   - App **live**: do **not** touch the `mini_apps` store fields. Add a new **pending version** only. Approving that version in admin copies its manifest onto `mini_apps`; it reuses the existing `reviewApp` and `mini_app_versions` flow, extended to apply version manifests. The store keeps showing the approved data until then.
   - Rejected or suspended apps stay rejected or suspended: the new version is recorded, but the status does not change.
5. **Fetch fails or the manifest is invalid** on a known origin: set `index_error` and `last_indexed_at`, and change nothing else. A live app stays live. Admin sees the error badge, and the kill switch remains a manual action.

**Re-index triggers:**
- `POST /register` again (an agent republish).
- The dashboard button "Manifest neu laden" (owner only).
- Daily cron `/api/cron/mini-apps-reindex` (added to `apps/web/vercel.json`, `0 5 * * *`, `CRON_SECRET`-guarded like the other crons), covering every `mini_apps` row with an `origin`.

## 6. Builder-facing surfaces

- **`/mini-apps` landing page (new, placeholder).** Hero "Röbel Mini Apps", then three ways to publish:
  1. Use the KI-Baukasten (`/editor`).
  2. Tell your agent (the copyable prompt plus a link to `publish.md`).
  3. Lovable / any host (URL form → `register`).

  It links to the dashboard and the developer docs. It also fixes the existing 404 that the bare `roebel.site` redirects to.
- **`/mini-apps/publish.md`** (route handler, `text/markdown`). The agent recipe, kept short:
  1. Add the SDK and call `sdk.actions.ready()`. Both npm and the CDN `<script type="module">` snippet are given.
  2. Deploy anywhere and allow iframe embedding.
  3. Write `.well-known/roebel-miniapp.json`. Includes the framework notes: Next.js `public/.well-known/`, Vite `public/.well-known/`, Lovable `public/.well-known/`.
  4. Validate with `curl …/validate`, then `curl -X POST …/register`, and print the returned dashboard URL to the user.
  5. Ask the user for their Röbel wallet address for `owner` if it is unknown, and say where to find it (Röbel App → Profil).

  `llms.txt` and `llms-full.txt` link to it, and `/developers/mini-apps` gets the same flow as one of its ways.
- **Dashboard** (`/dashboard/mini-apps`):
  - "Per URL hinzufügen" (calls `register`; the owner must equal the logged-in wallet, otherwise the server error is shown).
  - On indexed apps: the manifest URL, last indexed time, `index_error`, and the button "Manifest neu laden".
  - Otherwise unchanged.
- **Developer MCP:** one new tool, `register_app_url { url }`, which wraps `register` so MCP-connected agents can do the same.
- **Sommercamp:**
  - Remove the dashboard CTA in `RegistrationCard.tsx` and the `?welcome=sommercamp` banner in `dashboard/mini-apps/page.tsx`.
  - The landing page itself stays as a hackathon record; its copy is not rewritten.

## 7. Admin

- The review queue shows `source='indexed'` apps with origin, owner and the manifest diff of a pending version against the live fields.
- Approving a pending version of a live app applies its manifest.
- New action: "Besitzer ändern".

## 8. Stadtstack game (blocked on repo access)

Once accessible:
1. Open a PR on the contributor's repo: add the SDK + `ready()`, `public/.well-known/roebel-miniapp.json` with the contributor's wallet as `owner`, and embed-friendly headers if needed.
2. They deploy (Vercel).
3. `register`.
4. Max approves in admin.
5. Check in the Expo dev-preview host.

## 9. Testing

- Unit (vitest, in `apps/web`):
  - manifest-file validation: owner, same-origin `homeUrl`, slug derivation
  - SSRF guard: private IPs, redirect off-origin, size and timeout
  - `indexOrigin` state transitions (new, unchanged, changed-not-live, changed-live, fetch-fail) against a mocked fetch and DB
- Manual end-to-end:
  1. Deploy a tiny static sample to Vercel with the manifest and register it on production. Expect `pending` in the dashboard.
  2. Edit the manifest and click "Manifest neu laden". Expect a new version.
  3. Approve. Expect it live in the Expo store.
  4. Edit again. Expect the live app to stay untouched while a version is pending.
  5. Delete the sample.

## 10. Files touched (expected)

- **New:**
  - `lib/miniapp/fetchManifest.ts`, `lib/miniapp/indexing.ts`
  - `app/api/mini-apps/{validate,register}/route.ts`
  - `app/api/cron/mini-apps-reindex/route.ts`
  - `app/mini-apps/page.tsx`, `app/mini-apps/publish.md/route.ts`
  - the migration
- **Changed:**
  - `lib/miniapp/{manifest,data,types,devdocs}.ts`
  - `app/api/[transport]/route.ts` (the MCP tool)
  - `app/dashboard/mini-apps/{page,[id]/page}.tsx`
  - `app/admin/dashboard/mini-apps/[id]/page.tsx`
  - `components/sommercamp/RegistrationCard.tsx`
  - `apps/web/vercel.json`
  - `app/developers/mini-apps/page.tsx`, `llms*.txt`
