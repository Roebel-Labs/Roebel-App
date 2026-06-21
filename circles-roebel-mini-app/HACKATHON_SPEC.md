# Circles Mini-App — Hackathon Improvements Spec

Implementation spec for four improvements to the **Röbel Circles** mini-app
(`circles-roebel-mini-app/`), targeting the Garage Circles Mini-App Hackathon scoring
criteria.

> **✅ STATUS — mini-app side SHIPPED.** F1–F4 below are implemented in
> `circles-roebel-mini-app/` (analytics backend `public.miniapp_events` created + RLS;
> `analytics.ts`, `GrowCard.tsx`, `csv.ts`, `getMyImpact`, Town cards, event
> wiring). `pnpm typecheck` + `pnpm build` pass; anon insert verified (201).
> **Remaining work is in the Röbel Expo app — see §9 (the to-do spec for the
> app-specific agent).** Deploy the mini-app with
> `cd circles-roebel-mini-app && npx -y vercel@latest --prod --yes`.

> **Read first:** this app was just redesigned in the admin "Münzen" shadcn
> design language. Match it exactly. All UI copy is **English**. Mobile-first.
> Reuse the existing primitives — do **not** introduce a new design system or
> heavy dependencies.

---

## 0. Why (maps to hackathon rules)

| # | Rule | Current state | This spec |
|---|------|---------------|-----------|
| 01 | Circles integration depth | ✅ strong (group currency, InvitationFarm, trust, registerHuman, on-chain reads) | — |
| 02 | Usefulness ("open twice?") | 🟡 all about the town, no personal hook | **F4: "Your impact" card** |
| 03 | UX | ✅ strong (redesigned) | — |
| 04 | Referrals (new wallet connects **inside the mini-app** via an app link) | 🔴 no in-app referral link | **F1: Referral share** |
| 05 | Activity (weekly unique wallets + time spent) | 🔴 no app-side analytics | **F2: Analytics event log** + **F3: CSV export** |

Priority order: **F1 (referral) → F2 (analytics) → F4 (impact) → F3 (CSV)**.
F1 and F2 close the only two real scoring gaps.

---

## 1. Codebase orientation (don't re-discover this)

- **Stack:** Vite 6, React 19, TypeScript, **Tailwind CSS v4** (`@import "tailwindcss"` + `@theme` tokens in `src/index.css`). `qrcode.react`, `viem`, `@aboutcircles/miniapp-sdk`, `@aboutcircles/sdk-invitations`. **No router** (tab state in `App.tsx`). **No analytics today.**
- **Runs inside the Circles host iframe.** The host injects the connected wallet via `onWalletChange` (`@aboutcircles/miniapp-sdk`) and signs txs via `sendTransactions`.
- **Design tokens** (use these classes): `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, navy `#194383` / `text-[#194383]`, `font-display` (Plus Jakarta Sans). Radius is `rounded-[10px]`/`rounded-[14px]`. See `src/index.css`.
- **UI primitives** (`src/components/ui.tsx`): `Card`, `ChartCard({title,subtitle,action,children})`, `PageHeader`, `KpiCard({label,value,sub,tone,icon})`, `Pill({tone})`, `Banner({kind})`, `ScoreBar({value,tone})`, `IdentityCell`, `Skeleton`, `SkeletonGrid`, `EmptyHint`, `LinkChip`. `Tone = "primary"|"success"|"warning"|"danger"|"info"|"violet"|"muted"`.
- **Charts** (`src/components/charts.tsx`): `AreaChart`, `BarChart`, `Donut`, `SplitBar`, `Sparkline` (zero-dep SVG).
- **Icons** (`src/components/icons.tsx`): inline Lucide-style, `className` sizes them. Add new ones in the same pattern (stroke=currentColor, 24×24 viewBox).
- **Formatters** (`src/lib/format.ts`): `shortAddr`, `fmt`, `fmtInt`, `fmtCompact`, `pct`, `timeAgo`.
- **Data layer:**
  - `src/lib/circles.ts` — Circles wiring. Exports: `ROEBEL_GROUP`, `ROEBEL_VAULT`, `getQuota`, `getQuotaFunding`, `isHuman`, `getSelfFundInfo`, `buildSelfFundTxs`, `inviteFarm`, `toHostTxs`, `getCollateralLocked`.
  - `src/lib/circlesData.ts` — read-only dashboards: `getVerifiedSet`, `getTownStats`, `getTrustGraph`, `getRecentTransfers(limit)`, `getReputation(verifiedSet)`, `summarizeFlows`, `dailyVolume`, `flowLabel`, `FLOW_COLOR`. Types: `Transfer {from,to,amount,time,tx,kind}`, `RepNode {address,held,inCount,outCount,score,verified}`, `TownStats`.
  - `src/lib/citizens.ts` — `ROEBEL_CITIZENS`, `shortAddr`, `explorerAvatar`, `explorerTx`.
- **App shell** (`src/App.tsx`): tabs `town | pulse | network | invite | event`; `onWalletChange` sets `inviter`; `urlInviter` from `?inviter=`. Town is the default tab (most-visited → put F1 + F4 there).
- **Supabase** is already used: `src/views/EventInviteView.tsx` hardcodes `SUPABASE_URL = "https://wwbeqhkslxdxhktqzqti.supabase.co"` and the publishable `ANON` JWT, and POSTs to an edge function. **Reuse these** (extract to `src/lib/supabase.ts`). Project ref: `wwbeqhkslxdxhktqzqti`.
- **Deploy:** this app is **NOT git-connected on Vercel** — a `git push` does **not** redeploy. Ship with: `cd circles-roebel-mini-app && npx -y vercel@latest --prod --yes`.

### Shared prep (do once)

Create **`src/lib/supabase.ts`**:
```ts
export const SUPABASE_URL = "https://wwbeqhkslxdxhktqzqti.supabase.co";
export const SUPABASE_ANON = "<copy the ANON constant from EventInviteView.tsx>";
```
Refactor `EventInviteView.tsx` to import these instead of redefining them.

Expose the **connected wallet** in `App.tsx`. Today `onWalletChange` only sets
`inviter` (which falls back to `urlInviter`). Add a distinct `connected` state =
the *real* host wallet (or `null`), and thread it to the views that need it:
```ts
const [connected, setConnected] = useState<Address | null>(null);
// inside onWalletChange:
const a = addr && isAddress(addr) ? getAddress(addr) : null;
setConnected(a);
setInviter(a ?? urlInviter);
```
Pass `connected` to `TownView` (F1 + F4). Keep `inviter` for Invite/Event logic.

---

## 2. F2 — Analytics event log (rule 05)  ⟵ build the backend first

Append-only event log in the project's Supabase, written from the client with
the publishable anon key. Powers weekly **unique wallets**, **time spent**, and
the **referral** attribution count, and is the source for F3's activity CSV.

### 2.1 Supabase table (use the Supabase MCP — `apply_migration`)

Migration `miniapp_events`:
```sql
create table if not exists public.miniapp_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  app         text not null default 'circles-inviter',
  session_id  text not null,
  wallet      text,                       -- lowercased connected wallet (null pre-connect)
  event       text not null,              -- see event names below
  ref         text,                       -- referrer wallet from ?ref (lowercased)
  props       jsonb not null default '{}'::jsonb
);
create index if not exists miniapp_events_created_at_idx on public.miniapp_events (created_at);
create index if not exists miniapp_events_wallet_idx     on public.miniapp_events (wallet);
create index if not exists miniapp_events_event_idx      on public.miniapp_events (event);

alter table public.miniapp_events enable row level security;

-- Append-only from the anon (and authenticated) client; NO public read.
create policy "miniapp_events insert anon"
  on public.miniapp_events for insert to anon, authenticated
  with check (true);
```
Reads happen via the Supabase dashboard / service role only (the log is not
public). Confirm with `get_advisors` (security) after applying.

### 2.2 Client — `src/lib/analytics.ts`

A tiny, fire-and-forget tracker. Never throws, never blocks UI.

```ts
type Props = Record<string, unknown>;

// one session id per app load (sessionStorage so reloads in the same tab reuse it)
let sessionId: string;
let walletCtx: string | null = null;   // lowercased connected wallet
let refCtx: string | null = null;      // lowercased referrer from ?ref

export function initAnalytics(opts: { ref?: string | null }): void
export function setAnalyticsWallet(wallet: string | null): void
export function track(event: string, props?: Props): void   // POST, fire-and-forget
```

- `sessionId`: `crypto.randomUUID()`, persisted in `sessionStorage("rc_sid")`.
- `track` POSTs to `${SUPABASE_URL}/rest/v1/miniapp_events` with headers
  `apikey: SUPABASE_ANON`, `Authorization: Bearer ${SUPABASE_ANON}`,
  `Content-Type: application/json`, `Prefer: return=minimal`. Body:
  `{ session_id, wallet: walletCtx, ref: refCtx, event, props }`. Wrap in
  `try/catch`; use `keepalive: true` so in-flight events survive navigation.
- Lowercase all addresses.
- **CORS:** Supabase REST allows cross-origin with the anon key (the existing
  edge-function call already proves cross-origin works). No server change needed.

### 2.3 Events to emit + time-spent

Emit these (call sites in §3–§6):

| event | when | props |
|-------|------|-------|
| `app_open` | once on mount | `{ tab, hasInviter, hasRef }` |
| `wallet_connect` | first time `connected` becomes non-null this session | `{}` |
| `referral_landed` | once, when `connected` set **and** a valid `?ref` exists and `ref !== wallet` | `{ ref }` |
| `tab_view` | on tab change | `{ tab }` |
| `heartbeat` | every 25s **while `document.visibilityState === "visible"`** | `{ secs: 25 }` |
| `share_opened` / `share_copied` / `share_native` | F1 interactions | `{}` |
| `invite_sent` | InviteView quota invite success | `{ count }` |
| `self_fund_sent` | InviteView self-fund success | `{ count }` |
| `event_created` | EventInviteView event created | `{ hours }` |
| `csv_export` | F3 download | `{ kind, rows }` |

**Time-spent** = `sum(heartbeat.secs)` per `session_id` (or per `wallet`) per
week. Pause the heartbeat interval when the tab is hidden
(`visibilitychange`) and resume when visible. Also emit a final `heartbeat`
with the partial elapsed time on `visibilitychange → hidden` via
`navigator.sendBeacon` if convenient (optional).

**Unique weekly wallets** = `count(distinct wallet)` where `created_at` in the
week. **Referrals** = `count(distinct wallet)` of `referral_landed` rows in the
week (a new wallet that connected inside the app via someone's link).

### 2.4 Acceptance
- Opening the app inserts an `app_open` row; connecting a wallet inserts
  `wallet_connect`; switching tabs inserts `tab_view`; staying ~1 min inserts
  ~2 `heartbeat` rows; all carry `session_id` and (once connected) `wallet`.
- No analytics error ever surfaces to the user (silent failure).

---

## 3. F1 — Referral share (rule 04)  ⟵ highest ROI

A prominent surface that produces a **shareable link to this mini-app** carrying
the sharer's wallet as `?ref=`, so when a new person opens the mini-app inside
the Circles app via that link and connects, it counts as a referral.

### 3.1 Referral link + attribution

- **Link format:** `` `${window.location.origin}/?ref=${connected.toLowerCase()}` ``
  (use `location.origin` so it's correct on any deploy; do **not** hardcode the
  vercel domain).
- **Parse on load** (in `App.tsx`, next to `urlInviter`):
  `const urlRef = new URLSearchParams(location.search).get("ref")` → validate
  with `isAddress`. Pass to `initAnalytics({ ref: urlRef })`.
- When `connected` first becomes non-null **and** `urlRef` is valid **and**
  `urlRef.toLowerCase() !== connected.toLowerCase()`, fire `referral_landed`
  **once** (guard with a ref/`sessionStorage` flag).

### 3.2 Component — `src/components/GrowCard.tsx`

Props: `{ wallet: Address | null }`. Render a `ChartCard` titled **"Grow Röbel"**,
subtitle "Share the town wallet — bring a neighbour onchain.":

- If `!wallet`: `EmptyHint` "Connect your wallet to get your invite link."
- Else:
  - The link in a read-only, monospace, truncated field.
  - **Copy** button (navigator.clipboard) → toast/inline "Copied", emit `share_copied`.
  - **Share** button → `navigator.share({ title: "Join Röbel on Circles", url })`
    when available, else fall back to copy; emit `share_native` (or `share_copied`).
  - A **QR** (`QRCodeSVG` from `qrcode.react`, ~150px, `fgColor="#0b1220"`,
    inside a white `rounded-[14px]` card like `EventInviteView`) encoding the link.
  - Emit `share_opened` when the card first renders with a wallet.
- Use existing buttons styling (navy primary + bordered secondary), icons from
  `icons.tsx` (`Share`, add a `Copy` + `QrCode` if missing — Lucide-style).

### 3.3 Placement
Top of **TownView** (default tab → max reach), above the KPI grid. Pass
`connected` from `App` → `TownView` → `GrowCard`.

### 3.4 Acceptance
- Connected user sees their `…/?ref=0x…` link + QR; Copy and Share work on mobile.
- Opening that link in a fresh session sets `?ref`, and connecting a *different*
  wallet writes exactly one `referral_landed` row with `ref` = the sharer.

---

## 4. F4 — "Your impact" card (rule 02)

Give the connected citizen a personal reason to reopen.

### 4.1 Data — add to `src/lib/circlesData.ts`
```ts
export interface MyImpact {
  balance: number;     // their Röbel Coin (group token) balance
  rank: number | null; // 1-based rank within getReputation, or null if absent
  total: number;       // number of ranked wallets
  inCount: number;     // coins received events
  outCount: number;    // coins sent events
}
export async function getMyImpact(wallet: string, rep: RepNode[]): Promise<MyImpact>
```
- `balance`: `circles_getTokenBalances(wallet)` → the entry whose
  `tokenAddress === ROEBEL_GROUP` (group token), `attoCircles / 1e18`.
  (Same RPC already used in `circles.ts`/`circlesData.ts`.)
- `rank`/`inCount`/`outCount`: find `wallet` (lowercased) in the `rep` array
  (reuse the `getReputation` result TownView/Pulse already fetch — pass it in,
  don't refetch). `rank = index+1`, `total = rep.length`.

### 4.2 UI
In **TownView**, when `connected`, a `ChartCard` titled **"Your impact"** with a
2- or 3-up `KpiCard` row:
- **Your coins** — `fmt(balance,0)` (tone primary, Coins icon)
- **Your rank** — `#{rank} of {total}` (tone success, e.g. Sparkles/Trophy icon)
- optional **Sent / received** — `{outCount}↑ {inCount}↓` (tone info)
If not connected, render nothing (or a one-line "Connect to see your impact").

### 4.3 Acceptance
- A connected citizen sees their real coin balance and reputation rank; values
  match the Pulse leaderboard.

---

## 5. F3 — Weekly CSV export

Client-side CSV download of the town's on-chain data, defaulting to the **last 7
days** (the "weekly" export). No backend needed (pure on-chain → CSV in browser).

### 5.1 Util — `src/lib/csv.ts`
```ts
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string
export function downloadCsv(filename: string, csv: string): void
```
- `toCsv`: header row from `columns` (or `Object.keys(rows[0])`); RFC-4180
  quoting (wrap in `"` and double internal `"` when a value contains `,`, `"`,
  or newline); `\r\n` line endings.
- `downloadCsv`: `Blob([csv], {type:"text/csv;charset=utf-8"})` →
  `URL.createObjectURL` → temporary `<a download>` click → `revokeObjectURL`.
  (Works in the host iframe; if a sandbox blocks it, fall back to
  `window.open(URL...)`.)

### 5.2 UI — export surface in TownView (or a small section in Pulse)
A `ChartCard` titled **"Export data"**, subtitle "Download this week's activity as
CSV.", with a **range toggle** (`Last 7 days` default / `All`) and three buttons:
- **Transfers** → `getRecentTransfers(200)`, filter by `time` within range
  (`time` is unix seconds; `timeAgo`-style cutoff `Date.now()/1000 - 7*86400`),
  columns `[date, kind, from, to, amount, tx]` (`date` = ISO from `time*1000`).
- **Citizens** → from `ROEBEL_CITIZENS` + `getVerifiedSet()`, columns
  `[address, attester, verified]`.
- **Reputation** → from `getReputation`, columns
  `[rank, address, held, inCount, outCount, score, verified]`.
- Filenames: `roebel-<kind>-<YYYY-MM-DD>.csv` (the app may use `new Date()` at
  runtime — fine in the browser). Emit `csv_export {kind, rows}`.

### 5.3 Acceptance
- Each button downloads a well-formed CSV that opens cleanly in Excel/Sheets;
  the 7-day transfer export only contains rows from the last week.

---

## 6. Wiring summary (call sites)

| File | Change |
|------|--------|
| `src/lib/supabase.ts` | **new** — `SUPABASE_URL`, `SUPABASE_ANON` |
| `src/lib/analytics.ts` | **new** — `initAnalytics`, `setAnalyticsWallet`, `track` |
| `src/lib/csv.ts` | **new** — `toCsv`, `downloadCsv` |
| `src/components/GrowCard.tsx` | **new** — referral share |
| `src/components/icons.tsx` | add `Copy`, `QrCode`, `Trophy` (Lucide-style) if used |
| `src/lib/circlesData.ts` | add `getMyImpact` + `MyImpact` |
| `src/App.tsx` | add `connected` state; parse `?ref`; `initAnalytics`; `app_open`; `wallet_connect`; `referral_landed`; `tab_view` on tab change; heartbeat interval (visibility-aware); `setAnalyticsWallet` on connect; pass `connected` to `TownView` |
| `src/views/TownView.tsx` | accept `connected` prop; render `GrowCard` (top), `Your impact` card, `Export data` card; pass the `getReputation` result into `getMyImpact` |
| `src/views/InviteView.tsx` | `track("invite_sent",{count})` / `track("self_fund_sent",{count})` on success |
| `src/views/EventInviteView.tsx` | import supabase consts; `track("event_created",{hours})` on success |

> TownView currently fetches `getVerifiedSet`+`getTownStats`+`getTrustGraph`. To
> power "Your impact" + the reputation CSV without a second pass, also fetch
> `getReputation(verified)` there (Pulse already does it independently — that's
> fine) and pass it to `getMyImpact`.

---

## 7. Global constraints / definition of done

- **English** copy everywhere. Match the shadcn token classes + existing
  primitives; no new design system, no Tailwind config changes.
- **No heavy new deps.** `qrcode.react` is already present. Analytics is plain
  `fetch`. CSV is plain DOM. (Do not add PostHog/Mixpanel/recharts.)
- Mobile-first; everything must look right at ~360px wide inside the iframe.
- `pnpm typecheck` and `pnpm build` clean.
- Analytics must be **non-blocking and silent on failure**.
- Deploy with `npx -y vercel@latest --prod --yes` from `circles-roebel-mini-app/`
  (git push will NOT deploy this app).
- After deploy, sanity-check in the Circles Playground
  (`https://circles.gnosis.io` → load the app URL): app_open + wallet_connect +
  tab_view rows appear in `miniapp_events`; the GrowCard link/QR render; CSV
  downloads.

## 8. Submission checklist (rules 04/05/06)
- Live link works inside the Circles app; wallet connects.
- Referral link shareable from inside the app (F1) → `referral_landed` attributable.
- `miniapp_events` accumulating opens/time/actions (F2) for the weekly snapshot.
- (Repeat winners) keep a running 200-word "what shipped / what's next" note per
  cycle — F1–F4 above are the first cycle's note material.

### Weekly-snapshot queries (run as service role in Supabase)
```sql
-- unique wallets this week
select count(distinct wallet) from miniapp_events
where event in ('app_open','wallet_connect') and wallet is not null
  and created_at >= date_trunc('week', now());
-- time spent (minutes) this week
select round(sum((props->>'secs')::int)/60.0,1) as minutes from miniapp_events
where event = 'heartbeat' and created_at >= date_trunc('week', now());
-- referrals this week (new wallets that connected via someone's link)
select count(distinct wallet) from miniapp_events
where event = 'referral_landed' and created_at >= date_trunc('week', now());
```

---

## 9. Expo app to-dos (for the app-specific agent)

**None of these are required for the mini-app features to work** — they are
*amplifiers* for rule 04 (referrals) and rule 05 (activity). Build them in the
**Röbel Expo app** (`apps/expo/`). Styling there is **StyleSheet + `useTheme()`,
NO NativeWind** (`apps/expo/CLAUDE.md`); UI copy is **German** (primary).

The Röbel app already opens the mini-app at
[`apps/expo/app/my-events.tsx:49`](apps/expo/app/my-events.tsx#L49):
`openBrowserAsync(\`${base}?inviter=${account?.address ?? ''}\`)`, and references
it from `apps/expo/app/profile.tsx`. The mini-app prod URL base is
`https://circles-inviter.vercel.app/` (confirm current prod domain before hardcoding).

### TODO E1 — "Share Röbel Circles" referral action (rule 04)
Add a share entry (e.g. on the rewards/Circles surface or profile) that shares the
**mini-app referral link** carrying the user's wallet as `?ref`:
```
https://circles-inviter.vercel.app/?ref=<connected gnosis wallet, lowercased>
```
Use React Native `Share.share({ message, url })`. When a *friend* opens that link
inside the Circles app and connects a **different** wallet, the mini-app records a
`referral_landed` attributed to the sharer (already implemented in `App.tsx`).
- ⚠️ `?ref=` ≠ `?inviter=`. `?inviter=` (the existing `my-events` link) opens the
  mini-app *as the inviter* for the on-chain invite flow — it is **not** a referral.
  A user passing their own address as `ref` to themselves is a no-op (by design).
- Use the user's **Gnosis/Circles** wallet address (the one the Circles host will
  inject), so the connected wallet inside the mini-app matches for attribution.

### TODO E2 — Prominent "Open Röbel Circles" CTA (rule 05, activity)
Surface a clear button to open the mini-app from the rewards/Circles screen (drives
weekly opens). The `my-events` deep link already exists — promote an equivalent CTA
on the main rewards surface. Keep `?inviter=<wallet>` for the invite flow.

### TODO E3 — (no change) analytics / CSV / impact / GrowCard
All live entirely in the mini-app. No Expo work required for those.
