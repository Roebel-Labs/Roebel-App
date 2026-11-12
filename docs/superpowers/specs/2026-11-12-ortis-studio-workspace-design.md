# Ortis Studio as the Ortis desktop: workspace, livestream, mini apps (design)

Date: 2026-11-12 · Status: slice 1 BUILT on `feat/ortis-studio-desktop`; slices 2+ DRAFT, awaiting Max ·
Builds on: `2026-09-25-mecky-chat-suite-design.md`, `2026-09-26-ortis-agent-harness-design.md`,
`2026-10-22-roebel-studio-livestream-design.md` (on `feat/roebel-studio`)

## 1. Intent

Max tried Town.com (Duke, macOS app with glass sidebar, menu-bar icon for capture and voice, Google
Calendar and Gmail connected) and wants the same class of product, as part of Ortis:

- **Ortis Studio becomes the Ortis desktop app.** A left icon rail; the livestream studio is one
  section, the agent workspace another, the mini-app builder follows.
- **Consumer-first, built like Grok Bot / Town** (decision 2026-11-12): instant context from calendar and
  mail, real-life testing to find use cases nobody knows yet. A DSGVO-compliant **Enterprise tier comes
  later**; it is not the first product.
- **More privacy than Town from day one where it is cheap:** hosting in Germany (Hetzner), EU model
  endpoints where quality allows, no data sold, no training on user data.
- Max is user #1. The Jugendhaus lead and other overloaded Verein/Betrieb admins are the next testers.

## 2. Slice 1 — navigation shell (BUILT 2026-11-12)

Renderer only, ships as an interface OTA (no installer, `OTA_RUNTIME` unchanged).

- `apps/studio/src/ui/shell/`: `nav.ts` (sections, remembered choice, hotkey gating, tested),
  `Rail.tsx`, `HomeSection.tsx`, `AppsSection.tsx`, `icons.tsx`, `shell.css`.
- Sections: **Start** (status cards: livestream, workspace soon, mini apps soon), **Livestream** (the six
  existing tabs unchanged), **Mini-Apps** (placeholder). Default section stays Livestream until the
  workspace works; the last choice is remembered in `localStorage` (`ortis-studio-section-v1`).
- **Broadcast safety:** the show runtime (transitions, quit guard), sponsor runtime, live-room seams and
  `LiveRoomRuntime` live in the shell, so switching section never touches a running broadcast (verified:
  program renders at 30 fps while Start is open). Show hotkeys bind only while Livestream → Show is on
  screen, so typing in the workspace can never TAKE or cut. Recording/destination banners and the health
  bar (with the silent-audio alarm) stay visible in every section. The Livestream icon shows a red dot
  while on air or recording.

## 3. Slice 2 — workspace (the Town part)

**Reuse, do not rebuild.** The Mecky Chat suite already has bots, threads, SSE streaming, files, routines,
memory, approval cards by risk, durable tasks, user MCP servers and a Google connector
(`apps/web/src/lib/chat/*`, `/api/chat/*`). The studio becomes a second client of the same API, like
Town's desktop app is a client of Town's backend.

### 3.1 Sign-in (the one missing backend piece)

`/api/chat/session` needs a wallet signature the desktop app cannot produce. Two options:

- **A. Pair with the Röbel app (recommended).** Studio shows a QR + 6-digit code
  (`POST /api/chat/pair/start` → `{ code, pollToken }`). The signed-in Röbel app scans it and signs
  `roebel-chat-v1:pair:<wallet>:<code>:<ts>` with the existing EOA → ERC-1271 path
  (`POST /api/chat/pair/approve`). Studio polls `GET /api/chat/pair/:pollToken` and receives the normal
  30-day session token. Token stored via Electron `safeStorage` (main process) — needs one IPC → installer.
  Short-lived codes (5 min), single use, rate-limited.
- **B. Röbel ID / Ortis ID (OIDC at `id.ortis.app`).** System browser + loopback redirect (PKCE). Cleaner
  long-term, but needs a wallet ↔ OIDC subject mapping the chat tables do not have, and one invalid
  redirect URI kills the whole OIDC client (known trap).

### 3.2 Layout (Town-shaped, Ortis-styled)

Three panes inside the Start section: collections/threads list · conversation · document side panel
(chat files, style guides, drafts). Bot picker = the existing presets plus own bots. Suggested-action chips
under the composer (the inspiration catalog already ranks them). Voice input via the existing
`/api/chat/transcribe`.

### 3.3 Instant context

- **Calendar first** (Google `calendar` scope: normal verification, no security assessment).
- **Send-only mail** (`gmail.compose`/`gmail.send`: sensitive, no CASA).
- **Inbox reading** (`gmail.readonly`, restricted) needs Google verification plus an annual CASA Tier 2
  assessment; until then the OAuth app stays in testing mode with a small allow-list of test users.
- **First-connect moment:** on connect, one pass over the next 14 days + Röbel context writes 10–20
  memory facts and proposes three routines. Not built yet; this is what made Town feel magic.
- **Claude context import:** Markdown memory export → `agent_memory` facts (user-reviewed list before
  saving), or a read-only MCP server the harness already accepts as a connector.

### 3.4 Desktop-native features (need an installer release)

All main-process work → new installer, bump `OTA_RUNTIME`, Max's explicit OK for the public GitHub release.

- macOS glass: `vibrancy: 'sidebar'` + `visualEffectState: 'active'` on the window, transparent rail
  background on darwin only (Windows keeps the solid theme; the show laptop is Windows).
- Menu-bar / tray icon: Open, New chat, Quick ask (global shortcut), Capture (screenshot → chat),
  Record (voice note → transcript → chat), Sign out, Quit. Quit while on air goes through the existing
  quit guard.
- Secure token storage (`safeStorage`) for 3.1.

## 4. Slice 3 — mini-app builder

Port the existing `/editor` AI builder and the mini-app registry into the Mini-Apps section (WebView of
the web editor first, native later). A Betrieb (the gym) creates, previews and submits; distribution in
the Röbel/Ortis app goes through the existing manifest indexing and a review gate.

## 5. Privacy and hosting path

| Step | What | Gate |
|---|---|---|
| now | Chat runtime on Vercel, model routes hosted Anthropic, Supabase | none (consumer-first) |
| next | Lift `src/lib/chat` (already framework-agnostic) into a Hono container on Hetzner Germany; LiteLLM in front of model routes; EU endpoints for the cheap routes | Hetzner box: CX33 only, Max's explicit OK (never the CPX42) |
| later | Enterprise tier: AVV + TOMs, EU-only routing per org, DPIA template, own node per customer | legal entity |

Never: selling data, training on user data, standing inbox mirroring (read on demand, like Town).

## 6. Decisions for Max

1. Sign-in: **A pairing with the Röbel app** or B Ortis ID OIDC?
2. Default section once the workspace works: Start or Livestream?
3. Installer release for glass + menu-bar + secure token storage: bundle into one release after slice 2,
   or ship glass + tray first?
4. Google OAuth client: create it now for calendar + send-only, and start CASA for inbox reading?
5. Hetzner CX33 for the chat runtime: yes, and when?
