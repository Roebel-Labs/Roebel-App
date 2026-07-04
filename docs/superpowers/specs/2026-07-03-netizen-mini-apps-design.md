# Netizen Mini Apps — Platform Design Spec

**Date:** 2026-07-03
**Branch:** `feat/netizen-mini-apps`
**Status:** Frozen contract — the five build agents implement against this document.

---

## 1. Summary

Build a **Mini App platform** modelled on Farcaster / World / Base App mini apps, embedded in
the Röbel Expo app and managed from the Next.js web app. A *mini app* is a standalone web app
(HTML/CSS/JS) that bundles a small client SDK, is rendered inside a WebView (native) or iframe
(web), and talks to the host over a `postMessage` bridge.

**Branding:** the platform + developer surface is **Netizen** (ties to the Netizen Labs
spin-out). The SDK is `@netizen-labs/miniapp-sdk`. The **Röbel app is the first host**. "Röbel-Münzen"
is the in-app reward currency (Circles v2 group token on Gnosis) — **never surface CRC/Circles
jargon in UI copy.**

**Design baseline (verified research):** Target the **Farcaster Mini App shape** — a mini app is
a cross-origin iframe/WebView modal with a host-rendered header; the mini app **must call
`ready()`** to dismiss the splash; the host cannot inject JS cross-origin so the mini app **bundles
the SDK**; wallet is an **EIP-1193 provider** injected by the host; context user is **untrusted**
(auth uses a server-verified token). We mirror Farcaster method names so future
Farcaster/Base portability is a thin adapter, but the manifest/registry is Röbel-hosted (no
JSON-Farcaster-Signature domain signing yet).

## 2. Deliverables (5 sub-projects)

| # | Name | Location | Owner agent |
|---|------|----------|-------------|
| ⓿ | **Contract**: `@netizen-labs/miniapp-sdk` + bridge protocol + `DESIGN.md` + Next template | `packages/miniapp-sdk`, `apps/mini-apps/_template` | A (Foundation) |
| ⓿ | **Data model**: Supabase migration (5 tables) | `apps/web/supabase/migrations` (or MCP) | A (Foundation) |
| ① | **Expo Mini App Store** + `MiniAppHost` WebView bridge | `apps/expo` | B (Expo) |
| ② | **Web Builder Dashboard + Admin review/Playground + API** | `apps/web` | C (Web) |
| ③ | **AI Mini App Builder** (v0-style, managed publish) | `apps/web` | C (Web) |
| ④ | **Circles PoC**: `roebel-data` Vite→Next port + SDK swap | `apps/mini-apps/roebel-data` | E (PoC) |

Decisions locked with the user:
- **Open submission + admin review**: any developer submits; apps land in `/admin/dashboard`
  review queue, are tested in the Playground, then approved → live. Admins see all-app analytics.
- **AI builder = managed + one-click publish** (Röbel-hosted, auto-registered).
- **Rewards = central pool + per-app budget** (server-authorized issuance; unreviewed apps = 0).
- **Builder auth = existing thirdweb (email/wallet) login** + a `developers` row (no separate portal).
- **All consumers build in parallel** against this frozen contract.

---

## 3. ⓿ The Contract

### 3.1 Package layout

```
packages/miniapp-sdk/
  package.json          # name: @netizen-labs/miniapp-sdk, main/types: src/index.ts (src-based, like @roebel/blockchain)
  src/
    index.ts            # public export: `sdk`, types, version
    types.ts            # ALL shared types (frozen — see 3.3). Consumers import from here.
    bridge.ts           # postMessage transport (client side): request/response/event plumbing
    client.ts           # the `sdk` object (actions, wallet, context, auth, haptics, roebel, notifications)
    provider.ts         # EIP-1193 provider shim backed by the bridge
  DESIGN.md             # design system the AI builder + template enforce (see 6)
  README.md
```

- Workspace: add `apps/mini-apps/*` to `pnpm-workspace.yaml`. Mini apps depend on
  `"@netizen-labs/miniapp-sdk": "workspace:*"` and transpile it (`transpilePackages` in Next).
- **Host side** (Expo/web) imports the same `types.ts` + a `host` sub-path (`@netizen-labs/miniapp-sdk/host`)
  that provides the host half of the bridge (message router → native/web capability handlers).
  Add `src/host/index.ts` + a `./host` export entry.

### 3.2 Bridge protocol (frozen)

One JSON envelope over `window.postMessage`, identical in WebView and iframe. `netizen: 1` is the
protocol version tag and MUST be present on every message (used to filter foreign messages).

```jsonc
// mini app → host  (request)
{ "netizen": 1, "id": "<uuid>", "method": "actions.ready", "params": { } }
// host → mini app  (success)
{ "netizen": 1, "id": "<uuid>", "result": { } }
// host → mini app  (error)
{ "netizen": 1, "id": "<uuid>", "error": { "code": "user_rejected", "message": "…" } }
// host → mini app  (unsolicited event, no id)
{ "netizen": 1, "event": "walletChanged", "data": { "address": "0x…", "chainId": 8453 } }
```

- Transport: client posts to `window.parent` (iframe) or `window.ReactNativeWebView.postMessage`
  (WebView). Host injects responses via `iframe.contentWindow.postMessage` / `webview.injectJavaScript`
  or `webViewRef.postMessage`. The client listens on `window` `message` events; on RN WebView the
  host delivers via `injectJavaScript("window.dispatchEvent(new MessageEvent('message',{data:…}))")`.
- Every request has a client-generated `id`; the client keeps a `Map<id, {resolve,reject}>` and
  settles on the matching response. 30s timeout → reject `{code:'timeout'}`.
- Error codes (frozen enum): `user_rejected`, `unauthorized`, `unsupported`, `invalid_params`,
  `rate_limited`, `budget_exceeded`, `timeout`, `internal`.

### 3.3 SDK surface (frozen — `types.ts` + `client.ts`)

Farcaster-shaped. Consumers may assume this exact shape.

```ts
export interface NetizenSDK {
  /** Resolves once the bridge handshake completes. */
  isReady: Promise<void>;

  actions: {
    /** MANDATORY: dismiss host splash once UI is mounted. */
    ready(opts?: { disableNativeGestures?: boolean }): Promise<void>;
    close(): Promise<void>;
    openUrl(url: string): Promise<void>;              // external → host browser
    share(payload: { text?: string; url?: string }): Promise<void>;
    /** Ask host to add this app to the user's library (+enable notifications). */
    addMiniApp(): Promise<{ added: boolean }>;
  };

  /** Async — never synchronous. UNTRUSTED; display only, never auth. */
  getContext(): Promise<MiniAppContext>;

  wallet: {
    /** EIP-1193 provider backed by the host thirdweb smart account (Base + Gnosis). */
    getEthereumProvider(): Promise<Eip1193Provider>;
    /** convenience: current address + chainId, or null if not connected. */
    getAccount(): Promise<{ address: string; chainId: number } | null>;
  };

  auth: {
    /** Server-verifiable token proving the user's identity to the mini app's OWN backend.
     *  In-memory, auto-refreshing. FID/wallet in `sub`. Validate server-side. */
    getToken(): Promise<{ token: string } | null>;
    signIn(): Promise<{ token: string }>;             // triggers host sign-in if needed
  };

  haptics: {
    impact(style?: 'light' | 'medium' | 'heavy'): Promise<void>;
    notification(type?: 'success' | 'warning' | 'error'): Promise<void>;
    selection(): Promise<void>;
  };

  /** Netizen/Röbel extensions. */
  roebel: {
    getMuenzenBalance(): Promise<{ balance: string; decimals: number; symbol: 'RÖ' }>;
    /** REQUEST a reward. Server-authorized: host enforces per-app budget + rate limit +
     *  idempotency. Rejects budget_exceeded / rate_limited. Unreviewed apps → budget 0. */
    grantReward(p: { amount: number; reason: string; idempotencyKey: string }):
      Promise<{ granted: boolean; txRef?: string; remainingBudget?: number }>;
    /** User-signed Röbel-Münzen transfer via the wallet provider (host confirm sheet). */
    pay(p: { to: string; amount: number; memo?: string }): Promise<{ txHash: string }>;
  };

  notifications: {
    /** Gated: only to users who added the app + granted permission. */
    send(p: { title: string; body: string; targetUrl?: string }): Promise<{ sent: boolean }>;
  };

  /** Fire-and-forget analytics. Never throws, never blocks. Writes mini_app_events. */
  track(event: string, props?: Record<string, unknown>): void;

  on(event: NetizenEvent, cb: (data: unknown) => void): () => void; // returns unsubscribe
}

export interface MiniAppContext {
  user: { id: string; displayName?: string; avatarUrl?: string; isCitizen: boolean } | null;
  host: { name: string; platform: 'ios' | 'android' | 'web'; version: string };
  safeAreaInsets: { top: number; bottom: number; left: number; right: number };
  launch: { referrer?: string; entry?: string; query?: Record<string, string> };
}

export type NetizenEvent = 'walletChanged' | 'back' | 'visibilityChanged' | 'themeChanged';
export interface Eip1193Provider { request(a: { method: string; params?: unknown[] }): Promise<unknown>; }
```

Method-name mapping to bridge `method` strings: `actions.ready`, `actions.close`, `actions.openUrl`,
`actions.share`, `actions.addMiniApp`, `context.get`, `wallet.getAccount`, `wallet.request`
(EIP-1193 passthrough), `auth.getToken`, `auth.signIn`, `haptics.impact|notification|selection`,
`roebel.getMuenzenBalance`, `roebel.grantReward`, `roebel.pay`, `notifications.send`, `analytics.track`.

### 3.4 Manifest / registry (frozen shape)

Stored as a `mini_apps` row (no domain signing yet). The template ships a `netizen.manifest.ts`
that exports this object; the builder/registry validate against it.

```ts
export interface MiniAppManifest {
  slug: string;                 // unique, url-safe
  name: string;                 // ≤ 32 chars
  iconUrl: string;              // 1024×1024 png
  homeUrl: string;             // entry URL loaded by the host
  description: string;          // ≤ 200
  category: MiniAppCategory;    // enum below
  tags: string[];               // ≤ 5, lowercase, ≤ 20 chars each
  screenshots?: string[];       // ≤ 3, portrait
  permissions: MiniAppPermission[];  // must be declared + admin-approved
  primaryColor?: string;        // defaults to navy #00498B
}
export type MiniAppCategory =
  | 'community' | 'governance' | 'finance' | 'utility' | 'games'
  | 'education' | 'news' | 'culture' | 'environment';
export type MiniAppPermission = 'wallet' | 'rewards' | 'notifications' | 'circles' | 'share';
```

Future portability (not in MVP): generate `/.well-known/farcaster.json` + `<meta fc:miniapp>` from
the same manifest.

### 3.5 Supabase data model (frozen DDL)

Project ref `wwbeqhkslxdxhktqzqti`. All new tables prefixed `mini_app`. Apply via Supabase MCP.

```sql
-- developers: external builder accounts, linked to a wallet (thirdweb login)
create table if not exists public.developers (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  wallet       text not null unique,          -- lowercased
  display_name text,
  email        text,
  town         text,                           -- e.g. the other town
  status       text not null default 'active'  -- active | suspended
);

-- mini_apps: the registry (one row per app)
create table if not exists public.mini_apps (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  developer_id  uuid references public.developers(id) on delete set null,
  slug          text not null unique,
  name          text not null,
  icon_url      text,
  home_url      text not null,
  description   text,
  category      text not null default 'utility',
  tags          text[] not null default '{}',
  screenshots   text[] not null default '{}',
  permissions   text[] not null default '{}',
  primary_color text default '#00498B',
  status        text not null default 'draft',  -- draft|pending|approved|live|rejected|suspended
  featured      boolean not null default false,
  reward_budget numeric not null default 0,     -- Röbel-Münzen the app may grant (admin-set)
  reward_spent  numeric not null default 0,
  review_notes  text,
  source        text not null default 'external' -- external | ai_builder | first_party
);
create index if not exists mini_apps_status_idx on public.mini_apps(status);
create index if not exists mini_apps_category_idx on public.mini_apps(category);

-- mini_app_versions: reviewable pinned versions (home_url + manifest snapshot)
create table if not exists public.mini_app_versions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  mini_app_id  uuid not null references public.mini_apps(id) on delete cascade,
  version      text not null,
  home_url     text not null,
  manifest     jsonb not null default '{}'::jsonb,
  status       text not null default 'pending', -- pending|approved|rejected
  reviewed_by  text,
  reviewed_at  timestamptz
);

-- mini_app_events: telemetry (mirrors the roebel-data miniapp_events precedent)
create table if not exists public.mini_app_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  mini_app_id  uuid references public.mini_apps(id) on delete cascade,
  slug         text,                            -- denormalized for anon insert convenience
  session_id   text not null,
  wallet       text,                            -- lowercased, null pre-connect
  event        text not null,                   -- app_open|tab_view|wallet_connect|reward_granted|heartbeat|<custom>
  ref          text,
  props        jsonb not null default '{}'::jsonb
);
create index if not exists mini_app_events_created_idx on public.mini_app_events(created_at);
create index if not exists mini_app_events_app_idx on public.mini_app_events(mini_app_id);
create index if not exists mini_app_events_event_idx on public.mini_app_events(event);

-- mini_app_rewards: server-authorized reward ledger (idempotent, budget-metered)
create table if not exists public.mini_app_rewards (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  mini_app_id      uuid not null references public.mini_apps(id) on delete cascade,
  wallet           text not null,               -- recipient, lowercased
  amount           numeric not null,
  reason           text,
  idempotency_key  text not null,
  status           text not null default 'pending', -- pending|granted|failed|rejected
  tx_ref           text,
  unique (mini_app_id, idempotency_key)
);

-- RLS: append-only anon insert for events (like roebel-data); everything else server-only.
alter table public.mini_app_events enable row level security;
create policy "mini_app_events insert anon" on public.mini_app_events
  for insert to anon, authenticated with check (true);
alter table public.mini_apps enable row level security;
create policy "mini_apps read live" on public.mini_apps
  for select to anon, authenticated using (status = 'live');
alter table public.developers enable row level security;
alter table public.mini_app_versions enable row level security;
alter table public.mini_app_rewards enable row level security;
-- developers/versions/rewards: no anon policies → service-role (admin client) only.
```

---

## 4. 🔒 Security model (open platform → this is load-bearing)

1. **Isolation**: mini app is cross-origin (WebView origin / iframe `sandbox="allow-scripts
   allow-forms allow-popups"` + separate origin). It cannot read host JS, cookies, or wallet keys.
2. **Wallet**: host injects an EIP-1193 provider backed by the host thirdweb smart account. **Every**
   `eth_sendTransaction` / `personal_sign` / `eth_signTypedData` opens a **host-native confirmation
   sheet** showing method + decoded target + amount. No blind signing. Reject → `user_rejected`.
3. **Rewards are never client-authorized**. `roebel.grantReward` is a *request*. The host backend:
   validates the app is `live`, checks `reward_spent + amount ≤ reward_budget`, rate-limits per
   (app, wallet), enforces `unique(mini_app_id, idempotency_key)`, then issues Röbel-Münzen via the
   existing muenzen/circles-invite rails and writes `mini_app_rewards`. **Unreviewed/unapproved apps
   have `reward_budget = 0`** → every grant rejects `budget_exceeded`.
4. **Permissions**: `permissions[]` declared in the manifest and approved by an admin. The host
   refuses bridge methods whose permission wasn't granted (`unauthorized`).
5. **Domain allowlist**: the host only loads `home_url` of `status='live'` apps; navigation is
   confined to the app origin (external → `actions.openUrl` → host browser). CSP on hosted apps.
6. **Kill-switch**: `status → suspended` immediately removes an app from the store + host.
7. **Auth**: `getContext().user` is UNTRUSTED. Real identity for a mini app's backend = `auth.getToken()`
   (host-signed token, verified server-side by the mini app).

---

## 5. Consumers

### ① Expo Mini App Store (`apps/expo`)  — Agent B
- **Store surface**: new screen reachable from the nav (add a "Mini Apps" entry to the explore tab
  or bottom nav). Sections: Featured (horizontal), Categories, Search, All. Cards match
  `FeaturedMenuItemsGrid`/`AttesterGrid` idioms; `useTheme()` colors; Mona Sans.
- **Data**: read `mini_apps where status='live'` from Supabase (anon client). Detail screen: name,
  icon, screenshots, description, "Öffnen".
- **`MiniAppHost` screen**: `react-native-webview` (already a dep, v13.16.0) full-screen modal with a
  host header (app name + author, close, back), splash overlay until `actions.ready`. Implements the
  **host half of the bridge** (`@netizen-labs/miniapp-sdk/host`) mapping methods to:
  wallet → thirdweb `useActiveAccount()` provider + a native confirm sheet; `haptics` → `expo-haptics`;
  `openUrl` → `Linking`; `share` → RN `Share`; `notifications`/`rewards` → apps/web API routes;
  `context.get` → the user record (display name, isCitizen). Emits `mini_app_events` (app_open,
  heartbeat, etc.).
- **Injection**: on WebView load, host also injects a tiny shim so the SDK's `postMessage` reaches
  the host and events dispatch back (`injectedJavaScriptBeforeContentLoaded`).
- Copy: **German**. StyleSheet + useTheme, **no NativeWind**.

### ② Web Dashboard + Playground + Admin review (`apps/web`) — Agent C
- **Builder side** `apps/web/src/app/dashboard/mini-apps/`:
  - list of the developer's apps (status badges), "New app", submit/version, edit manifest.
  - per-app analytics (opens, unique wallets, retention, rewards) — Recharts, reusing
    `PartnerKpiGrid`/`RevenueLineChart` patterns.
  - auth: existing thirdweb login → resolve/create a `developers` row.
- **Admin side** `apps/web/src/app/admin/dashboard/mini-apps/`:
  - review queue (pending apps/versions), **Playground** (renders `home_url` in a sandboxed iframe
    with the real web bridge so the reviewer can test wallet/reward/analytics before approving),
    approve/reject with notes, set `reward_budget`, toggle `featured`, kill-switch.
  - all-apps analytics overview (matches the muenzen console shadcn design).
- **API routes** `apps/web/src/app/api/mini-apps/`:
  - `submit`, `list`, `[id]` (get/patch), `review` (admin), `events` (ingest+query), `rewards`
    (server-authorized grant — see security §3), `reward-budget` (admin), `analytics`.
  - Use `createAdminClient()` (service role) + `requireAdmin()` for admin routes; builder routes
    gated by the developer's signed token.
- **Web bridge host**: a `apps/web/src/lib/miniapp-host/` module implementing the host half over
  iframe `postMessage` (reused by both the Playground and the AI-builder preview). Shares the
  method contract with `@netizen-labs/miniapp-sdk/host`.

### ③ AI Mini App Builder (`apps/web`) — Agent C
- `apps/web/src/app/dashboard/mini-apps/new/` (or `/build`): prompt box → streaming Claude codegen
  (`@ai-sdk/anthropic`, already wired for Mecky) that produces a Next.js mini app from the
  `apps/mini-apps/_template` scaffold, **constrained by `DESIGN.md`** (Mona Sans + navy + component
  idioms + copy rules) and the SDK API. System prompt embeds `DESIGN.md` + the SDK surface + the
  "must call `ready()`" rule as a hard lint.
- **Live preview**: generated files rendered in a sandboxed iframe wired to the web bridge host
  (mock or real user). 
- **Publish (managed)**: write the app into `apps/mini-apps/<slug>/`, deploy (Vercel via MCP, or a
  documented fallback that stores the build + a placeholder URL), create a `mini_apps` row
  (`source='ai_builder'`, `status='pending'`) → enters admin review.
- API: `apps/web/src/app/api/mini-apps/generate/` (streaming), `publish/`.

### ④ Circles PoC (`apps/mini-apps/roebel-data`) — Agent E
- **Port Vite→Next.js** (App Router), reusing existing `src/views`, `src/components` (visx charts,
  ui kit), `src/lib` as-is where possible. Keep Mona Sans (self-hosted) + the navy/visx chart theme.
- **Swap the SDK**: replace `@aboutcircles/miniapp-sdk` (`onWalletChange`, `sendTransactions`) with
  `@netizen-labs/miniapp-sdk` — wallet via `sdk.wallet.getEthereumProvider()`, context via
  `sdk.getContext()`, analytics via `sdk.track()` (→ `mini_app_events`), and demonstrate
  `sdk.roebel.getMuenzenBalance()` + a `grantReward` on a citizen action.
- Add `netizen.manifest.ts`, call `sdk.actions.ready()` on mount.
- Make it a workspace member; register a `mini_apps` row so it appears in the Expo store as the first
  live app. Proves the full loop end-to-end.

---

## 6. `DESIGN.md` (design system the AI builder enforces)

Lives at `packages/miniapp-sdk/DESIGN.md`, embedded in the AI builder system prompt. Contents:
- **Type**: Mona Sans (weights 200–900, widths 75–125%); headings SemiCondensed; mono = Mona Sans
  Mono. Load via `next/font/local` from a shared font dir; expose `--font-sans`/`--font-mono`.
- **Color**: navy `#00498B` primary (+ ramp), secondary text `#6B7280`, borders `#B4B8C1`,
  surface/bg per light/dark; dark primary `#7ABBF2`. Radius `10px`.
- **Charts**: the `chartTheme` ink/navy/sky/gold ramps (from roebel-data) as the only palette.
- **Components**: card = `rounded-[10px] border border-border bg-card p-4`; KPI value =
  `text-2xl font-semibold tabular-nums`, label = `text-xs text-muted-foreground`. Mobile-first, must
  look right at ~360px.
- **Copy rules**: German primary; **never** show wallet addresses (resolve to display name);
  **never** say "CRC"/"Circles"/"personal token" — the currency is **"Röbel-Münzen"** (symbol RÖ).
- **Mandatory**: bundle `@netizen-labs/miniapp-sdk`; call `sdk.actions.ready()` once mounted; declare
  `permissions[]` in `netizen.manifest.ts`.

---

## 7. Parallelization & integration seams

- **Agent A (Foundation)** lands first-ish; but B/C/E code against the **frozen types in §3.3** so
  they don't block. When A publishes the package, imports resolve.
- **Shared-file rule (avoid concurrent-edit conflicts):** each agent creates NEW files under its own
  scope and does **NOT** edit shared config (`pnpm-workspace.yaml`, root/app `package.json`,
  Expo nav registration, `turbo.json`). Instead each agent **reports** the deps / workspace / nav
  edits it needs; the coordinator (me) applies those centrally after agents land.
- **Supabase migration** is applied once by the coordinator via MCP (additive tables — low risk).
- **typecheck**: per the user's "skip typecheck mid-iteration" preference, agents may commit before a
  fully-green monorepo typecheck; the coordinator reconciles types once the package lands.

## 8. Definition of done (MVP)

- `@netizen-labs/miniapp-sdk` builds; a mini app bundling it calls `ready()` and round-trips
  `getContext`, `wallet.getAccount`, `track`, `grantReward` against a host.
- Expo store lists live apps and opens `roebel-data` in the `MiniAppHost`; wallet + analytics work.
- Web: a developer can submit an app; an admin can review it in the Playground and approve it; both
  builder + admin analytics render real `mini_app_events`.
- AI builder generates a Mona-compliant Next.js mini app from a prompt, previews it, and publishes it
  into review.
- `roebel-data` runs as a Next.js mini app inside the Expo store (the PoC loop).
- Rewards: `grantReward` is server-authorized, budget-metered, idempotent; unreviewed apps = 0.
</content>
</invoke>
