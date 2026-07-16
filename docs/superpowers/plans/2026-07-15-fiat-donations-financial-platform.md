# Fiat Donations + Community Financial Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone — locals and international supporters — donate to the transparent Gemeinschaftskasse via (a) SEPA bank transfer to the Monerium IBAN that auto-mints EURe into the Safe, (b) Stripe checkout (cards, Apple/Google Pay) whose payouts land on the same IBAN, and (c) direct on-chain transfer, with a donation ledger, donor attribution, and public UX in both apps.

**Architecture:** All money physically lands in the existing Attester Safe `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` on Gnosis as EURe V2 / xDAI. Attribution and status live in a Supabase `donations` ledger fed by two webhooks (Monerium order events, Stripe checkout events) hosted in `apps/web`. The expo app and the public `/spenden` web page are thin clients over `/api/donate/*`. On-chain remains the source of truth for balances; Supabase is only the attribution/metadata layer.

**Tech Stack:** Next.js 15 API routes, `stripe` SDK (existing), Monerium REST webhooks (Svix-style HMAC-SHA256), Supabase Postgres (service-role via `createAdminClient`), Expo Router + StyleSheet/useTheme.

**Research base:** `docs/MONERIUM_FIAT_TREASURY_RESEARCH.md` (verified 2026-07-15). Key verified facts: IBAN→EURe auto-mint into the linked Safe; webhook `order.created`/`order.updated` events signed `v1,<base64 HMAC-SHA256>` over `{webhook-id}.{webhook-timestamp}.{raw body}` with base64-decoded `whsec_` secret; `memo` (5–140 chars) rides on SEPA transfers for attribution; SEPA Instant ≈5 s; zero Monerium fees; EURe V2 = `0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430`.

## Global Constraints

- German UI first (bürgerfreundlich, no crypto jargon — "Röbel Münzen" never "CRC"; never show raw 0x addresses to normal users except the deliberate crypto-donation block)
- Web = Tailwind; Expo = `StyleSheet.create()` + `useTheme()`, Mona Sans font tokens — NO NativeWind
- Primary navy `#00498B`
- pnpm only; commit convention `feat(web): …` / `feat(expo): …`
- Heavy server-only deps must go into `serverExternalPackages` (Stripe SDK is already fine)
- Supabase DDL ships as SQL in `apps/expo/supabase/migrations/` — applying it needs the Supabase MCP (user gate, not authenticated in this session)
- Secrets only via env; `.env.example` gets placeholder entries

## Phase map (the "financial platform")

- **Phase 0 (ops, user):** Monerium KYB completes → link Safe (ERC-1271) → issue IBAN → create webhook subscription → set `app_settings` keys + Vercel env. Stripe: add donation webhook endpoint.
- **Phase 1 (this plan):** EURe V2 migration; donations ledger + both webhooks; `/spenden` page; expo Spenden screen; treasury CTA.
- **Phase 2:** donor wall + campaign targets in-app; Spendenquittung groundwork (needs e.V./gGmbH — see legal research); recurring donations (Stripe subscriptions); admin donations tab in Gemeinschaftskasse dashboard.
- **Phase 3 (platform/revenue):** Monerium Whitelabel partnership → per-citizen/per-Verein named IBANs inside the app (Gnosis Pay model); donation processing for other local orgs with platform fee (ZAG check first); idle-treasury yield (sDAI) under the 50/30/20 constitution; white-label the whole stack for other towns (POLIS).

---

### Task 1: EURe V2 address migration — DONE

**Files (modified):** `apps/expo/lib/roebel-taler.ts:166`, `apps/web/src/lib/muenzen/constants.ts:62`, `apps/mini-apps/roebel-data/src/lib/treasury.ts:14`, `circles-roebel-mini-app/src/lib/treasury.ts:14`
V1 `0xcB444e90…` → V2 `0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430`. Verified on-chain: Safe holds 0.0 on both tokens and has zero historical V1 transfers → pure swap, no legacy history handling needed.

### Task 2: Supabase migration — donations ledger

**Files:**
- Create: `apps/expo/supabase/migrations/donations_ledger.sql`

Tables (RLS enabled, **no** anon policies — all access via service role in web API):

```sql
-- Donations ledger: one row per donation across all rails (sepa | stripe | onchain).
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  rail text not null check (rail in ('sepa','stripe','onchain')),
  status text not null default 'pending' check (status in ('pending','settled','failed','refunded')),
  amount_cents bigint not null check (amount_cents > 0),
  net_amount_cents bigint,
  currency text not null default 'eur',
  donor_name text,
  donor_message text,
  donor_wallet_address text,
  public_visible boolean not null default true,
  reference_code text,
  campaign text,
  stripe_session_id text,
  stripe_payment_intent_id text,
  monerium_order_id text,
  tx_hash text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create unique index if not exists donations_stripe_session_uq on public.donations (stripe_session_id) where stripe_session_id is not null;
create unique index if not exists donations_monerium_order_uq on public.donations (monerium_order_id) where monerium_order_id is not null;
create index if not exists donations_status_created_idx on public.donations (status, created_at desc);

-- Personal SEPA reference codes (find-or-create per wallet; anonymous codes have null wallet).
create table if not exists public.donation_references (
  code text primary key,
  wallet_address text,
  display_name text,
  campaign text,
  created_at timestamptz not null default now()
);
create unique index if not exists donation_references_wallet_uq on public.donation_references (wallet_address) where wallet_address is not null;

-- Raw Monerium webhook events (idempotency + audit).
create table if not exists public.monerium_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  received_at timestamptz not null default now()
);

alter table public.donations enable row level security;
alter table public.donation_references enable row level security;
alter table public.monerium_events enable row level security;
```

`app_settings` keys (seeded by admin, no DDL): `donations_enabled` ('true'/'false'), `donation_iban`, `donation_bic`, `donation_recipient_name`.

### Task 3: Web donations lib

**Files:**
- Create: `apps/web/src/lib/donations/config.ts` — `DONATION_CONFIG` (presets `[500,1000,2500,5000,10000]`, min 100, max 500000 cents), `TREASURY_SAFE` re-export, `TreasuryDonationMetadata` type + `parseTreasuryDonationMetadata()` (mirrors `parseRoebelCardMetadata`), reference-code generator `generateDonationCode()` → `RBL-` + 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, `DONATION_CODE_REGEX = /RBL-[A-HJ-NP-Z2-9]{6}/i`.
- Create: `apps/web/src/lib/donations/monerium.ts` — webhook verification + payload types:

```ts
export function verifyMoneriumSignature(opts: {
  rawBody: string; webhookId: string | null; webhookTimestamp: string | null;
  signatureHeader: string | null; secret: string; // whsec_…
}): boolean {
  if (!opts.webhookId || !opts.webhookTimestamp || !opts.signatureHeader) return false;
  const key = Buffer.from(opts.secret.replace(/^whsec_/, ""), "base64");
  const signed = `${opts.webhookId}.${opts.webhookTimestamp}.${opts.rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");
  // header may list several space-separated `v1,<sig>` entries (Svix format)
  return opts.signatureHeader.split(" ").some((part) => {
    const sig = part.startsWith("v1,") ? part.slice(3) : part;
    try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
  });
}
```

plus `MoneriumOrderEvent` type (`{ type, timestamp, data: { id, kind: 'issue'|'redeem', amount, memo?, address, chain, currency, state: 'placed'|'pending'|'processed'|'rejected', meta?: { txHashes?, rejectedReason? } } }`) and `getDonationSettings()` (reads the four `app_settings` keys via admin client, 5-min in-memory cache, env fallbacks `DONATION_IBAN` etc.).

### Task 4: API routes

**Files (all Create, all `force-dynamic`):**
- `apps/web/src/app/api/donate/config/route.ts` — GET, public: `{ enabled, iban, bic, recipient, presets_cents, min_cents, max_cents, treasury_safe }` (IBAN grouped in 4-blocks for display client-side).
- `apps/web/src/app/api/donate/reference/route.ts` — POST `{ wallet_address?, display_name? }` → find-or-create `donation_references` row → `{ code }`. Rate-limit-friendly: find-or-create keyed on wallet; anonymous → new code each call.
- `apps/web/src/app/api/donate/create-checkout/route.ts` — POST `{ amount_cents, donor_name?, donor_message?, wallet_address?, public_visible?, locale? }` → validate → insert pending `donations` row (rail 'stripe') → `stripe.checkout.sessions.create({ mode:'payment', submit_type:'donate', locale, line_items:[{ price_data: { currency:'eur', unit_amount, product_data: { name:'Spende — Gemeinschaftskasse Röbel/Müritz', description:'Transparente Spende in die öffentliche Gemeinschaftskasse' } }, quantity:1 }], metadata: TreasuryDonationMetadata, success_url: '/spenden/danke?session_id={CHECKOUT_SESSION_ID}&return_to=…', cancel_url: '/spenden?cancelled=true' })` → back-fill `stripe_session_id`, rollback row on Stripe error (mirrors roebel-card route).
- `apps/web/src/app/api/donate/webhook/route.ts` — POST, Stripe signature via `STRIPE_WEBHOOK_SECRET_DONATIONS ?? STRIPE_WEBHOOK_SECRET`; on `checkout.session.completed` with `metadata.kind === 'treasury_donation'`: flip donation row → settled (idempotent via status check + unique index), fetch payment intent → latest charge → balance transaction to store `net_amount_cents`; ignore foreign sessions silently. GET healthcheck like roebel-card webhook.
- `apps/web/src/app/api/donate/recent/route.ts` — GET, public: last 20 settled donations, ONLY `{ display_name (donor_name ?? 'Anonym'), amount_cents, message, rail, settled_at }` — never wallet addresses.
- `apps/web/src/app/api/monerium/webhook/route.ts` — POST: read raw body, verify via `verifyMoneriumSignature` (secret `MONERIUM_WEBHOOK_SECRET`); `subscription.created` → 200. Insert `monerium_events` (PK conflict → duplicate no-op). For order events: only `kind === 'issue'` AND `data.address` == treasury Safe (case-insensitive) are donations; upsert `donations` by `monerium_order_id` (state placed/pending → 'pending', processed → 'settled' + `settled_at` + `tx_hash`, rejected → 'failed'); attribute donor via `DONATION_CODE_REGEX` match in `memo` → `donation_references`; unmatched memo → `donor_name = null` (Anonym), keep memo out of public payloads (may contain donor bank text). GET healthcheck reporting `has_secret`.

### Task 5: Public web page `/spenden`

**Files:**
- Create: `apps/web/src/app/spenden/page.tsx` (server: fetch settings + treasury euro via `treasuryEuro()` + recent donations, render) + `apps/web/src/app/spenden/DonateWidget.tsx` (client: preset/custom amount, name/message inputs, Stripe button → create-checkout redirect; SEPA block with IBAN copy + generated reference; collapsible on-chain block with Safe address + GnosisScan link)
- Create: `apps/web/src/app/spenden/danke/page.tsx` — thank-you + `return_to` deep-link back into the app (mirrors `/roebel-card/success` pattern)

German copy, navy #00498B, transparent-treasury framing ("Jeder Euro öffentlich sichtbar"), link to app + `/treasury` view.

### Task 6: Expo Spenden screen

**Files:**
- Create: `apps/expo/lib/donations.ts` — API client (`fetchDonationConfig`, `fetchDonationReference`, `createDonationCheckout`, `openDonationCheckout` via `expo-web-browser` FORM_SHEET — mirrors `roebel-card-topup.ts` incl. `friendlyError`)
- Create: `apps/expo/app/donate.tsx` — "Spenden" screen: hero (piggy-bank + treasury framing), amount presets + custom input → Stripe checkout; "Per Banküberweisung" card (recipient, IBAN copyable via `expo-clipboard`, BIC, personal reference code with copy, "SEPA-Echtzeitüberweisung: in Sekunden in der Kasse"); collapsible "Krypto" card (Safe address copy); disabled state when `!enabled` ("Bald verfügbar"); StyleSheet + useTheme, Mona Sans tokens.
- Modify: `apps/expo/app/treasury.tsx` — "Spenden" primary CTA → `/donate`
- Modify: `apps/expo/app/gemeinschaftskasse-info.tsx` — closing CTA section → `/donate`
- Modify: `apps/expo/app/_layout.tsx` — register `donate` screen if screens are explicitly registered there

### Task 7: Env + docs

**Files:**
- Modify: `apps/web/.env.example` — `MONERIUM_WEBHOOK_SECRET=whsec_...`, `STRIPE_WEBHOOK_SECRET_DONATIONS=whsec_...`, `DONATION_IBAN=`, `DONATION_BIC=`, `DONATION_RECIPIENT_NAME=`
- Modify: `docs/MONERIUM_FIAT_TREASURY_RESEARCH.md` — fill §5 (Stripe) + §6 (legal) from follow-up research
- Create: `docs/DONATIONS_OPERATIONS.md` — go-live runbook: Monerium KYB → link Safe → issue IBAN → `POST /webhooks` subscription (secret gen command) → Stripe webhook endpoint → app_settings seeding → sandbox test (simulated incoming transfer) → Vercel env

### Verification

- `cd apps/web && pnpm lint` (donations files clean; repo has pre-existing tsc errors — check only new-file diagnostics)
- Monerium verifier: node one-off against a synthetic Svix-signed payload (sign + verify round-trip)
- Stripe webhook: `stripe` CLI or synthetic constructEvent round-trip is out of scope without keys — GET healthchecks + code review
- Expo: screen renders in both themes; navigation from treasury CTA
