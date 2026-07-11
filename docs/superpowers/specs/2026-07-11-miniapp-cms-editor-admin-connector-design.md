# Mini-App platform batch — CMS in Expo, editor CMS/images/chats, admin review UX, Röbel Claude Connector

**Date:** 2026-07-11 · **Scope:** `apps/web`, `apps/expo`, `packages/miniapp-sdk`, one new Supabase table
**Platform contract:** `2026-07-03-netizen-mini-apps-design.md` + `2026-07-08-miniapp-builder-pro-design.md` (unchanged)

Session note: built autonomously from the user's task list; design decisions are
documented here instead of interactively approved (established repo pattern).

---

## 1. Verified diagnoses (evidence-first)

1. **Expo shows CMS dummy data** — root cause confirmed: `apps/expo/lib/miniapp-api.ts`
   resolves `API_BASE` from `expoConfig.extra.MINIAPP_API_BASE ?? EXPO_PUBLIC_MINIAPP_API_BASE`;
   neither exists in `app.config.ts` nor `eas.json` (only in the gitignored dev `.env`).
   → `hasMiniAppApi()` is false in device builds → all four `data.*` host handlers throw
   `unsupported` → generated apps render their built-in fallback ("dummy") content.
   The `mini_app_data` table IS applied in prod (verified live; `seefest-roebl/veranstaltungen`
   holds real JSON). Secondary hardening: the SDK sends `bridge.hello` exactly once
   (1.5 s, no retry) and the Expo host attaches its bridge in a `useEffect` while
   `onMessage` does `bridgeRef.current?.handleMessage` — a lost hello strands the app
   in mock mode forever.
2. **Dashboard "points instead of graphs"** — `queryAnalytics` builds `series` only from
   days that had events; sparse/young apps yield 1–2 isolated dots in the recharts areas.
3. **Admin approve = silent** — no toast anywhere in the mini-apps admin; `review` route
   only accepts `approve|reject`; nothing can put an app back to `pending` (seefest-roebl
   is stuck `rejected` right now).
4. **Admin preview** — Playground iframes `home_url` over the network: rejected/suspended
   apps serve a tombstone (eternal "Wartet auf ready()…"), non-prod envs can't resolve
   `<slug>.roebel.site`, framing errors have no surface, and reload doesn't remount.
5. **Dead `"published"` status** — `MiniAppStatus` has no `published`, yet rankings
   (`queryAppRankings`), the dashboard status dot, and `InboxDialog` compare against it
   → store ranking always empty, live apps never "done" in the inbox.
6. **Editor chats are localStorage-only** (`netizen-builder:*`) — no server history, so
   no cross-device history, no dashboard surface, no invites.
7. **Chat images stop at the vision model** — never uploaded, can't reach the CMS.

## 2. Deliverables

### A. Fix CMS in Expo (+ handshake hardening)
- `miniapp-api.ts`: default `API_BASE` to `https://www.roebel.app` when unset
  (env/extra still override for dev). JS-only → ships with the next user-run OTA.
- `app.config.ts` extra gets `MINIAPP_API_BASE` for build-time override clarity.
- `MiniAppHost`: buffer WebView messages that arrive before the bridge exists, drain
  on attach (fixes the hello race for ALL existing published apps).
- SDK 0.3.1: `handshake()` re-sends hello every ~400 ms until answered (2 s budget)
  instead of one-shot; regenerate the self-hosted bundle (`sync-web`) so published
  apps (they import the `/sdk/miniapp-sdk.mjs` alias) pick it up immediately.

### B. Web correctness: `"published"` → `"live"` (3 sites, §1.5)

### C. Admin review UX
- Sonner toasts (already mounted globally) on approve/reject/suspend/reactivate/etc.
- `review` route learns `decision: "reset"` → app back to `pending` (latest version row
  back to `pending` too); admin detail gets a "Zurück in Prüfung" button for
  live/rejected/suspended apps.
- Playground: for apps with stored HTML (ai_builder) load the latest version HTML via
  the admin-authorized `[id]` API and render `srcDoc` (same as the editor preview —
  independent of DNS/status/tombstones; CMS reads work because the web host fetches
  same-origin). External apps keep `src=home_url` + an onError/timeout notice. Iframe
  keyed on `reloadKey` so "Neu laden" remounts.

### D. Dashboard graphs
- `queryAnalytics`: zero-fill the daily series over the full range (range start → today;
  `all` = first event → today) so areas/lines render continuously. Charts: `dot={false}`
  where applicable. (KPI tiles stay.)

### E. Editor: CMS panel ("Inhalte" stage tab)
- 4th stage tab next to Vorschau/Canvas/Code. Published app → loads `scope:"app"` keys
  (`/api/mini-apps/data`), renders a **visual editor**: array-of-objects → item cards
  with per-field inputs (string/number/boolean; image-URL fields get thumbnail +
  upload-replace), object → field grid, primitive → single input; per-key JSON fallback
  toggle. Saves per key (same contract as dashboard `ContentSection`). Unpublished →
  shows the planned CMS keys + "erst veröffentlichen" hint.
- New upload kind `content` (`/api/mini-apps/images/upload`) → `mini-apps/<id>/content/…`,
  returns a public URL without touching the `mini_apps` row.

### F. Editor: drag & drop anywhere in the sidebar
- The whole chat `<aside>` becomes a drop target (existing `useImageIntake`), with a
  visible drop overlay. Composer/paste behavior unchanged.

### G. Chat image → CMS
- On send with attachments **and** a published app: full-size images upload as
  `content` images → public URLs are appended to the model turn
  (`[Angehängte Bilder als URLs: …]`) and stored on the message.
- Each uploaded attachment gets an "In CMS übernehmen" action: pick key + image field
  (heuristic: `bild|image|foto|img|url` names or image-URL-looking string values) →
  writes the URL into the JSON via the data API. Deterministic path; the AI can also
  use the URLs directly in code.

### H. Server-side chats + switcher + invites + dashboard card
- New table `mini_app_editor_chats(id, created_at, updated_at, developer_id fk,
  title, app_slug, session jsonb, share_token unique, collaborators text[], archived)`.
  RLS on, service-role only. Applied live via Supabase MCP + staged migration file.
- Session stored trimmed: all messages, only the last 2 version HTMLs (localStorage
  keeps the full set as today).
- `/api/mini-apps/chats` (GET list mine+shared / POST upsert / DELETE) and
  `/api/mini-apps/chats/[id]` (GET one; `?invite=<token>` joins as collaborator;
  POST action invite → creates share token). Auth = existing `x-wallet-address` tier;
  access = owner or collaborator.
- Editor: debounced background sync after each local save; header chat switcher
  (list, "Neuer Chat", open) → `/editor?chat=<id>`; "Einladen" copies
  `/editor?chat=<id>&invite=<token>`. Restore prefers server session when `?chat=` set.
- Dashboard `mini-apps` page: "Letzter KI-Chat" card (title, time, last message,
  "Weiterbauen") from `GET /chats?limit=1`.

### I. Röbel Claude Connector MCP
- New Streamable-HTTP MCP endpoint `POST https://www.roebel.app/api/roebel/mcp`
  (`apps/web/src/app/api/roebel/[transport]/route.ts`, `mcp-handler`, no SSE) — a
  **public read-only connector** for claude.ai custom connectors / Claude Code.
- Tools (German descriptions, admin Supabase client, never expose wallet addresses):
  `roebel_info`, `search` (events/news/businesses/marketplace/proposals/deals),
  `list_events`, `list_news` + `get_news_article`, `list_proposals`,
  `list_businesses`, `list_deals`, `list_mini_apps`.
- Docs: `docs/ROEBEL_CLAUDE_CONNECTOR.md` (claude.ai connector setup + Claude Code
  `claude mcp add` snippet). Distinct from the developer MCP at `/api/mcp`.

## 3. Out of scope
- Running `eas update` (user-run, per standing instruction) — Expo fixes = commit+push.
- SIWE auth hardening; realtime co-editing (invites = shared access, last-write-wins).
- npm publish of SDK 0.3.1 (staged; self-hosted bundle carries the fix).

## 4. Risks
- Vercel build memory: no new heavy deps (mcp-handler already in `serverExternalPackages`).
- Chat jsonb size: trimmed to last 2 version HTMLs, hard cap ~1.5 MB per row.
- Model-side CMS writes are deliberately NOT auto-applied; the deterministic
  "In CMS übernehmen" button is the primary path.

## 5. Definition of done
1. After the user's next OTA/build, a CMS-backed app in Expo shows real `mini_app_data`
   content (verifiable: seefest's `veranstaltungen`).
2. Admin: approve/reject/reset all toast; a rejected app can be put back "In Prüfung";
   the preview renders pending AND rejected ai_builder apps.
3. Dashboard charts show continuous graphs with 1 day of data.
4. Editor: CMS tab edits real content visually; images drop anywhere in the sidebar;
   a chat image lands in a CMS field in ≤2 clicks.
5. Chats persist server-side per developer, switchable, invitable via link, latest chat
   visible on the dashboard.
6. `claude.ai` connector added by URL alone can search Röbel events/news/proposals.
