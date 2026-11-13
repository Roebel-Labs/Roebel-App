# State of Ortis Studio

**Last verified: 2026-11-13**, against production (`www.roebel.app`), the Supabase project
`wwbeqhkslxdxhktqzqti` and the built installers. Part of the [documentation index](README.md).
Read this before touching `apps/studio`, the chat API under `apps/web/src/app/api/chat`, device
pairing, own API keys or the Google connector.

Ortis Studio started as the livestream studio for the DanceCup (2026-11-07). Since 2026-11-12 it is
the **Ortis desktop app**: a Town.com-style multi-agent workspace is the main product, the livestream
is one section, mini apps another. It ships as a macOS/Windows Electron app and as a browser version.

---

## 1. Where things are

| What | Where |
|---|---|
| Desktop app source | `apps/studio` on branch **`feat/ortis-studio-desktop`** (worktree `.worktrees/ortis-studio-desktop`). **Not merged to main** — never merge unasked. |
| Backend (chat API, pairing, keys, connectors) | `apps/web` on **main** (deployed to `www.roebel.app` by Vercel on push) |
| Installers | GitHub releases `ortis-studio-v<version>` in `Roebel-Labs/Roebel-App`; the download page `roebel.app/studio` and the in-app update check pick the newest release with both files automatically |
| Browser version | `https://ortis-studio-web.vercel.app` — Vercel project `ortis-studio-web`, a static deploy of `apps/studio/dist` (see §7) |
| Designs | `docs/superpowers/specs/2026-11-12-ortis-studio-workspace-design.md`, `2026-11-13-ortis-credits-subscriptions-design.md` |
| Older studio docs | `docs/superpowers/specs/2026-10-22-roebel-studio-livestream-design.md` (on `feat/roebel-studio`) |

## 2. The app (renderer, `apps/studio/src`)

| Area | Files | State |
|---|---|---|
| Shell | `ui/App.tsx`, `ui/shell/*` | Town layout: toolbar (Suchen, Aufnehmen, Bildschirmfoto, gear) and icon rail on a frame, content in one rounded card. Follows system light/dark. Sections: **Start** (default) = workspace, **Livestream**, **Mini-Apps**. Account menu at the rail bottom. |
| Workspace | `workspace/*` | Threads, streaming conversation (SSE), Bibliothek panel (files/images), approval cards, option chips above the composer, screenshot attachments, dictation. Same chat API as the Röbel app. |
| Sign-in | `workspace/SignIn.tsx`, `workspace/session.ts` | Device pairing (§4). Token in app storage on macOS (no keychain prompt), DPAPI `safeStorage` on Windows. |
| Settings | `ui/shell/SettingsDialog.tsx` | Darstellung (accent colour: 8 presets + custom, `--w-accent`, saved per device), Verbindungen (Google, MCP servers, Microsoft "Geplant", Röbel App), KI-Schlüssel (own keys), Konto (plan, usage, Abmelden). |
| Mini-Apps | `ui/shell/AppsSection.tsx`, `AppAnalytics.tsx` | The user's own mini apps; "Nutzung" shows the web dashboard numbers (KPIs, opens per day, top events). |
| Livestream | `ui/show`, `ui/design`, `ui/table`, `live-room`, … | Unchanged control room (dark). **Camera gate** (`media/gate.ts`): cameras and microphones open only in the Livestream section or while on air; no permission prompt at launch. |
| Fonts | `ui/theme.css`, `assets/MonaSans*.woff2` | Interface: Mona Sans, headlines Mona Sans SemiCondensed (same file, `font-stretch: 87.5%`), Mona Sans Mono. On-air canvas graphics keep Inter / Plus Jakarta Sans (`render/fonts.ts`). |
| Browser build | `web-shim.ts` | Stands in for `window.studio`; Livestream shows a download notice; capture is never allowed. |

Logout: rail avatar → Abmelden, the arrow icon at the bottom of the thread list, or the menu-bar icon.

## 3. Desktop shell (`apps/studio/electron`)

- `desktop.cjs`: menu-bar/tray icon (Town-style short names with template icons in `build/menu`),
  global shortcut **⇧⌘Space / Ctrl+Shift+Space** (new message), macOS region screenshot →
  workspace attachment, `secrets:*` IPC (safeStorage, **disabled on macOS** — unsigned builds made
  the keychain ask for the login password on every version).
- `main.cjs`: macOS vibrancy + inset traffic lights; `media:askAccess` (asked on first Livestream
  visit); **`ortis-studio://` URL scheme (0.2.1)** — only `ortis-studio://connected?google=ok|cancelled|error`
  is accepted; it focuses the window and refreshes Verbindungen. Nothing from a link is executed.
- `ota.cjs`: `OTA_RUNTIME = 2` (secrets, ui, desktop, media.askAccess). Interface-only changes can
  ship as an interface OTA (`pnpm ota:publish`, signing key only on Max's Mac); anything in
  `electron/*.cjs` needs an installer.
- Icons: `build/icon.png` (macOS grid, rounded), `build/icon-win.png`, tray template images —
  generated from the Ortis logo with sharp.

## 4. Device pairing (backend, main)

Desktop has no wallet, so it pairs with a signed-in account:

1. Studio: `POST /api/chat/pair/start {deviceName}` → code + QR + `pollToken` (only its SHA-256 is
   stored; table `chat_device_pairings`, 10 min TTL).
2. The owner approves at `https://www.roebel.app/studio/verbinden?code=…`:
   - **Röbel App:** QR via the in-app scanner or the page's button (`roebel://chat/pair?code=` /
     Android `intent://`) → screen `apps/expo/app/chat/pair.tsx` → `POST /api/chat/pair/approve`
     with the app's chat session.
   - **Ortis ID in the browser:** the page checks `GET /api/chat/pair/me`, offers "Mit Ortis ID
     anmelden" (reuses the existing workspace OIDC login → cookie `roebel_ws`, `sub` = smart-account
     address) and then one explicit "Ortis Studio jetzt verbinden".
3. Studio polls `POST /api/chat/pair/poll` and gets a normal 30-day chat session token **once**.

Never auto-approve after a login (device-code phishing). iOS AASA claims `/studio/verbinden`;
Android intent filters for it are in `app.config.ts` and need the **next native build**.
Approvals log `[pair/approve] ok|401|rejected` (no wallet).

## 5. Chat backend additions (main)

| Endpoint | Purpose |
|---|---|
| `GET /api/chat/me` | Display name, plan, quota, own keys (never the wallet) |
| `GET/PUT/DELETE /api/chat/provider-keys` | Own Anthropic/OpenAI keys: verified live, AES-GCM under `CHAT_CONNECTOR_KEY`, only `last4` returned (table `chat_provider_keys`) |
| `GET /api/chat/mini-apps`, `/api/chat/mini-apps/:id/analytics` | The session user's own mini apps and their dashboard numbers |
| CORS | `/api/chat/*` sends `Access-Control-Allow-Origin: *` (Bearer auth only, no cookies) for the Electron renderer and the browser build |

Own keys: `resolveModelFor(wallet, route)` (`lib/chat/models.ts`) runs the route on the user's
Anthropic key, `chat_runs.billed_to = 'own_key'`, cost 0, and `checkQuota` never reports exceeded.

## 6. Google connector

- OAuth client **"Ortis Studio"** (Web application) in GCP project "roebel app"; redirect URI
  `https://www.roebel.app/api/chat/connectors/google/callback`. Vercel production has
  `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`. Consent screen in **Testing**; only
  listed test users can connect. First real connection stored 2026-11-12 20:44 UTC (Max).
- Flow: Studio opens Google in the **system browser** (Google forbids sign-in in embedded app
  windows), the callback stores the refresh token encrypted, then `/studio/verbunden` hands back via
  `ortis-studio://connected` (0.2.1); older builds refresh on window focus.
- **Scope profiles** (`GOOGLE_OAUTH_SCOPE_PROFILE`): `full` (default; gmail.readonly, gmail.compose,
  calendar, drive.readonly) for testing; `verified` (calendar, gmail.send, drive.file) has no
  restricted scopes and can go to production after a normal Google review without CASA.
  Tools are offered per granted scope; `google_gmail_send` exists for the verified profile.
- Production checklist (Max): set `GOOGLE_OAUTH_SCOPE_PROFILE=verified`, consent screen scopes to
  match, app homepage + privacy policy with Google "Limited Use" wording, verify `roebel.app` in
  Search Console, demo video, then "Publish app" and submit for verification. Inbox reading
  (gmail.readonly) later needs the CASA Tier 2 assessment.

## 6a. Personal context: Wiki, Für dich, Funktionen, Bibliothek (2026-11-12)

Design and research: `docs/superpowers/specs/2026-11-12-ortis-personal-context-design.md`.

- **Backend (main):** `apps/web/src/lib/chat/persona/*` builds a cited Markdown wiki per account from
  Gmail (sent mail first), Calendar, the Röbel App profile, imported Claude/ChatGPT memory and chat
  memory. Job state machine in `persona_jobs`, continued by the cron `/api/chat/cron/persona`.
  Endpoints under `/api/chat/persona/*`, `/api/chat/skills`, `/api/chat/routines/catalog`,
  `/api/chat/routines/quick`, `/api/chat/library`. Migration `20261112b_persona_wiki.sql` applied.
- **Runtime:** bots with the `memory` key get a short profile block in the system prompt plus the
  tools `wiki_read`, `wiki_search`, `wiki_note`, `skill_read`.
- **Studio (`feat/ortis-studio-desktop`, `src/persona/*`):** rail sections Für dich, Funktionen,
  Wiki, Bibliothek. Interface-only change (no `electron/` edits), so it can ship as an interface OTA.
- **Not verified yet:** a build on a real mailbox, and the new screens on a device.


### 6a.1 Quality pass after the first real build (2026-11-13)

Compared side by side with Town.com on the same mailbox. What was wrong and what changed:

| Finding | Fix |
|---|---|
| The newest 220 inbox mails of a developer are CI failures, so 2 human mails got read and decisions (an answer to an application) were missed | Three Gmail lanes: sent, personal (`-category:{promotions,social,updates,forums}`, 90 days), notices (`category:updates/forums`, 30 days) |
| Replies were only read from people the user had written to directly | Whole threads the user wrote in are fetched (`threads.get`), including replies from people in cc (`ContactStat.shared`) |
| Ten identical CI mails became ten citations | Notices are clustered (`noticeKey`), carry count, date range and the Gmail preview text; a citation run is capped at 3 |
| Mail from January weighed like mail from yesterday | Dossier splits facts into "Aktuell (45 Tage)" and "Älter"; prompts: status follows the newest message |
| Support desks and the user's own second mailbox got person pages | `isRoleAddress`, `isSelfAlias` |
| Street address and admin access to 12 org profiles shown as facts | Sensitive rule extended (city level only); Röbel org access is described as app access, not ownership |
| 7 generic suggestions | Own model call (`persona:suggest`), up to 26, sections projects / collab / improve / peers, `quick`, `fresh` |

Prompts must stay neutral about who the user is (club member, craftsperson, pensioner, founder): examples in them only show the form.

**Link with Claude (two-way).** `POST /api/chat/persona/link` issues a link token (hash stored in `persona_link_tokens`). `POST /api/ortis/mcp` is a stateless MCP endpoint (Bearer token or `?key=`) with `ortis_profile`, `ortis_search`, `ortis_read`, `ortis_suggestions`, `ortis_remember` (appends to the notes page) and `ortis_push_context` (stores or replaces an import by title and starts a wiki refresh). `SYNC_PROMPT` in `persona/link.ts` is the prompt the user gives Claude. Migration `20261113b_persona_sections_and_link.sql` (applied).

## 7. Release and deploy runbook

- Installers: `cd apps/studio && env -u ELECTRON_RUN_AS_NODE pnpm dist:mac && … pnpm dist:win`
  (the VS Code terminal sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron exit silently).
  Install locally with `ditto --noqtn` into `/Applications` and `~/Applications`.
- Release: `gh release create ortis-studio-v<v> … <dmg> <exe>` — **public; Max's explicit OK
  required** (auto mode blocks creating releases; uploading to an existing one with `--clobber`
  works). Check `roebel.app/studio/latest.json` checksums after the 5-minute cache.
- Browser version: copy `apps/studio/dist` to a scratch folder and `vercel deploy --prod --yes
  --scope maxbrychs-projects` there (project `ortis-studio-web`).
- App OTA (Röbel App, for the pairing screen and scanner): from `.worktrees/prod-390` (filtered
  17-key `.env`), `expo export --clear`, grep the bundles for the four leak secrets, then
  `eas update --skip-bundler` production android, production ios, preview android. Last run
  2026-11-12 (commit 0b67be45). Never with full swap: restart the Mac first.

## 8. Open, in priority order

1. Publish **0.2.1** (ortis-studio:// return) as a GitHub release (Max's OK).
2. Google to production: verified profile + Google review (§6).
3. Credits ledger + Stripe plans/top-ups — design §5 of the credits doc, decisions from Max first;
   needs the legal entity.
4. `OPENAI_API_KEY` is missing in Vercel **production** → dictation fails in production.
5. Model routes: `bot-fast` is still Haiku 4.5; Haiku 5.5 is a tenth of the price (Max decides).
6. First real wiki build on Max's account (§6a), then tune prompts on the result; merged contacts with trust levels, Microsoft 365.
7. Own-keys screen in the Röbel app; Android intent filters ship with the next native build.
8. Vercel **preview** env points at a dead Supabase project — previews cannot test anything that
   touches the database.
