# Stripe Connect Tickets (Slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organisation connects its own Stripe account from the Expo app, adds ticket types to an event, a citizen buys tickets in the app, the org receives the money minus a small platform fee, the citizen gets QR tickets, the org scans them at the door.

**Architecture:** Stripe Connect with v1 accounts + controller properties (full dashboard, Stripe collects fees and losses, Stripe collects requirements) and **direct charges** created on the connected account with `application_fee_amount`. All Stripe calls live in `apps/web` API routes (Next.js, service-role Supabase), the Expo app talks to them with wallet-signed requests (same message format as the `org-membership` edge function) and opens Stripe-hosted onboarding and Checkout in the system browser sheet via `expo-web-browser`. No native module changes; everything ships by OTA.

**Tech Stack:** Next.js 15 route handlers, `stripe` 20.x (already in apps/web), `viem` 2.x (signature verification), Supabase Postgres (migration + RLS + one locking SQL function), Expo SDK 56 / expo-router / `expo-web-browser` / `react-native-qrcode-svg` (installed), jest-expo for Expo tests, `tsx --test` (root devDependency) for web pure-logic tests.

**Spec:** `docs/future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md` §7 (architecture) and §8.0 (dashboard choices). Read §1.2, §7 and §8.0 before starting.

## Global Constraints

- UI copy German; identifiers and comments English (`feedback_code_english_ui_german`).
- Expo styling: `StyleSheet.create()` + `useTheme()` from `@/context/ThemeContext`; no NativeWind. Fonts as in `apps/expo/app/org/settings.tsx` (`Inter-*`, `MonaSansSemiCondensed-*`).
- Never show a raw wallet address in UI; show names or nothing.
- Never say "CRC"; the community currency is "Röbel Münzen". Never use "Spende".
- Direct charges only. Never `transfer_data`, never `on_behalf_of`, never a Stripe call without the `stripeAccount` request option when the object belongs to a connected account.
- Platform fee: `feeCents = round(amount * STRIPE_PLATFORM_FEE_BPS / 10000) + STRIPE_PLATFORM_FEE_FIXED_CENTS`, defaults `200` bps and `10` cents, capped at `amount - 1`; omitted entirely when 0 or when the order is free. Refunds always pass `refund_application_fee: true`.
- Stripe keys for Connect: `STRIPE_CONNECT_SECRET_KEY` with fallback `STRIPE_SECRET_KEY_SANDBOX`. A key starting with `sk_live_` marks `livemode = true`; sandbox-created connected accounts are ignored by live code and vice versa.
- Feature flags in `app_settings`: `stripe_connect_enabled` (org side, allowlist pattern of `isStablecoinPaymentsEnabled`) and `stripe_tickets_enabled` (citizen side, `'true'` only). Missing = off. `__DEV__` = on.
- Commit after every task with pathspecs only (`git add <files>`), never `git add .`; other sessions have uncommitted files in this tree. Push after each commit.
- Migrations are applied with the Supabase MCP by the main session, never by a subagent; the subagent only writes the SQL file.
- Expo tests: `cd apps/expo && npx jest --watchAll=false <file>`. Web tests: `npx tsx --test <file>` from the repo root.

## File map

Web (`apps/web/src`):
- `lib/stripe-connect.ts` — lazy Connect client, fee maths, livemode flag. (new)
- `lib/tickets/codes.ts` — ticket code generation, QR payload HMAC, payload parsing. (new)
- `lib/signed-request/message.ts` — message builder shared with Expo (scope `roebel-tickets-v1`). (new)
- `lib/signed-request/verify.ts` — signature verification (EOA + ERC-1271/6492 on Gnosis), timestamp window. (new)
- `lib/tickets/authz.ts` — org role lookup via `account_owners`. (new)
- `lib/tickets/settle.ts` — mark order paid, mint tickets, push. (new)
- `app/api/connect/onboard/route.ts`, `app/api/connect/status/route.ts` (new)
- `app/api/tickets/types/route.ts`, `app/api/tickets/checkout/route.ts`, `app/api/tickets/order/route.ts`, `app/api/tickets/mine/route.ts`, `app/api/tickets/checkin/route.ts`, `app/api/tickets/refund/route.ts` (new)
- `app/api/webhooks/stripe-connect/route.ts` (new)
- `app/connect/return/page.tsx`, `app/tickets/return/page.tsx` — bounce pages back into the app. (new)
- `scripts/stripe-connect-smoke.mjs` — add `webhook` subcommand. (modify)
- `.env.example` — new variables. (modify)

Expo (`apps/expo`):
- `lib/signed-request.ts` — sign + POST helper for the web API. (new)
- `lib/stripe-connect.ts` — org-side API client + browser sheet. (new)
- `lib/tickets.ts` — types, API client, pure helpers. (new)
- `lib/supabase-app-settings.ts` — two flags. (modify)
- `components/QRScanner.tsx` — `ticket` payload type. (modify)
- `app/org/payments.tsx`, `app/org/event-tickets/[id].tsx`, `app/org/scan-tickets.tsx`, `app/event/[id]/tickets.tsx`, `app/tickets/index.tsx`, `app/tickets/[order].tsx` (new)
- `app/org/settings.tsx`, `app/edit-event/[id].tsx`, `app/event/[id].tsx`, `components/profile/ProfileActionGrid.tsx` — entry points. (modify)

Database: `supabase/migrations/20260921_stripe_connect_tickets.sql` (new).

Docs: `docs/buergerrat/2026-09-18_APP_CONTRIBUTION_STRATEGY.md` R5 amendment (modify).

---

### Task 0: Policy amendment, env documentation, webhook helper

**Files:**
- Modify: `docs/buergerrat/2026-09-18_APP_CONTRIBUTION_STRATEGY.md:33` (R5 row) and `:133`
- Modify: `apps/web/.env.example` (after the `STRIPE_SECRET_KEY_SANDBOX` line)
- Modify: `apps/web/scripts/stripe-connect-smoke.mjs`

**Interfaces:**
- Produces: env names `STRIPE_CONNECT_SECRET_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `TICKET_QR_SECRET`, `STRIPE_PLATFORM_FEE_BPS`, `STRIPE_PLATFORM_FEE_FIXED_CENTS`, `NEXT_PUBLIC_WEB_BASE_URL` used by every later web task.

- [ ] **Step 1: Amend R5.** Replace the R5 row's second and third cells so the row reads:

```markdown
| R5 | **Money only on rails where the platform never holds it.** Münzen rewards and tips, Gemeinschaftskasse honoraria, and Stripe Connect direct charges that settle into the org's own Stripe account (the org is merchant of record; the platform takes a small application fee that Stripe deducts before settlement). No forwarded donations, no cooperative shares, no money held for third parties. | Holding or forwarding other people's money is Finanztransfergeschäft (ZAG); there is no e.V. or eG yet ([legal masterplan](../future-research/LEGAL_MASTERPLAN.md)). Direct charges keep the platform outside the money flow ([Stripe Connect assessment](../future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md) §1.2, decided by Max 2026-09-21). |
```

and change line 133 to:

```markdown
4. **Pop-up events** are events; ticketing runs on Stripe Connect direct charges (R5, amended 2026-09-21), free RSVP uses the same ticket model.
```

- [ ] **Step 2: Document env vars.** Append after the `STRIPE_SECRET_KEY_SANDBOX=sk_test_placeholder` line in `apps/web/.env.example`:

```bash
# Stripe Connect (event tickets). Sandbox key now, live key after platform approval.
# Falls back to STRIPE_SECRET_KEY_SANDBOX when unset. sk_live_ => livemode rows.
STRIPE_CONNECT_SECRET_KEY=sk_test_placeholder
# Signing secret of the Connect webhook endpoint ("Listen to events on connected accounts").
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_placeholder
# HMAC secret for ticket QR payloads (any 32+ random bytes, hex). Rotating it voids unscanned QR codes.
TICKET_QR_SECRET=change_me_64_hex_chars
# Platform fee per paid ticket order: bps of the amount plus a fixed part, capped at amount-1.
STRIPE_PLATFORM_FEE_BPS=200
STRIPE_PLATFORM_FEE_FIXED_CENTS=10
# Public base URL used for Stripe return/refresh/success URLs.
NEXT_PUBLIC_WEB_BASE_URL=https://www.roebel.app
```

- [ ] **Step 3: Add the `webhook` subcommand** to `apps/web/scripts/stripe-connect-smoke.mjs`. Add this function next to `fees` and register it in `commands`:

```js
async function webhook(url) {
  if (!/^https:\/\//.test(url ?? "")) throw new Error("webhook <https url> is required");
  const endpoint = await stripe.webhookEndpoints.create({
    url,
    connect: true,
    enabled_events: [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "charge.refunded",
      "account.updated",
    ],
    description: "Röbel App Connect webhook (sandbox)",
  });
  console.log(`Connect webhook ${endpoint.id} → ${endpoint.url}\nSTRIPE_CONNECT_WEBHOOK_SECRET=${endpoint.secret}\n(put this in Vercel + .env.local; it is shown only once)`);
}
```

Update the usage comment at the top with the new line `... stripe-connect-smoke.mjs webhook https://www.roebel.app/api/webhooks/stripe-connect`.

- [ ] **Step 4: Verify** `node --check apps/web/scripts/stripe-connect-smoke.mjs` prints nothing (exit 0).

- [ ] **Step 5: Commit**

```bash
git add docs/buergerrat/2026-09-18_APP_CONTRIBUTION_STRATEGY.md apps/web/.env.example apps/web/scripts/stripe-connect-smoke.mjs
git commit -m "docs(buergerrat): amend R5 for Stripe Connect direct charges; env + webhook helper for tickets"
git push
```

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260921_stripe_connect_tickets.sql`

**Interfaces:**
- Produces tables `stripe_connected_accounts`, `ticket_types`, `ticket_orders`, `tickets`, `stripe_events`; function `reserve_tickets(uuid, int, text, int)` returning a `ticket_orders` row or raising `sold_out | not_on_sale | per_order_max | too_many_pending | event_not_bookable`; function `expire_ticket_orders()`.

- [ ] **Step 1: Write the migration** with exactly this content:

```sql
-- Stripe Connect event tickets (slice A). Design: docs/future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md §7.
-- Access model: RLS on everywhere. Citizens read ticket_types with the anon key; every other read and
-- every write goes through apps/web API routes (service role) after wallet-signature verification.

create table if not exists stripe_connected_accounts (
  account_id uuid primary key references accounts(id) on delete cascade,
  stripe_account_id text not null unique,
  livemode boolean not null default false,
  dashboard_type text not null default 'full',
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_currently_due jsonb not null default '[]'::jsonb,
  disabled_reason text,
  created_by_wallet text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table stripe_connected_accounts is 'One Stripe Connect account per org account. Mirror of Stripe state; Stripe is the truth.';

create table if not exists ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'eur',
  capacity integer check (capacity is null or capacity > 0),
  per_order_max integer not null default 10 check (per_order_max between 1 and 50),
  sales_start timestamptz,
  sales_end timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ticket_types_event_idx on ticket_types (event_id, sort_order);

create table if not exists ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 50),
  buyer_wallet text not null,
  buyer_email text,
  amount_cents integer not null check (amount_cents >= 0),
  application_fee_cents integer not null default 0 check (application_fee_cents >= 0),
  currency text not null default 'eur',
  rail text not null default 'stripe' check (rail in ('stripe', 'free', 'eure')),
  livemode boolean not null default false,
  stripe_account_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create unique index if not exists ticket_orders_session_uq on ticket_orders (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create index if not exists ticket_orders_buyer_idx on ticket_orders (buyer_wallet, created_at desc);
create index if not exists ticket_orders_type_status_idx on ticket_orders (ticket_type_id, status);
create index if not exists ticket_orders_pi_idx on ticket_orders (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ticket_orders(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id) on delete cascade,
  code text not null unique,
  holder_wallet text not null,
  status text not null default 'issued' check (status in ('issued', 'checked_in', 'refunded', 'void')),
  checked_in_at timestamptz,
  checked_in_by_wallet text,
  created_at timestamptz not null default now()
);
create index if not exists tickets_holder_idx on tickets (holder_wallet, created_at desc);
create index if not exists tickets_event_idx on tickets (event_id, status);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  account text,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table stripe_connected_accounts enable row level security;
alter table ticket_types enable row level security;
alter table ticket_orders enable row level security;
alter table tickets enable row level security;
alter table stripe_events enable row level security;

-- Only ticket_types is client-readable (active rows). No client writes anywhere.
drop policy if exists ticket_types_read_active on ticket_types;
create policy ticket_types_read_active on ticket_types for select using (is_active = true);
revoke all on stripe_connected_accounts, ticket_orders, tickets, stripe_events from anon, authenticated;
revoke insert, update, delete on ticket_types from anon, authenticated;

-- Reserve seats atomically: locks the ticket type row, counts paid + unexpired pending orders.
create or replace function reserve_tickets(
  p_ticket_type_id uuid, p_quantity integer, p_buyer_wallet text, p_hold_minutes integer default 35
) returns ticket_orders
language plpgsql security definer set search_path = public as $$
declare
  tt ticket_types%rowtype;
  ev events%rowtype;
  sold integer;
  pending_for_buyer integer;
  new_order ticket_orders%rowtype;
begin
  select * into tt from ticket_types where id = p_ticket_type_id for update;
  if not found or not tt.is_active then raise exception 'not_on_sale'; end if;
  if tt.sales_start is not null and tt.sales_start > now() then raise exception 'not_on_sale'; end if;
  if tt.sales_end is not null and tt.sales_end < now() then raise exception 'not_on_sale'; end if;
  if p_quantity < 1 or p_quantity > tt.per_order_max then raise exception 'per_order_max'; end if;

  select * into ev from events where id = tt.event_id;
  if not found or ev.status <> 'approved' or coalesce(ev.is_cancelled, false) then raise exception 'event_not_bookable'; end if;

  select count(*) into pending_for_buyer from ticket_orders
    where ticket_type_id = tt.id and buyer_wallet = lower(p_buyer_wallet)
      and status = 'pending' and expires_at > now();
  if pending_for_buyer >= 2 then raise exception 'too_many_pending'; end if;

  if tt.capacity is not null then
    select coalesce(sum(quantity), 0) into sold from ticket_orders
      where ticket_type_id = tt.id
        and (status = 'paid' or (status = 'pending' and expires_at > now()));
    if sold + p_quantity > tt.capacity then raise exception 'sold_out'; end if;
  end if;

  insert into ticket_orders (event_id, ticket_type_id, account_id, quantity, buyer_wallet, amount_cents, currency, rail, status, expires_at, paid_at)
  values (
    tt.event_id, tt.id, tt.account_id, p_quantity, lower(p_buyer_wallet),
    tt.price_cents * p_quantity, tt.currency,
    case when tt.price_cents = 0 then 'free' else 'stripe' end,
    case when tt.price_cents = 0 then 'paid' else 'pending' end,
    case when tt.price_cents = 0 then null else now() + make_interval(mins => p_hold_minutes) end,
    case when tt.price_cents = 0 then now() else null end
  ) returning * into new_order;
  return new_order;
end $$;

create or replace function expire_ticket_orders() returns integer
language sql security definer set search_path = public as $$
  with u as (
    update ticket_orders set status = 'expired'
    where status = 'pending' and expires_at is not null and expires_at < now()
    returning 1
  ) select count(*)::integer from u;
$$;

-- Supabase grants EXECUTE to anon/authenticated on every new function by default; these are service-role only.
revoke execute on function reserve_tickets(uuid, integer, text, integer) from public, anon, authenticated;
revoke execute on function expire_ticket_orders() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-ticket-orders', '*/10 * * * *', $cron$ select public.expire_ticket_orders(); $cron$);
  end if;
end $$;
```

- [ ] **Step 2: Sanity check the SQL parses** by reading it once more against the interface above (names, status values). No local Postgres exists; the main session applies it with the Supabase MCP after `get_project_url` confirms project `wwbeqhkslxdxhktqzqti`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260921_stripe_connect_tickets.sql
git commit -m "feat(db): Stripe Connect accounts, ticket types, orders, tickets, webhook event log"
git push
```

---

### Task 2: Web libraries — Connect client, fee maths, ticket codes

**Files:**
- Create: `apps/web/src/lib/stripe-connect.ts`
- Create: `apps/web/src/lib/tickets/codes.ts`
- Test: `apps/web/src/lib/tickets/codes.test.ts`, `apps/web/src/lib/stripe-connect.test.ts`

**Interfaces:**
- Produces: `stripeConnect: Stripe` (lazy), `isConnectLivemode(): boolean`, `platformFeeCents(amountCents: number): number`, `webBaseUrl(): string`, `generateTicketCode(): string`, `ticketQrPayload(code: string): string`, `parseTicketQrPayload(payload: string): { code: string } | null` (verifies HMAC).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/stripe-connect.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { platformFeeCents } from "./stripe-connect";

test("fee = 2% + 10ct by default", () => {
  process.env.STRIPE_PLATFORM_FEE_BPS = "200";
  process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS = "10";
  assert.equal(platformFeeCents(1000), 30);
  assert.equal(platformFeeCents(500), 20);
});
test("fee never reaches the amount and is 0 for free orders", () => {
  process.env.STRIPE_PLATFORM_FEE_BPS = "200";
  process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS = "10";
  assert.equal(platformFeeCents(0), 0);
  assert.equal(platformFeeCents(5), 4);
});
test("fee can be switched off", () => {
  process.env.STRIPE_PLATFORM_FEE_BPS = "0";
  process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS = "0";
  assert.equal(platformFeeCents(1000), 0);
});
```

`apps/web/src/lib/tickets/codes.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTicketCode, ticketQrPayload, parseTicketQrPayload } from "./codes";

process.env.TICKET_QR_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("codes are 10 chars of Crockford-ish base32 without ambiguous letters", () => {
  const code = generateTicketCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.notEqual(code, generateTicketCode());
});
test("payload round-trips and a tampered payload is rejected", () => {
  const code = generateTicketCode();
  const payload = ticketQrPayload(code);
  assert.match(payload, /^roebel-ticket:v1:[A-HJ-NP-Z2-9]{10}:[0-9a-f]{16}$/);
  assert.deepEqual(parseTicketQrPayload(payload), { code });
  assert.equal(parseTicketQrPayload(payload.slice(0, -1) + "0"), null);
  assert.equal(parseTicketQrPayload("roebel-card:v2:x"), null);
});
```

- [ ] **Step 2: Run to verify they fail**: `npx tsx --test apps/web/src/lib/stripe-connect.test.ts apps/web/src/lib/tickets/codes.test.ts` → fails with module not found.

- [ ] **Step 3: Implement** `apps/web/src/lib/stripe-connect.ts`:

```ts
import Stripe from "stripe";

// Stripe Connect client for event tickets. Sandbox key until the platform is approved,
// then STRIPE_CONNECT_SECRET_KEY becomes the live key. Lazy like lib/stripe.ts so a
// missing key never breaks `next build`.
function readConnectKey(): string | undefined {
  return process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY_SANDBOX;
}

let client: Stripe | null = null;
export const stripeConnect: Stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    if (!client) {
      const key = readConnectKey();
      if (!key) throw new Error("STRIPE_CONNECT_SECRET_KEY (or STRIPE_SECRET_KEY_SANDBOX) is not set.");
      client = new Stripe(key);
    }
    return Reflect.get(client, prop, client);
  },
});

export function isConnectLivemode(): boolean {
  return (readConnectKey() ?? "").startsWith("sk_live_");
}

export function isConnectConfigured(): boolean {
  return !!readConnectKey();
}

/** Platform fee for one paid order: bps of amount + fixed part, capped so the org always nets ≥ 1 ct. */
export function platformFeeCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  const bps = Number(process.env.STRIPE_PLATFORM_FEE_BPS ?? "200");
  const fixed = Number(process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS ?? "10");
  const raw = Math.round((amountCents * (Number.isFinite(bps) ? bps : 0)) / 10000) + (Number.isFinite(fixed) ? fixed : 0);
  return Math.max(0, Math.min(raw, amountCents - 1));
}

export function webBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "https://www.roebel.app").replace(/\/$/, "");
}
```

`apps/web/src/lib/tickets/codes.ts`:
```ts
import { createHmac, randomBytes } from "node:crypto";

// Ticket codes: 10 chars from an alphabet without 0/O/1/I so door staff can read them aloud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAYLOAD_RE = /^roebel-ticket:v1:([A-HJ-NP-Z2-9]{10}):([0-9a-f]{16})$/;

export function generateTicketCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function secret(): string {
  const s = process.env.TICKET_QR_SECRET;
  if (!s || s.length < 32) throw new Error("TICKET_QR_SECRET is not set (need ≥ 32 chars).");
  return s;
}

function mac(code: string): string {
  return createHmac("sha256", secret()).update(`roebel-ticket:v1:${code}`).digest("hex").slice(0, 16);
}

/** QR payload printed in the app: roebel-ticket:v1:<code>:<hmac16>. */
export function ticketQrPayload(code: string): string {
  return `roebel-ticket:v1:${code}:${mac(code)}`;
}

/** Returns the code when the HMAC matches, else null. Cheap rejection before any DB lookup. */
export function parseTicketQrPayload(payload: string): { code: string } | null {
  const m = PAYLOAD_RE.exec(payload.trim());
  if (!m) return null;
  return mac(m[1]) === m[2] ? { code: m[1] } : null;
}
```

- [ ] **Step 4: Run the tests** → both files PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/stripe-connect.ts apps/web/src/lib/stripe-connect.test.ts apps/web/src/lib/tickets/codes.ts apps/web/src/lib/tickets/codes.test.ts
git commit -m "feat(web): Stripe Connect client, platform fee maths, HMAC ticket codes"
git push
```

---

### Task 3: Web signed-request verification and org authorization

**Files:**
- Create: `apps/web/src/lib/signed-request/message.ts`
- Create: `apps/web/src/lib/signed-request/verify.ts`
- Create: `apps/web/src/lib/tickets/authz.ts`
- Test: `apps/web/src/lib/signed-request/message.test.ts`

**Interfaces:**
- Produces: `SIGNED_SCOPE = "roebel-tickets-v1"`, `TicketAction` union, `buildSignedMessage(scope, action, wallet, ts, payload)`, `verifySignedRequest(body: unknown, opts: { actions: readonly TicketAction[] }): Promise<VerifyOk | VerifyFail>` with `VerifyOk = { ok: true; wallet: string; action: TicketAction; payload: Record<string, unknown> }` and `VerifyFail = { ok: false; status: number; code: string; message: string }`; `roleInAccount(admin, accountId, wallet): Promise<"owner"|"admin"|"member"|null>`; `jsonOk(data)`, `jsonFail(status, code, message)` helpers.
- The Expo side (Task 9) produces bodies `{ scope, action, wallet, timestampSec, payload, signature }` with the identical message string.

- [ ] **Step 1: Write the failing test** `apps/web/src/lib/signed-request/message.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildSignedMessage, SIGNED_SCOPE } from "./message";

test("message matches the org-membership grammar with a ticket scope", () => {
  const payload = { b: 2, a: "x" };
  const expectedHash = createHash("sha256").update(JSON.stringify({ a: "x", b: 2 })).digest("hex");
  assert.equal(
    buildSignedMessage(SIGNED_SCOPE, "checkout", "0xABC", 1700000000, payload),
    `roebel-tickets-v1:checkout:0xabc:1700000000:${expectedHash}`,
  );
});
```

- [ ] **Step 2: Run** `npx tsx --test apps/web/src/lib/signed-request/message.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `message.ts` (reuses the byte-identical hash from org-membership):
```ts
import { hashPayload } from "@/lib/org-membership/message";

export const SIGNED_SCOPE = "roebel-tickets-v1" as const;
export const MAX_SIGNED_AGE_SECONDS = 300;

export type TicketAction =
  | "connect_onboard" | "connect_status" | "ticket_types_upsert" | "checkout"
  | "order_status" | "tickets_list" | "checkin" | "refund_order";

export function buildSignedMessage(
  scope: string, action: string, wallet: string, timestampSec: number, payload: Record<string, unknown>,
): string {
  return `${scope}:${action}:${wallet.toLowerCase()}:${timestampSec}:${hashPayload(payload)}`;
}
```

`verify.ts` (server only; mirrors the edge function's EOA-then-ERC-1271/6492 order and its 503-vs-401 discipline):
```ts
import { NextResponse } from "next/server";
import { createPublicClient, http, recoverMessageAddress } from "viem";
import { gnosis } from "viem/chains";
import { buildSignedMessage, MAX_SIGNED_AGE_SECONDS, SIGNED_SCOPE, type TicketAction } from "./message";

export type VerifyOk = { ok: true; wallet: string; action: TicketAction; payload: Record<string, unknown> };
export type VerifyFail = { ok: false; status: number; code: string; message: string };

const gnosisClient = createPublicClient({
  chain: gnosis,
  transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com"),
});

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const SIG_RE = /^0x[a-fA-F0-9]{130,}$/;

export async function verifySignedRequest(
  body: unknown, opts: { actions: readonly TicketAction[] },
): Promise<VerifyOk | VerifyFail> {
  const b = (body ?? {}) as Record<string, unknown>;
  const { scope, action, wallet, timestampSec, payload, signature } = b;
  if (scope !== SIGNED_SCOPE || typeof action !== "string" || !opts.actions.includes(action as TicketAction)) {
    return { ok: false, status: 400, code: "BAD_REQUEST", message: "unknown scope or action" };
  }
  if (typeof wallet !== "string" || !WALLET_RE.test(wallet)) return { ok: false, status: 400, code: "BAD_REQUEST", message: "wallet malformed" };
  if (typeof signature !== "string" || !SIG_RE.test(signature)) return { ok: false, status: 401, code: "BAD_SIGNATURE", message: "signature malformed" };
  const ts = Number(timestampSec);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SIGNED_AGE_SECONDS) {
    return { ok: false, status: 400, code: "STALE", message: "message expired" };
  }
  const payloadObj = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const message = buildSignedMessage(SIGNED_SCOPE, action, wallet, ts, payloadObj);
  const claimed = wallet.toLowerCase();

  let verified = false;
  try {
    verified = (await recoverMessageAddress({ message, signature: signature as `0x${string}` })).toLowerCase() === claimed;
  } catch { /* not an EOA signature */ }
  if (!verified) {
    try {
      verified = await gnosisClient.verifyMessage({ address: claimed as `0x${string}`, message, signature: signature as `0x${string}` });
    } catch (err) {
      console.error("[signed-request] verifier unreachable", err);
      return { ok: false, status: 503, code: "VERIFY_UNAVAILABLE", message: "could not reach verification RPC" };
    }
  }
  if (!verified) return { ok: false, status: 401, code: "BAD_SIGNATURE", message: "signer does not match wallet" };
  return { ok: true, wallet: claimed, action: action as TicketAction, payload: payloadObj };
}

export function jsonOk(data: unknown = null) {
  return NextResponse.json({ ok: true, data });
}
export function jsonFail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}
export function failResponse(f: VerifyFail) {
  return jsonFail(f.status, f.code, f.message);
}
```

`apps/web/src/lib/tickets/authz.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgRole = "owner" | "admin" | "member";

/** Role of `wallet` in org `accountId`, via account_owners (addresses may be checksummed → ilike). */
export async function roleInAccount(admin: SupabaseClient, accountId: string, wallet: string): Promise<OrgRole | null> {
  const { data } = await admin
    .from("account_owners")
    .select("role")
    .eq("account_id", accountId)
    .ilike("wallet_address", wallet)
    .maybeSingle();
  const role = data?.role;
  return role === "owner" || role === "admin" || role === "member" ? role : null;
}

export function canManage(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}
```

- [ ] **Step 4: Run the test** → PASS. Also `cd apps/web && npx tsc --noEmit -p . 2>&1 | grep -E "signed-request|tickets/authz|stripe-connect" ` → no lines (judge only these files; the repo baseline has unrelated errors).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/signed-request apps/web/src/lib/tickets/authz.ts
git commit -m "feat(web): wallet-signed request verification (EOA + ERC-1271/6492) and org role lookup"
git push
```

---

### Task 4: Connect onboarding + status routes and the return page

**Files:**
- Create: `apps/web/src/app/api/connect/onboard/route.ts`
- Create: `apps/web/src/app/api/connect/status/route.ts`
- Create: `apps/web/src/lib/tickets/connect-status.ts`
- Create: `apps/web/src/app/connect/return/page.tsx`

**Interfaces:**
- Consumes: `verifySignedRequest`, `failResponse`, `jsonOk`, `jsonFail` (Task 3); `roleInAccount`, `canManage` (Task 3); `stripeConnect`, `isConnectLivemode`, `webBaseUrl` (Task 2); `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `ConnectStatus = { connected: boolean; stripe_account_id: string | null; details_submitted: boolean; charges_enabled: boolean; payouts_enabled: boolean; currently_due: string[]; disabled_reason: string | null; livemode: boolean }`; `syncConnectedAccount(admin, accountId): Promise<ConnectStatus>` (also used by the webhook in Task 7); POST bodies are signed requests with `payload.account_id`.

- [ ] **Step 1: `connect-status.ts`**
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripeConnect, isConnectLivemode } from "@/lib/stripe-connect";

export type ConnectStatus = {
  connected: boolean; stripe_account_id: string | null; details_submitted: boolean; charges_enabled: boolean;
  payouts_enabled: boolean; currently_due: string[]; disabled_reason: string | null; livemode: boolean;
};

export const EMPTY_STATUS: ConnectStatus = {
  connected: false, stripe_account_id: null, details_submitted: false, charges_enabled: false,
  payouts_enabled: false, currently_due: [], disabled_reason: null, livemode: false,
};

export function statusFromAccount(acct: Stripe.Account): ConnectStatus {
  return {
    connected: true, stripe_account_id: acct.id, details_submitted: !!acct.details_submitted,
    charges_enabled: !!acct.charges_enabled, payouts_enabled: !!acct.payouts_enabled,
    currently_due: acct.requirements?.currently_due ?? [], disabled_reason: acct.requirements?.disabled_reason ?? null,
    livemode: !!acct.livemode,
  };
}

/** Load the org's mirror row (same livemode as the current key). */
export async function connectedAccountRow(admin: SupabaseClient, accountId: string) {
  const { data } = await admin
    .from("stripe_connected_accounts").select("*")
    .eq("account_id", accountId).eq("livemode", isConnectLivemode()).maybeSingle();
  return data as { stripe_account_id: string; charges_enabled: boolean } | null;
}

/** Fetch the account from Stripe and mirror it. Returns EMPTY_STATUS when the org has no account. */
export async function syncConnectedAccount(admin: SupabaseClient, accountId: string): Promise<ConnectStatus> {
  const row = await connectedAccountRow(admin, accountId);
  if (!row) return EMPTY_STATUS;
  const acct = await stripeConnect.accounts.retrieve(row.stripe_account_id);
  const status = statusFromAccount(acct);
  await admin.from("stripe_connected_accounts").update({
    details_submitted: status.details_submitted, charges_enabled: status.charges_enabled,
    payouts_enabled: status.payouts_enabled, requirements_currently_due: status.currently_due,
    disabled_reason: status.disabled_reason, updated_at: new Date().toISOString(),
  }).eq("stripe_account_id", row.stripe_account_id);
  return status;
}
```

- [ ] **Step 2: `api/connect/onboard/route.ts`**
```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { stripeConnect, isConnectLivemode, isConnectConfigured, webBaseUrl } from "@/lib/stripe-connect";
import { connectedAccountRow, statusFromAccount } from "@/lib/tickets/connect-status";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST: signed { action: "connect_onboard", payload: { account_id } } → { url, status }
// Creates the org's connected account on first call (full dashboard, Stripe collects fees, losses and
// requirements — the shape from the assessment §8.0), then mints a single-use hosted-onboarding link.
export async function POST(request: NextRequest) {
  if (!isConnectConfigured()) return jsonFail(503, "NOT_CONFIGURED", "Stripe Connect ist nicht konfiguriert.");
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["connect_onboard"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  if (!UUID_RE.test(accountId)) return jsonFail(400, "BAD_REQUEST", "account_id fehlt");

  const admin = createAdminClient();
  if (!canManage(await roleInAccount(admin, accountId, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins der Organisation.");

  const { data: org } = await admin.from("accounts").select("id, name, contact_email, slug, sub_type").eq("id", accountId).maybeSingle();
  if (!org) return jsonFail(404, "NOT_FOUND", "Organisation nicht gefunden");

  let stripeAccountId = (await connectedAccountRow(admin, accountId))?.stripe_account_id ?? null;
  if (!stripeAccountId) {
    const acct = await stripeConnect.accounts.create({
      country: "DE",
      email: org.contact_email ?? undefined,
      business_type: org.sub_type === "verein" ? "non_profit" : undefined,
      controller: {
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        stripe_dashboard: { type: "full" },
        requirement_collection: "stripe",
      },
      capabilities: { card_payments: { requested: true } },
      business_profile: {
        name: org.name,
        url: org.slug ? `${webBaseUrl()}/org/${org.slug}` : undefined,
        product_description: "Eintrittskarten und Gebühren für Veranstaltungen in Röbel/Müritz",
      },
      metadata: { roebel_account_id: accountId },
    });
    stripeAccountId = acct.id;
    const { error } = await admin.from("stripe_connected_accounts").insert({
      account_id: accountId, stripe_account_id: acct.id, livemode: isConnectLivemode(),
      dashboard_type: "full", created_by_wallet: v.wallet, ...statusFromAccount(acct),
      requirements_currently_due: acct.requirements?.currently_due ?? [],
    });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
  }

  const returnTo = encodeURIComponent("roebel://org/payments");
  const link = await stripeConnect.accountLinks.create({
    account: stripeAccountId,
    type: "account_onboarding",
    collection_options: { fields: "eventually_due" },
    return_url: `${webBaseUrl()}/connect/return?return_to=${returnTo}`,
    refresh_url: `${webBaseUrl()}/connect/return?refresh=true&return_to=${returnTo}`,
  });
  return jsonOk({ url: link.url, stripe_account_id: stripeAccountId });
}
```
Note: the insert spreads `statusFromAccount(acct)` for the boolean columns; `connected`, `stripe_account_id`, `currently_due`, `livemode` keys that do not exist as columns must be removed before insert — write the insert object explicitly with the six columns instead of spreading if PostgREST rejects unknown keys (it does: use explicit fields `details_submitted`, `charges_enabled`, `payouts_enabled`, `disabled_reason`).

- [ ] **Step 3: `api/connect/status/route.ts`**
```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount } from "@/lib/tickets/authz";
import { syncConnectedAccount } from "@/lib/tickets/connect-status";
import { isConnectConfigured } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

// POST: signed { action: "connect_status", payload: { account_id } } → ConnectStatus (any org member may read).
export async function POST(request: NextRequest) {
  if (!isConnectConfigured()) return jsonFail(503, "NOT_CONFIGURED", "Stripe Connect ist nicht konfiguriert.");
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["connect_status"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  const admin = createAdminClient();
  if (!(await roleInAccount(admin, accountId, v.wallet))) return jsonFail(403, "FORBIDDEN", "Kein Mitglied dieser Organisation.");
  try {
    return jsonOk(await syncConnectedAccount(admin, accountId));
  } catch (err) {
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe nicht erreichbar");
  }
}
```

- [ ] **Step 4: `app/connect/return/page.tsx`** — same shape as `apps/web/src/app/roebel-card/success/page.tsx`, reusing its redirect component:
```tsx
import { SuccessRedirect } from "@/app/roebel-card/success/success-redirect";

const FALLBACK = "roebel://org/payments";
const ALLOW = /^(roebel:\/\/|https:\/\/(www\.)?roebel\.app\/)/;

export default async function ConnectReturnPage({ searchParams }: { searchParams: Promise<{ return_to?: string; refresh?: string }> }) {
  const { return_to, refresh } = await searchParams;
  const returnTo = return_to && ALLOW.test(return_to) ? return_to : FALLBACK;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-2">{refresh === "true" ? "Link abgelaufen" : "Fast geschafft"}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {refresh === "true" ? "Bitte starte die Einrichtung in der App erneut." : "Du wirst zur Röbel App zurückgeleitet. Den Status siehst du unter „Zahlungen“."}
        </p>
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
```
Check `success-redirect.tsx` exports `SuccessRedirect` with a `returnTo` prop before using it; if its prop name differs, match it.

- [ ] **Step 5: Type-check only these files**: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "api/connect|connect/return|connect-status"` → no output.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/app/api/connect apps/web/src/lib/tickets/connect-status.ts apps/web/src/app/connect/return/page.tsx
git commit -m "feat(web): Stripe Connect onboarding + status routes for org accounts"
git push
```

---

### Task 5: Ticket types route

**Files:**
- Create: `apps/web/src/app/api/tickets/types/route.ts`

**Interfaces:**
- Consumes: Task 3 verify/authz, Task 4 `connectedAccountRow`.
- Produces: POST signed `{ action: "ticket_types_upsert", payload: { event_id, types: TicketTypeInput[] } }` where `TicketTypeInput = { id?: string; name: string; description?: string | null; price_cents: number; capacity?: number | null; per_order_max?: number; sales_end?: string | null; sort_order?: number; is_active?: boolean }` → `{ types: TicketTypeRow[] }` (all rows of the event, active and inactive). Expo reads active rows directly from Supabase (`ticket_types` select policy).

- [ ] **Step 1: Implement**
```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { connectedAccountRow } from "@/lib/tickets/connect-status";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TicketTypeInput = {
  id?: string; name: string; description?: string | null; price_cents: number; capacity?: number | null;
  per_order_max?: number; sales_end?: string | null; sort_order?: number; is_active?: boolean;
};

function clean(t: unknown, i: number): TicketTypeInput | string {
  const x = (t ?? {}) as Record<string, unknown>;
  const name = String(x.name ?? "").trim();
  if (name.length < 1 || name.length > 80) return `Name fehlt (Ticket ${i + 1})`;
  const price = Number(x.price_cents);
  if (!Number.isInteger(price) || price < 0 || price > 100000) return `Preis ungültig (${name})`;
  if (price > 0 && price < 50) return `Mindestpreis 0,50 € (${name})`;
  const capacity = x.capacity == null || x.capacity === "" ? null : Number(x.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return `Kontingent ungültig (${name})`;
  const perOrder = x.per_order_max == null ? 10 : Number(x.per_order_max);
  if (!Number.isInteger(perOrder) || perOrder < 1 || perOrder > 50) return `Max. pro Bestellung ungültig (${name})`;
  const id = typeof x.id === "string" && UUID_RE.test(x.id) ? x.id : undefined;
  const salesEnd = typeof x.sales_end === "string" && !Number.isNaN(Date.parse(x.sales_end)) ? x.sales_end : null;
  return {
    id, name, description: typeof x.description === "string" ? x.description.slice(0, 500) : null, price_cents: price,
    capacity, per_order_max: perOrder, sales_end: salesEnd, sort_order: Number.isInteger(x.sort_order) ? Number(x.sort_order) : i,
    is_active: x.is_active !== false,
  };
}

export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["ticket_types_upsert"] });
  if (!v.ok) return failResponse(v);
  const eventId = String(v.payload.event_id ?? "");
  if (!UUID_RE.test(eventId)) return jsonFail(400, "BAD_REQUEST", "event_id fehlt");
  const rawTypes = Array.isArray(v.payload.types) ? v.payload.types : null;
  if (!rawTypes || rawTypes.length > 20) return jsonFail(400, "BAD_REQUEST", "types fehlt oder zu lang");

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, account_id").eq("id", eventId).maybeSingle();
  if (!event?.account_id) return jsonFail(404, "NOT_FOUND", "Veranstaltung gehört keiner Organisation");
  if (!canManage(await roleInAccount(admin, event.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins.");

  const types: TicketTypeInput[] = [];
  for (let i = 0; i < rawTypes.length; i++) {
    const c = clean(rawTypes[i], i);
    if (typeof c === "string") return jsonFail(400, "VALIDATION", c);
    types.push(c);
  }
  if (types.some((t) => t.price_cents > 0)) {
    const row = await connectedAccountRow(admin, event.account_id);
    if (!row?.charges_enabled) return jsonFail(409, "CONNECT_REQUIRED", "Bezahlte Tickets brauchen ein aktives Stripe-Konto (Zahlungen einrichten).");
  }

  for (const t of types) {
    const values = { event_id: eventId, account_id: event.account_id, name: t.name, description: t.description, price_cents: t.price_cents,
      capacity: t.capacity, per_order_max: t.per_order_max, sales_end: t.sales_end, sort_order: t.sort_order, is_active: t.is_active, updated_at: new Date().toISOString() };
    const q = t.id
      ? admin.from("ticket_types").update(values).eq("id", t.id).eq("event_id", eventId)
      : admin.from("ticket_types").insert(values);
    const { error } = await q;
    if (error) return jsonFail(500, "DB_ERROR", error.message);
  }
  const { data: all } = await admin.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order");
  return jsonOk({ types: all ?? [] });
}
```
Price changes on a type with existing paid orders are allowed (orders store their own amount). Deleting is `is_active: false`.

- [ ] **Step 2: Type-check** the file as in Task 4, then commit:
```bash
git add apps/web/src/app/api/tickets/types/route.ts
git commit -m "feat(web): ticket types upsert route (org owners/admins, paid types need Connect)"
git push
```

---

### Task 6: Checkout route and the ticket return page

**Files:**
- Create: `apps/web/src/lib/tickets/settle.ts`
- Create: `apps/web/src/app/api/tickets/checkout/route.ts`
- Create: `apps/web/src/app/tickets/return/page.tsx`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `settleOrder(admin, orderId, opts: { paymentIntentId?: string | null; sessionId?: string | null }): Promise<{ issued: number }>` (idempotent: only orders in `pending` get paid + tickets; already-paid returns `{ issued: 0 }`); POST signed `{ action: "checkout", payload: { ticket_type_id, quantity, buyer_email? } }` → `{ order_id, status: "pending" | "paid", url: string | null, expires_at: string | null, amount_cents, fee_cents }`.

- [ ] **Step 1: `settle.ts`**
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTicketCode } from "./codes";

/** Flip a pending order to paid and mint its tickets exactly once. Free orders are already paid when created. */
export async function settleOrder(
  admin: SupabaseClient, orderId: string, opts: { paymentIntentId?: string | null; sessionId?: string | null },
): Promise<{ issued: number }> {
  const { data: order } = await admin.from("ticket_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { issued: 0 };
  if (order.status !== "pending" && !(order.rail === "free" && order.status === "paid")) return { issued: 0 };

  const { count } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", orderId);
  if ((count ?? 0) > 0) return { issued: 0 };

  if (order.status === "pending") {
    const { data: updated } = await admin.from("ticket_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: opts.paymentIntentId ?? order.stripe_payment_intent_id,
        stripe_checkout_session_id: opts.sessionId ?? order.stripe_checkout_session_id })
      .eq("id", orderId).eq("status", "pending").select("id");
    if (!updated || updated.length === 0) return { issued: 0 };
  }

  const rows = Array.from({ length: order.quantity }, () => ({
    order_id: orderId, event_id: order.event_id, ticket_type_id: order.ticket_type_id,
    code: generateTicketCode(), holder_wallet: order.buyer_wallet, status: "issued",
  }));
  const { error } = await admin.from("tickets").insert(rows);
  if (error) throw new Error(`tickets insert failed: ${error.message}`);
  await notifyBuyer(order.buyer_wallet, order.event_id, order.quantity);
  return { issued: rows.length };
}

async function notifyBuyer(wallet: string, eventId: string, quantity: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        type: "ticket_issued", walletAddresses: [wallet],
        title: quantity === 1 ? "Dein Ticket ist da" : `Deine ${quantity} Tickets sind da`,
        body: "Tippe, um deine Tickets in der Röbel App zu öffnen.",
        data: { type: "ticket", eventId },
      }),
    });
  } catch (err) {
    console.error("[tickets] push failed (non-fatal)", err);
  }
}
```

- [ ] **Step 2: `api/tickets/checkout/route.ts`**
```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { stripeConnect, isConnectLivemode, platformFeeCents, webBaseUrl } from "@/lib/stripe-connect";
import { connectedAccountRow } from "@/lib/tickets/connect-status";
import { settleOrder } from "@/lib/tickets/settle";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOLD_MINUTES = 35;

const RESERVE_ERRORS: Record<string, [number, string]> = {
  sold_out: [409, "Leider ausverkauft."],
  not_on_sale: [409, "Dieses Ticket ist gerade nicht im Verkauf."],
  per_order_max: [400, "So viele Tickets sind pro Bestellung nicht möglich."],
  too_many_pending: [429, "Du hast bereits offene Bestellungen für dieses Ticket. Bitte schließe sie zuerst ab."],
  event_not_bookable: [409, "Diese Veranstaltung ist nicht buchbar."],
};

export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["checkout"] });
  if (!v.ok) return failResponse(v);
  const ticketTypeId = String(v.payload.ticket_type_id ?? "");
  const quantity = Number(v.payload.quantity ?? 1);
  const email = typeof v.payload.buyer_email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.payload.buyer_email) ? v.payload.buyer_email : null;
  if (!UUID_RE.test(ticketTypeId) || !Number.isInteger(quantity) || quantity < 1) return jsonFail(400, "BAD_REQUEST", "ticket_type_id oder quantity fehlt");

  const admin = createAdminClient();
  const { data: order, error } = await admin.rpc("reserve_tickets", {
    p_ticket_type_id: ticketTypeId, p_quantity: quantity, p_buyer_wallet: v.wallet, p_hold_minutes: HOLD_MINUTES,
  });
  if (error || !order) {
    const key = Object.keys(RESERVE_ERRORS).find((k) => (error?.message ?? "").includes(k));
    if (key) return jsonFail(RESERVE_ERRORS[key][0], key.toUpperCase(), RESERVE_ERRORS[key][1]);
    return jsonFail(500, "DB_ERROR", error?.message ?? "Reservierung fehlgeschlagen");
  }
  if (email) await admin.from("ticket_orders").update({ buyer_email: email }).eq("id", order.id);

  if (order.rail === "free") {
    await settleOrder(admin, order.id, {});
    return jsonOk({ order_id: order.id, status: "paid", url: null, expires_at: null, amount_cents: 0, fee_cents: 0 });
  }

  const connected = await connectedAccountRow(admin, order.account_id);
  if (!connected?.charges_enabled) {
    await admin.from("ticket_orders").update({ status: "cancelled" }).eq("id", order.id);
    return jsonFail(409, "CONNECT_REQUIRED", "Der Veranstalter kann noch keine Zahlungen annehmen.");
  }
  const [{ data: tt }, { data: ev }] = await Promise.all([
    admin.from("ticket_types").select("name").eq("id", ticketTypeId).maybeSingle(),
    admin.from("events").select("title").eq("id", order.event_id).maybeSingle(),
  ]);
  const feeCents = platformFeeCents(order.amount_cents);
  const returnTo = encodeURIComponent(`roebel://tickets/${order.id}`);
  try {
    const session = await stripeConnect.checkout.sessions.create(
      {
        mode: "payment", locale: "de", submit_type: "book",
        line_items: [{ quantity: order.quantity, price_data: { currency: order.currency, unit_amount: Math.round(order.amount_cents / order.quantity),
          product_data: { name: `${tt?.name ?? "Ticket"} – ${ev?.title ?? "Veranstaltung"}` } } }],
        ...(feeCents > 0 ? { payment_intent_data: { application_fee_amount: feeCents } } : {}),
        expires_at: Math.floor(new Date(order.expires_at).getTime() / 1000),
        client_reference_id: order.id,
        customer_email: email ?? undefined,
        metadata: { kind: "event_ticket", order_id: order.id, event_id: order.event_id },
        success_url: `${webBaseUrl()}/tickets/return?order_id=${order.id}&return_to=${returnTo}`,
        cancel_url: `${webBaseUrl()}/tickets/return?cancelled=true&order_id=${order.id}&return_to=${returnTo}`,
      },
      { stripeAccount: connected.stripe_account_id },
    );
    await admin.from("ticket_orders").update({
      stripe_checkout_session_id: session.id, stripe_account_id: connected.stripe_account_id,
      application_fee_cents: feeCents, livemode: isConnectLivemode(),
    }).eq("id", order.id);
    return jsonOk({ order_id: order.id, status: "pending", url: session.url, expires_at: order.expires_at, amount_cents: order.amount_cents, fee_cents: feeCents });
  } catch (err) {
    await admin.from("ticket_orders").update({ status: "cancelled" }).eq("id", order.id);
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe-Fehler");
  }
}
```
Stripe requires `expires_at` ≥ 30 min after creation; the 35-minute hold satisfies it.

- [ ] **Step 3: `app/tickets/return/page.tsx`** — copy of the connect return page with fallback `roebel://tickets`, title "Vielen Dank!" / "Zahlung abgebrochen" (when `cancelled=true`), body "Deine Tickets erscheinen gleich in der App." / "Es wurde nichts abgebucht.".

- [ ] **Step 4: Type-check** (`grep -E "tickets/checkout|tickets/settle|tickets/return"` on the tsc output → nothing), commit:
```bash
git add apps/web/src/lib/tickets/settle.ts apps/web/src/app/api/tickets/checkout/route.ts apps/web/src/app/tickets/return/page.tsx
git commit -m "feat(web): ticket checkout as direct charge on the org's Stripe account with platform fee"
git push
```

---

### Task 7: Connect webhook

**Files:**
- Create: `apps/web/src/app/api/webhooks/stripe-connect/route.ts`

**Interfaces:**
- Consumes: `settleOrder` (Task 6), `syncConnectedAccount` (Task 4), `stripeConnect`.
- Env: `STRIPE_CONNECT_WEBHOOK_SECRET`.

- [ ] **Step 1: Implement**
```ts
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeConnect } from "@/lib/stripe-connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleOrder } from "@/lib/tickets/settle";
import { syncConnectedAccount } from "@/lib/tickets/connect-status";

export const dynamic = "force-dynamic";

// Connect webhook ("events on connected accounts"). Idempotent via stripe_events(id).
// 400 = bad signature (Stripe must not retry), 500 = our failure (Stripe retries).
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "not_configured" }, { status: signature ? 500 : 400 });

  let event: Stripe.Event;
  try {
    event = stripeConnect.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    return NextResponse.json({ error: "invalid_signature", details: err instanceof Error ? err.message : "" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: dupErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type, account: event.account ?? null, livemode: event.livemode });
  if (dupErr) return NextResponse.json({ received: true, duplicate: true }); // 23505 or any prior insert → already handled

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.kind === "event_ticket" && s.metadata.order_id && s.payment_status === "paid") {
          await settleOrder(admin, s.metadata.order_id, { paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null, sessionId: s.id });
        }
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.kind === "event_ticket" && s.metadata.order_id) {
          await admin.from("ticket_orders").update({ status: event.type === "checkout.session.expired" ? "expired" : "cancelled" })
            .eq("id", s.metadata.order_id).eq("status", "pending");
        }
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        if (pi && c.refunded) {
          const { data: order } = await admin.from("ticket_orders").select("id").eq("stripe_payment_intent_id", pi).maybeSingle();
          if (order) {
            await admin.from("ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", order.id);
            await admin.from("tickets").update({ status: "refunded" }).eq("order_id", order.id).in("status", ["issued", "checked_in"]);
          }
        }
        break;
      }
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        const { data: row } = await admin.from("stripe_connected_accounts").select("account_id").eq("stripe_account_id", acct.id).maybeSingle();
        if (row) await syncConnectedAccount(admin, row.account_id);
        break;
      }
      default:
        break;
    }
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("stripe_events").update({ error: message }).eq("id", event.id);
    await admin.from("stripe_events").delete().eq("id", event.id); // let Stripe retry
    return NextResponse.json({ error: "processing_failed", details: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ has_secret: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET });
}
```

- [ ] **Step 2: Type-check + commit**
```bash
git add apps/web/src/app/api/webhooks/stripe-connect/route.ts
git commit -m "feat(web): Stripe Connect webhook — settle orders, mint tickets, refunds, account status"
git push
```

---

### Task 8: Order status, my tickets, check-in, refund routes

**Files:**
- Create: `apps/web/src/app/api/tickets/order/route.ts`
- Create: `apps/web/src/app/api/tickets/mine/route.ts`
- Create: `apps/web/src/app/api/tickets/checkin/route.ts`
- Create: `apps/web/src/app/api/tickets/refund/route.ts`
- Create: `apps/web/src/lib/tickets/views.ts`

**Interfaces:**
- Produces (Expo consumes exactly these shapes):
  - `TicketView = { id: string; code: string; qr: string; status: "issued"|"checked_in"|"refunded"|"void"; checked_in_at: string | null; ticket_type_name: string }`
  - `OrderView = { id: string; status: "pending"|"paid"|"expired"|"cancelled"|"refunded"; quantity: number; amount_cents: number; currency: string; rail: string; expires_at: string | null; created_at: string; event: { id: string; title: string; date: string | null; time: string | null; location: string | null; image_url: string | null }; ticket_type_name: string; tickets: TicketView[] }`
  - `order_status` payload `{ order_id }` → `OrderView` (buyer only); `tickets_list` payload `{}` → `{ orders: OrderView[] }` (newest first, max 50); `checkin` payload `{ payload }` → `{ result: "ok"|"already_checked_in"|"invalid"|"refunded"|"wrong_event"; ticket?: TicketView; event_title?: string; checked_in_count?: number; issued_count?: number }`; `refund_order` payload `{ order_id }` → `{ refunded: true }`.

- [ ] **Step 1: `views.ts`** builds `OrderView`s from rows:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ticketQrPayload } from "./codes";

export type TicketView = { id: string; code: string; qr: string; status: string; checked_in_at: string | null; ticket_type_name: string };
export type OrderView = {
  id: string; status: string; quantity: number; amount_cents: number; currency: string; rail: string; expires_at: string | null; created_at: string;
  event: { id: string; title: string; date: string | null; time: string | null; location: string | null; image_url: string | null };
  ticket_type_name: string; tickets: TicketView[];
};

export async function orderViews(admin: SupabaseClient, filter: { buyerWallet?: string; orderId?: string }): Promise<OrderView[]> {
  let q = admin.from("ticket_orders")
    .select("id, status, quantity, amount_cents, currency, rail, expires_at, created_at, event_id, ticket_type_id, buyer_wallet")
    .order("created_at", { ascending: false }).limit(50);
  if (filter.orderId) q = q.eq("id", filter.orderId);
  if (filter.buyerWallet) q = q.eq("buyer_wallet", filter.buyerWallet.toLowerCase());
  const { data: orders } = await q;
  if (!orders || orders.length === 0) return [];
  const eventIds = [...new Set(orders.map((o) => o.event_id))];
  const typeIds = [...new Set(orders.map((o) => o.ticket_type_id))];
  const [{ data: events }, { data: types }, { data: tickets }] = await Promise.all([
    admin.from("events").select("id, title, date, time, location, image_url").in("id", eventIds),
    admin.from("ticket_types").select("id, name").in("id", typeIds),
    admin.from("tickets").select("id, order_id, code, status, checked_in_at, ticket_type_id").in("order_id", orders.map((o) => o.id)).order("created_at"),
  ]);
  const evById = new Map((events ?? []).map((e) => [e.id, e]));
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name as string]));
  return orders.map((o) => {
    const e = evById.get(o.event_id);
    return {
      id: o.id, status: o.status, quantity: o.quantity, amount_cents: o.amount_cents, currency: o.currency, rail: o.rail,
      expires_at: o.expires_at, created_at: o.created_at,
      event: { id: o.event_id, title: e?.title ?? "Veranstaltung", date: e?.date ?? null, time: e?.time ?? null, location: e?.location ?? null, image_url: e?.image_url ?? null },
      ticket_type_name: typeName.get(o.ticket_type_id) ?? "Ticket",
      tickets: (tickets ?? []).filter((t) => t.order_id === o.id).map((t) => ({
        id: t.id, code: t.code, qr: ticketQrPayload(t.code), status: t.status, checked_in_at: t.checked_in_at, ticket_type_name: typeName.get(t.ticket_type_id) ?? "Ticket",
      })),
    };
  });
}
```

- [ ] **Step 2: `api/tickets/order/route.ts`** (buyer polls this after Checkout):
```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { orderViews } from "@/lib/tickets/views";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["order_status"] });
  if (!v.ok) return failResponse(v);
  const orderId = String(v.payload.order_id ?? "");
  const [view] = await orderViews(createAdminClient(), { orderId, buyerWallet: v.wallet });
  if (!view) return jsonFail(404, "NOT_FOUND", "Bestellung nicht gefunden");
  return jsonOk(view);
}
```

- [ ] **Step 3: `api/tickets/mine/route.ts`**: identical shape, action `tickets_list`, returns `jsonOk({ orders: await orderViews(admin, { buyerWallet: v.wallet }) })`.

- [ ] **Step 4: `api/tickets/checkin/route.ts`**
```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount } from "@/lib/tickets/authz";
import { parseTicketQrPayload, ticketQrPayload } from "@/lib/tickets/codes";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["checkin"] });
  if (!v.ok) return failResponse(v);
  const parsed = parseTicketQrPayload(String(v.payload.payload ?? ""));
  if (!parsed) return jsonOk({ result: "invalid" });
  const admin = createAdminClient();
  const { data: t } = await admin.from("tickets").select("id, code, status, checked_in_at, event_id, ticket_type_id").eq("code", parsed.code).maybeSingle();
  if (!t) return jsonOk({ result: "invalid" });
  const { data: ev } = await admin.from("events").select("id, title, account_id").eq("id", t.event_id).maybeSingle();
  if (!ev?.account_id || !(await roleInAccount(admin, ev.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Du gehörst nicht zum Veranstalter dieses Tickets.");
  const { data: tt } = await admin.from("ticket_types").select("name").eq("id", t.ticket_type_id).maybeSingle();
  const view = (row: typeof t) => ({ id: row.id, code: row.code, qr: ticketQrPayload(row.code), status: row.status, checked_in_at: row.checked_in_at, ticket_type_name: tt?.name ?? "Ticket" });
  const counts = async () => {
    const [{ count: issued }, { count: checked }] = await Promise.all([
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", t.event_id).in("status", ["issued", "checked_in"]),
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", t.event_id).eq("status", "checked_in"),
    ]);
    return { issued_count: issued ?? 0, checked_in_count: checked ?? 0 };
  };
  if (t.status === "refunded" || t.status === "void") return jsonOk({ result: "refunded", ticket: view(t), event_title: ev.title, ...(await counts()) });
  if (t.status === "checked_in") return jsonOk({ result: "already_checked_in", ticket: view(t), event_title: ev.title, ...(await counts()) });
  const { data: updated } = await admin.from("tickets")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by_wallet: v.wallet })
    .eq("id", t.id).eq("status", "issued").select("id, code, status, checked_in_at, event_id, ticket_type_id").maybeSingle();
  if (!updated) return jsonOk({ result: "already_checked_in", ticket: view(t), event_title: ev.title, ...(await counts()) });
  return jsonOk({ result: "ok", ticket: view(updated), event_title: ev.title, ...(await counts()) });
}
```

- [ ] **Step 5: `api/tickets/refund/route.ts`** (org owner/admin refunds a paid order; the webhook marks the rows):
```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { stripeConnect } from "@/lib/stripe-connect";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["refund_order"] });
  if (!v.ok) return failResponse(v);
  const admin = createAdminClient();
  const { data: order } = await admin.from("ticket_orders").select("id, status, rail, account_id, stripe_account_id, stripe_payment_intent_id").eq("id", String(v.payload.order_id ?? "")).maybeSingle();
  if (!order) return jsonFail(404, "NOT_FOUND", "Bestellung nicht gefunden");
  if (!canManage(await roleInAccount(admin, order.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins.");
  if (order.status !== "paid") return jsonFail(409, "NOT_REFUNDABLE", "Nur bezahlte Bestellungen können erstattet werden.");
  if (order.rail === "free") {
    await admin.from("ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", order.id);
    await admin.from("tickets").update({ status: "void" }).eq("order_id", order.id);
    return jsonOk({ refunded: true });
  }
  if (!order.stripe_payment_intent_id || !order.stripe_account_id) return jsonFail(409, "NOT_REFUNDABLE", "Keine Zahlung hinterlegt.");
  try {
    // refund_application_fee: the platform fee goes back too, so the org is never short after a refund.
    await stripeConnect.refunds.create({ payment_intent: order.stripe_payment_intent_id, refund_application_fee: true }, { stripeAccount: order.stripe_account_id });
    return jsonOk({ refunded: true });
  } catch (err) {
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe-Fehler");
  }
}
```

- [ ] **Step 6: Type-check the four routes + views**, commit:
```bash
git add apps/web/src/app/api/tickets/order apps/web/src/app/api/tickets/mine apps/web/src/app/api/tickets/checkin apps/web/src/app/api/tickets/refund apps/web/src/lib/tickets/views.ts
git commit -m "feat(web): ticket order status, my tickets, door check-in, org refunds"
git push
```

---

### Task 9: Expo libraries — signed requests, Connect client, tickets client, flags

**Files:**
- Create: `apps/expo/lib/signed-request.ts`
- Create: `apps/expo/lib/stripe-connect.ts`
- Create: `apps/expo/lib/tickets.ts`
- Modify: `apps/expo/lib/supabase-app-settings.ts` (append two functions)
- Test: `apps/expo/lib/__tests__/signed-request.test.ts`, `apps/expo/lib/__tests__/tickets-helpers.test.ts`, `apps/expo/lib/__tests__/stripe-connect-gate.test.ts`

**Interfaces:**
- Consumes: web routes from Tasks 4–8 (bodies `{ scope, action, wallet, timestampSec, payload, signature }`, envelope `{ ok, data } | { ok, code, message }`).
- Produces:
  - `signed-request.ts`: `SigningAccount` (same shape as in `lib/org-membership.ts`), `postSigned<T>(path: string, account: SigningAccount, action: TicketAction, payload: Record<string, unknown>): Promise<ApiResult<T>>` with `ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }`, `buildSignedMessage(...)` (exported for the test), `getApiBaseUrl()`.
  - `stripe-connect.ts`: `ConnectStatus` (same fields as web), `connectOnboard(account, accountId): Promise<ApiResult<{ url: string }>>`, `connectStatus(account, accountId): Promise<ApiResult<ConnectStatus>>`, `openConnectOnboarding(url): Promise<void>` (uses `WebBrowser.openAuthSessionAsync(url, 'roebel://org/payments')`).
  - `tickets.ts`: types `TicketTypeRow`, `TicketView`, `OrderView` (mirroring web), `fetchTicketTypes(eventId): Promise<TicketTypeRow[]>` (Supabase anon, active only, ordered by sort_order), `upsertTicketTypes(account, eventId, types): Promise<ApiResult<{ types: TicketTypeRow[] }>>`, `startCheckout(account, input: { ticketTypeId: string; quantity: number; email?: string | null }): Promise<ApiResult<CheckoutResult>>` with `CheckoutResult = { order_id: string; status: 'pending' | 'paid'; url: string | null; expires_at: string | null; amount_cents: number; fee_cents: number }`, `openCheckout(url: string, orderId: string): Promise<void>`, `fetchOrder(account, orderId): Promise<ApiResult<OrderView>>`, `fetchMyTickets(account): Promise<ApiResult<{ orders: OrderView[] }>>`, `checkInTicket(account, payload: string): Promise<ApiResult<CheckinResult>>`, `refundOrder(account, orderId): Promise<ApiResult<{ refunded: true }>>`, pure helpers `formatCents(cents: number): string` ("12,50 €", "Kostenlos" for 0), `parseTicketPayload(data: string): { code: string } | null` (format check only, no HMAC), `orderStatusLabel(status: string): string`, `isTicketPayload(data: string): boolean`.
  - flags: `isStripeConnectEnabled(opts?: { walletAddress?: string | null }): Promise<boolean>` (allowlist pattern), `isTicketSalesEnabled(): Promise<boolean>` (`'true'` only, `__DEV__` on).

- [ ] **Step 1: Write the failing tests**

`apps/expo/lib/__tests__/signed-request.test.ts`:
```ts
import { buildSignedMessage, postSigned } from '../signed-request';

describe('signed-request', () => {
  it('builds the roebel-tickets-v1 message with sorted payload hash', async () => {
    const msg = await buildSignedMessage('checkout', '0xABC', 1700000000, { b: 2, a: 'x' });
    expect(msg).toMatch(/^roebel-tickets-v1:checkout:0xabc:1700000000:[0-9a-f]{64}$/);
    expect(msg).toBe(await buildSignedMessage('checkout', '0xabc', 1700000000, { a: 'x', b: 2 }));
  });

  it('posts the signed body and unwraps the envelope', async () => {
    const account = { address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) };
    const fetchMock = jest.fn(async () => ({ json: async () => ({ ok: true, data: { hello: 1 } }) }));
    (global as any).fetch = fetchMock;
    const res = await postSigned<{ hello: number }>('/api/tickets/order', account, 'order_status', { order_id: 'o1' });
    expect(res).toEqual({ ok: true, data: { hello: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toMatch(/\/api\/tickets\/order$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ scope: 'roebel-tickets-v1', action: 'order_status', wallet: '0xabc', payload: { order_id: 'o1' } });
    expect(body.signature).toMatch(/^0x/);
  });
});
```

`apps/expo/lib/__tests__/tickets-helpers.test.ts`:
```ts
import { formatCents, parseTicketPayload, orderStatusLabel, isTicketPayload } from '../tickets';

describe('tickets helpers', () => {
  it('formats cents in German', () => {
    expect(formatCents(0)).toBe('Kostenlos');
    expect(formatCents(1250)).toBe('12,50 €');
    expect(formatCents(500)).toBe('5 €');
  });
  it('recognises ticket payloads by shape only', () => {
    expect(parseTicketPayload('roebel-ticket:v1:ABCDEFGHJK:0123456789abcdef')).toEqual({ code: 'ABCDEFGHJK' });
    expect(parseTicketPayload('roebel-card:v2:x')).toBeNull();
    expect(isTicketPayload('roebel-ticket:v1:ABCDEFGHJK:0123456789abcdef')).toBe(true);
  });
  it('labels order states', () => {
    expect(orderStatusLabel('pending')).toBe('Zahlung offen');
    expect(orderStatusLabel('paid')).toBe('Bezahlt');
    expect(orderStatusLabel('refunded')).toBe('Erstattet');
  });
});
```

`apps/expo/lib/__tests__/stripe-connect-gate.test.ts` — copy `stablecoin-gate.test.ts` verbatim, replacing `isStablecoinPaymentsEnabled` with `isStripeConnectEnabled` and adding one case for `isTicketSalesEnabled` (`'true'` → true, `'0xabc'` → false, null → false).

- [ ] **Step 2: Run** `cd apps/expo && npx jest --watchAll=false lib/__tests__/signed-request.test.ts lib/__tests__/tickets-helpers.test.ts lib/__tests__/stripe-connect-gate.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement** `apps/expo/lib/signed-request.ts` (hashing exactly as `lib/org-membership.ts`, via `expo-crypto`):
```ts
// Wallet-signed requests to the web API (apps/web/src/lib/signed-request). Same grammar as the
// org-membership edge function, with its own scope so a ticket signature can never replay as an org action.
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';

export const SIGNED_SCOPE = 'roebel-tickets-v1';
export type TicketAction =
  | 'connect_onboard' | 'connect_status' | 'ticket_types_upsert' | 'checkout'
  | 'order_status' | 'tickets_list' | 'checkin' | 'refund_order';

export interface SigningAccount {
  address: string;
  signMessage: (args: { message: string }) => Promise<string>;
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const DEFAULT_API_BASE_URL = 'https://www.roebel.app';
export function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  return env && env.length > 0 ? env.replace(/\/$/, '') : DEFAULT_API_BASE_URL;
}

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(sorted));
}

export async function buildSignedMessage(action: TicketAction, wallet: string, timestampSec: number, payload: Record<string, unknown>): Promise<string> {
  return `${SIGNED_SCOPE}:${action}:${wallet.toLowerCase()}:${timestampSec}:${await hashPayload(payload)}`;
}

export async function postSigned<T>(path: string, account: SigningAccount, action: TicketAction, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  const wallet = account.address.toLowerCase();
  const timestampSec = Math.floor(Date.now() / 1000);
  let signature: string;
  try {
    signature = await account.signMessage({ message: await buildSignedMessage(action, wallet, timestampSec, payload) });
  } catch (err) {
    return { ok: false, code: 'SIGN_FAILED', message: err instanceof Error ? err.message : 'Signatur fehlgeschlagen' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ scope: SIGNED_SCOPE, action, wallet, timestampSec, payload, signature }),
    });
    const json = (await res.json()) as ApiResult<T>;
    if (json && typeof json === 'object' && 'ok' in json) return json;
    return { ok: false, code: 'BAD_RESPONSE', message: 'Unerwartete Antwort vom Server' };
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  } finally {
    clearTimeout(timer);
  }
}
```
Jest note: `expo-crypto` is mocked by jest-expo's preset; if `digestStringAsync` is undefined in the test, add `jest.mock('expo-crypto', ...)` in the test using `node:crypto` sha256 hex.

`apps/expo/lib/stripe-connect.ts`:
```ts
import * as WebBrowser from 'expo-web-browser';
import { postSigned, type ApiResult, type SigningAccount } from './signed-request';

export interface ConnectStatus {
  connected: boolean; stripe_account_id: string | null; details_submitted: boolean; charges_enabled: boolean;
  payouts_enabled: boolean; currently_due: string[]; disabled_reason: string | null; livemode: boolean;
}
export function connectOnboard(account: SigningAccount, accountId: string): Promise<ApiResult<{ url: string }>> {
  return postSigned('/api/connect/onboard', account, 'connect_onboard', { account_id: accountId });
}
export function connectStatus(account: SigningAccount, accountId: string): Promise<ApiResult<ConnectStatus>> {
  return postSigned('/api/connect/status', account, 'connect_status', { account_id: accountId });
}
/** Stripe forbids WebViews for hosted onboarding; the auth session opens the system browser sheet and returns on roebel://org/payments. */
export async function openConnectOnboarding(url: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, 'roebel://org/payments', { showInRecents: true });
}
```

`apps/expo/lib/tickets.ts`:
```ts
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { postSigned, type ApiResult, type SigningAccount } from './signed-request';

export interface TicketTypeRow {
  id: string; event_id: string; account_id: string; name: string; description: string | null; price_cents: number; currency: string;
  capacity: number | null; per_order_max: number; sales_start: string | null; sales_end: string | null; sort_order: number; is_active: boolean;
}
export interface TicketTypeInput {
  id?: string; name: string; description?: string | null; price_cents: number; capacity?: number | null; per_order_max?: number; sales_end?: string | null; sort_order?: number; is_active?: boolean;
}
export interface TicketView { id: string; code: string; qr: string; status: 'issued' | 'checked_in' | 'refunded' | 'void'; checked_in_at: string | null; ticket_type_name: string }
export interface OrderView {
  id: string; status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded'; quantity: number; amount_cents: number; currency: string; rail: string;
  expires_at: string | null; created_at: string;
  event: { id: string; title: string; date: string | null; time: string | null; location: string | null; image_url: string | null };
  ticket_type_name: string; tickets: TicketView[];
}
export interface CheckoutResult { order_id: string; status: 'pending' | 'paid'; url: string | null; expires_at: string | null; amount_cents: number; fee_cents: number }
export interface CheckinResult { result: 'ok' | 'already_checked_in' | 'invalid' | 'refunded' | 'wrong_event'; ticket?: TicketView; event_title?: string; checked_in_count?: number; issued_count?: number }

export async function fetchTicketTypes(eventId: string): Promise<TicketTypeRow[]> {
  const { data, error } = await supabase.from('ticket_types').select('*').eq('event_id', eventId).eq('is_active', true).order('sort_order');
  if (error) { console.error('fetchTicketTypes', error); return []; }
  return (data ?? []) as TicketTypeRow[];
}
export function upsertTicketTypes(account: SigningAccount, eventId: string, types: TicketTypeInput[]) {
  return postSigned<{ types: TicketTypeRow[] }>('/api/tickets/types', account, 'ticket_types_upsert', { event_id: eventId, types });
}
export function startCheckout(account: SigningAccount, input: { ticketTypeId: string; quantity: number; email?: string | null }) {
  return postSigned<CheckoutResult>('/api/tickets/checkout', account, 'checkout', {
    ticket_type_id: input.ticketTypeId, quantity: input.quantity, ...(input.email ? { buyer_email: input.email } : {}),
  });
}
export async function openCheckout(url: string, orderId: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, `roebel://tickets/${orderId}`, { showInRecents: true });
}
export function fetchOrder(account: SigningAccount, orderId: string) {
  return postSigned<OrderView>('/api/tickets/order', account, 'order_status', { order_id: orderId });
}
export function fetchMyTickets(account: SigningAccount) {
  return postSigned<{ orders: OrderView[] }>('/api/tickets/mine', account, 'tickets_list', {});
}
export function checkInTicket(account: SigningAccount, payload: string) {
  return postSigned<CheckinResult>('/api/tickets/checkin', account, 'checkin', { payload });
}
export function refundOrder(account: SigningAccount, orderId: string) {
  return postSigned<{ refunded: true }>('/api/tickets/refund', account, 'refund_order', { order_id: orderId });
}

export function formatCents(cents: number): string {
  if (!cents) return 'Kostenlos';
  const s = (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${s} €`;
}
const PAYLOAD_RE = /^roebel-ticket:v1:([A-HJ-NP-Z2-9]{10}):([0-9a-f]{16})$/;
export function parseTicketPayload(data: string): { code: string } | null {
  const m = PAYLOAD_RE.exec(data.trim());
  return m ? { code: m[1] } : null;
}
export function isTicketPayload(data: string): boolean { return PAYLOAD_RE.test(data.trim()); }
export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Zahlung offen';
    case 'paid': return 'Bezahlt';
    case 'expired': return 'Abgelaufen';
    case 'cancelled': return 'Abgebrochen';
    case 'refunded': return 'Erstattet';
    default: return status;
  }
}
```
`toLocaleString('de-DE')` under jest may render "5" with a plain space; if the test fails on the thin space, format manually: `${Math.floor(cents/100)}${cents%100 ? ',' + String(cents%100).padStart(2,'0') : ''} €`.

Append to `apps/expo/lib/supabase-app-settings.ts`:
```ts
/** Org-side gate for Stripe Connect (Zahlungen einrichten). New surface: missing key = OFF; 'true' = all; else wallet allowlist. */
export async function isStripeConnectEnabled(opts?: { walletAddress?: string | null }): Promise<boolean> {
  if (__DEV__) return true;
  const value = await fetchAppSetting('stripe_connect_enabled');
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (!opts?.walletAddress) return false;
  return value.toLowerCase().split(',').map((e) => e.trim()).includes(opts.walletAddress.toLowerCase());
}
/** Citizen-side gate for buying tickets. Missing key = OFF. */
export async function isTicketSalesEnabled(): Promise<boolean> {
  if (__DEV__) return true;
  return (await fetchAppSetting('stripe_tickets_enabled')) === 'true';
}
```

- [ ] **Step 4: Run the three tests** → PASS. Then `git add apps/expo/lib/signed-request.ts apps/expo/lib/stripe-connect.ts apps/expo/lib/tickets.ts apps/expo/lib/supabase-app-settings.ts apps/expo/lib/__tests__/signed-request.test.ts apps/expo/lib/__tests__/tickets-helpers.test.ts apps/expo/lib/__tests__/stripe-connect-gate.test.ts && git commit -m "feat(expo): signed web-API requests, Stripe Connect + tickets clients, feature gates" && git push`.

---

### Task 10: Org "Zahlungen" screen + settings entry

**Files:**
- Create: `apps/expo/app/org/payments.tsx`
- Modify: `apps/expo/app/org/settings.tsx` (add a section above "Konto löschen")

**Interfaces:**
- Consumes: `useAccount()` (`activeAccount`, `roleInActiveAccount`), `useActiveAccount()` from `thirdweb/react` (gives `address` + `signMessage`), `connectOnboard`, `connectStatus`, `openConnectOnboarding`, `isStripeConnectEnabled`.
- Produces: route `/org/payments` (also the deep-link target `roebel://org/payments` after onboarding).

- [ ] **Step 1: Screen.** Structure (same header/section styles as `org/settings.tsx`):
  - Guard: org account only, else `router.replace('/profile')`.
  - On mount and on every focus (`useFocusEffect` from expo-router): `isStripeConnectEnabled({ walletAddress })` → if false render a card "Zahlungen sind für dieses Konto noch nicht freigeschaltet." and stop. Else call `connectStatus(account, activeAccount.id)`; keep `status` state.
  - Card "Stripe-Konto": one of three states:
    - not connected: body "Verkaufe Tickets für deine Veranstaltungen. Das Geld landet direkt auf dem Stripe-Konto deiner Organisation. Stripe prüft die Organisation (Vereinsregisterauszug, Vorstand mit Ausweis, IBAN auf den Verein)." Button "Mit Stripe einrichten" (owner/admin only) → `connectOnboard` → `openConnectOnboarding(url)` → after the sheet closes, re-run `connectStatus`.
    - connected but `!charges_enabled`: title "In Prüfung", list `currently_due` items as bullet lines (map known keys: `external_account` → "Bankkonto (IBAN)", `individual.verification.document` / `company.verification.document` → "Ausweis- oder Registerdokument", `tos_acceptance.date` → "Stripe-Nutzungsbedingungen", anything else → the raw key), button "Angaben vervollständigen" (same onboarding call; the link opens where Stripe left off).
    - `charges_enabled`: green pill "Aktiv", text "Zahlungen möglich. Auszahlungen: aktiv/ausstehend" from `payouts_enabled`, hint "Verwalten kannst du dein Konto unter dashboard.stripe.com" (plain text, no wallet, no ids).
  - Card "Gebühren": "Stripe berechnet 1,5 % + 0,25 € pro Kartenzahlung. Die Röbel App behält eine kleine Plattformgebühr (2 % + 0,10 €) pro Bestellung ein. Bei Erstattungen bekommt der Käufer den vollen Betrag zurück."
  - Card "Einlass": button "Tickets scannen" → `router.push('/org/scan-tickets' as any)`.
  - `refreshing` state with a small `ActivityIndicator`; errors via `Alert.alert('Fehler', message)`.

- [ ] **Step 2: Entry in `org/settings.tsx`.** Insert before the "Konto löschen" section:
```tsx
<View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Zahlungen</Text>
  <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>Stripe-Konto einrichten, Tickets verkaufen und am Einlass scannen.</Text>
  <Pressable onPress={() => router.push('/org/payments' as any)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
    <Text style={styles.primaryButtonText}>Zahlungen öffnen</Text>
  </Pressable>
</View>
```
with styles `primaryButton: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }`, `primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' }`. Show this section only when `isStripeConnectEnabled({ walletAddress: account?.address })` resolved true (state + effect in the settings screen).

- [ ] **Step 3: Verify** `cd apps/expo && npx tsc --noEmit 2>&1 | grep -E "org/payments|org/settings"` → nothing. Commit:
```bash
git add apps/expo/app/org/payments.tsx apps/expo/app/org/settings.tsx
git commit -m "feat(expo): org Zahlungen screen — Stripe Connect onboarding and status"
git push
```

---

### Task 11: Ticket types editor + entry from the event editor

**Files:**
- Create: `apps/expo/app/org/event-tickets/[id].tsx`
- Modify: `apps/expo/app/edit-event/[id].tsx` (button between "Änderungen speichern" and "Veranstaltung löschen", around line 404)

**Interfaces:**
- Consumes: `fetchTicketTypes` (note: returns only active rows; the editor also needs inactive ones → for the org editor, query Supabase directly with `.eq('event_id', id).order('sort_order')` and no `is_active` filter; RLS hides inactive rows from anon, so after a deactivation the row disappears from the list — acceptable for slice A), `upsertTicketTypes`, `connectStatus`, `formatCents`.

- [ ] **Step 1: Screen `org/event-tickets/[id].tsx`.** `id` = event id. Loads the event title (Supabase `events` select `title, account_id`), guards `activeAccount.id === event.account_id`, loads types, loads `connectStatus` once (to know `charges_enabled`).
  - List of editable rows (local state `TicketTypeInput[]`): name (TextInput), price in euros (TextInput, decimal, "0 = kostenlos"), capacity (TextInput numeric, empty = unbegrenzt), max per order (default 10), toggle "Aktiv".
  - "Ticketart hinzufügen" appends `{ name: '', price_cents: 0, capacity: null, per_order_max: 10, is_active: true }`.
  - If any row has price > 0 and `!charges_enabled`: inline warning "Für bezahlte Tickets muss zuerst das Stripe-Konto aktiv sein." with a button to `/org/payments`; the save button stays enabled for free types only.
  - "Speichern" → `upsertTicketTypes(account, id, rows)`; on `ok` replace local rows with `data.types`; on error `Alert.alert('Fehler', message)`.
  - Price parsing: `Math.round(parseFloat(text.replace(',', '.')) * 100)`; invalid → 0 with a red hint.
  - Footer note: "Käufer sehen: Preis inkl. MwSt., Veranstalter = deine Organisation, kein Widerrufsrecht bei termingebundenen Veranstaltungen."

- [ ] **Step 2: Entry button in `edit-event/[id].tsx`** after the save button:
```tsx
<Pressable onPress={() => router.push({ pathname: '/org/event-tickets/[id]' as any, params: { id: id as string } })} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}>
  <Text style={styles.secondaryBtnText}>Tickets verwalten</Text>
</Pressable>
```
Add `secondaryBtn`/`secondaryBtnText` styles matching the existing button block (border 1, radius as the save button, primary-coloured text). Show it only when `isStripeConnectEnabled({ walletAddress })` is true (state + effect like Task 10) or when the event already has ticket types.

- [ ] **Step 3: Verify tsc on the two files, commit:**
```bash
git add "apps/expo/app/org/event-tickets/[id].tsx" "apps/expo/app/edit-event/[id].tsx"
git commit -m "feat(expo): ticket types editor per event for org accounts"
git push
```

---

### Task 12: Buy flow — order screen + event detail CTA

**Files:**
- Create: `apps/expo/app/event/[id]/tickets.tsx`
- Modify: `apps/expo/app/event/[id].tsx` (after the `priceLine` block, before `<InterestSocialRow …>`, around line 486)

**Interfaces:**
- Consumes: `fetchTicketTypes`, `startCheckout`, `openCheckout`, `formatCents`, `isTicketSalesEnabled`, `useActiveAccount()`.
- Produces: route `/event/[id]/tickets`; after checkout navigates to `/tickets/[order]` (Task 13).

- [ ] **Step 1: CTA in `event/[id].tsx`.** Add state `ticketTypes` + `salesEnabled`; effect: `isTicketSalesEnabled()` then `fetchTicketTypes(id)`. When both truthy and the array is non-empty render:
```tsx
<Pressable onPress={() => router.push({ pathname: '/event/[id]/tickets' as any, params: { id } })} style={({ pressed }) => [styles.ticketCta, { backgroundColor: colors.primary }, pressed && styles.pressed]} accessibilityRole="button">
  <Text style={styles.ticketCtaText}>{minPrice === 0 ? 'Platz sichern' : `Tickets ab ${formatCents(minPrice)}`}</Text>
</Pressable>
```
`minPrice = Math.min(...ticketTypes.map((t) => t.price_cents))`. Styles: `ticketCta: { marginTop: 12, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }`, `ticketCtaText: { color: '#fff', fontSize: 15, fontFamily: 'MonaSansSemiCondensed-Bold' }`. Keep the existing `priceLine` text as is.

- [ ] **Step 2: Order screen `event/[id]/tickets.tsx`.**
  - Loads event (`title, date, time, location, account_id`) and the org name (`accounts` select `name` by `account_id`), ticket types.
  - Type picker (radio rows: name, description, price, "ausverkauft" is unknown client-side → leave), quantity stepper 1…`per_order_max`, optional email TextInput ("Für die Zahlungsbestätigung von Stripe, optional").
  - Summary: `quantity × price = total`, line "Veranstalter: {orgName}", line "Preis inkl. MwSt. · Kein Widerrufsrecht bei termingebundenen Veranstaltungen (§ 312g Abs. 2 Nr. 9 BGB)".
  - Button: total > 0 → "Weiter zur Zahlung", else "Kostenlos reservieren". Handler:
    ```ts
    const res = await startCheckout(account, { ticketTypeId, quantity, email });
    if (!res.ok) return Alert.alert('Nicht möglich', res.message);
    if (res.data.status === 'paid' || !res.data.url) return router.replace({ pathname: '/tickets/[order]' as any, params: { order: res.data.order_id } });
    await openCheckout(res.data.url, res.data.order_id);
    router.replace({ pathname: '/tickets/[order]' as any, params: { order: res.data.order_id } });
    ```
  - If the wallet is missing (`!account`) show "Bitte melde dich an, um Tickets zu kaufen." and disable the button.

- [ ] **Step 3: Verify tsc on both files, commit:**
```bash
git add "apps/expo/app/event/[id]/tickets.tsx" "apps/expo/app/event/[id].tsx"
git commit -m "feat(expo): ticket order screen and event detail CTA"
git push
```

---

### Task 13: Ticket wallet — list, order detail with QR, profile entry

**Files:**
- Create: `apps/expo/app/tickets/index.tsx`
- Create: `apps/expo/app/tickets/[order].tsx`
- Modify: `apps/expo/components/profile/ProfileActionGrid.tsx` (one more action)

**Interfaces:**
- Consumes: `fetchMyTickets`, `fetchOrder`, `orderStatusLabel`, `formatCents`, `react-native-qrcode-svg` (see `apps/expo/components/VerificationQRCode.tsx` for the existing usage), `useActiveAccount()`.
- Produces: routes `/tickets` and `/tickets/[order]` (deep-link target `roebel://tickets/<orderId>` after Checkout).

- [ ] **Step 1: `tickets/index.tsx`.** Header "Meine Tickets". `fetchMyTickets(account)` on focus; sections "Demnächst" (event date ≥ today, status paid) and "Vergangen / Sonstige". Row: event image thumbnail (or placeholder), title, date+time, `ticket_type_name × quantity`, status pill via `orderStatusLabel`. Tap → `/tickets/[order]`. Empty state: "Noch keine Tickets. Veranstaltungen findest du unter Events." Pull-to-refresh.

- [ ] **Step 2: `tickets/[order].tsx`.** Loads `fetchOrder(account, order)`.
  - While `status === 'pending'`: title "Zahlung wird bestätigt…", `ActivityIndicator`, poll every 2 s up to 3 min (`setInterval` cleared on unmount, same as `roebel-card/topup-success.tsx`); after 3 min show "Noch keine Bestätigung. Wenn du bezahlt hast, erscheint das Ticket in Kürze unter Meine Tickets." with a "Neu laden" button.
  - `paid`: event card (title, date, time, location), then one QR block per ticket: `<QRCode value={ticket.qr} size={220} />`, code below in monospace, state line ("Gültig" / "Eingelöst am …" / "Erstattet"), swipe/scroll between tickets. Note: "Beim Einlass vorzeigen. Der Code ist personengebunden nicht nötig, aber jeder Code gilt nur einmal."
  - `expired`/`cancelled`: "Diese Bestellung ist abgelaufen. Du kannst neu buchen." with a button back to `/event/[id]/tickets`.
  - `refunded`: "Erstattet – der Betrag geht an das Zahlungsmittel zurück."
  - Button "Zum Kalender" uses the same helper as `event/[id].tsx` (`handleSaveToCalendar` logic; if not exported, skip the button).

- [ ] **Step 3: Profile grid entry.** Read `ProfileActionGrid.tsx` and add an action `{ href: '/tickets', label: 'Meine Tickets', … }` following the existing entries' field names and icon convention (use an existing ticket/qr icon from `@/assets/icons` if present, otherwise the icon used for "Events"). Only for personal accounts (the grid already distinguishes org vs personal).

- [ ] **Step 4: Verify tsc on the three files, commit:**
```bash
git add apps/expo/app/tickets/index.tsx "apps/expo/app/tickets/[order].tsx" apps/expo/components/profile/ProfileActionGrid.tsx
git commit -m "feat(expo): ticket wallet with QR codes and post-checkout polling"
git push
```

---

### Task 14: Door scanner

**Files:**
- Modify: `apps/expo/components/QRScanner.tsx` (type union + parse branch + label)
- Create: `apps/expo/app/org/scan-tickets.tsx`

**Interfaces:**
- Consumes: `checkInTicket`, `isTicketPayload`, `useAccount()` (org context), `useActiveAccount()`.

- [ ] **Step 1: QRScanner.** Add `'ticket'` to the `type` union and `ticketPayload?: string` to `QRScanResult`. In `parseQRCode`, before the Röbel Card branches:
```ts
// Event ticket (HMAC-signed): roebel-ticket:v1:<code>:<hmac16>; verified server-side at check-in.
if (/^roebel-ticket:v1:[A-HJ-NP-Z2-9]{10}:[0-9a-f]{16}$/.test(data)) {
  return { type: 'ticket', data, ticketPayload: data };
}
```
Add `ticket: 'Ticket'` to `typeLabels`. In the default navigation branch add `else if (result.type === 'ticket') { setScanned(false); }` (handled by parent).

- [ ] **Step 2: `org/scan-tickets.tsx`.** Guard org account. Renders `<QRScanner allowedTypes={['ticket']} onScan={handleScan} />` full screen with a result banner on top:
  - `handleScan`: `checkInTicket(account, result.ticketPayload)` → banner green "Gültig · {ticket_type_name}" (`ok`), amber "Bereits eingelöst um {time}" (`already_checked_in`), red "Ungültig" (`invalid`), red "Erstattet" (`refunded`), red "Kein Zugriff" on `FORBIDDEN`; counter line "{checked_in_count} / {issued_count} eingelassen". `Haptics.notificationAsync` success/error accordingly. Banner auto-hides after 2.5 s and the scanner re-arms (the component resets `scanned` when the parent handles; if it does not, remount via a `key` counter).
  - Header with back button and title "Einlass".

- [ ] **Step 3: Verify tsc on both files, commit:**
```bash
git add apps/expo/components/QRScanner.tsx apps/expo/app/org/scan-tickets.tsx
git commit -m "feat(expo): door scanner for event tickets"
git push
```

---

### Task 15: Sandbox end-to-end verification (main session)

**Files:** none new; uses `apps/web/scripts/stripe-connect-smoke.mjs`, the Supabase MCP, Vercel.

- [ ] **Step 1: Apply the migration** with the Supabase MCP after `get_project_url` shows project `wwbeqhkslxdxhktqzqti`; then `list_tables` shows the five tables and `execute_sql` `select proname from pg_proc where proname in ('reserve_tickets','expire_ticket_orders')` returns both.
- [ ] **Step 2: Webhook endpoint:** `node --env-file=apps/web/.env.local apps/web/scripts/stripe-connect-smoke.mjs webhook https://www.roebel.app/api/webhooks/stripe-connect` → set `STRIPE_CONNECT_WEBHOOK_SECRET`, `TICKET_QR_SECRET` (`openssl rand -hex 32`), `STRIPE_PLATFORM_FEE_BPS=200`, `STRIPE_PLATFORM_FEE_FIXED_CENTS=10`, `NEXT_PUBLIC_WEB_BASE_URL=https://www.roebel.app` on Vercel (production + preview) and in `.env.local`.
- [ ] **Step 3: Deploy** (push to `main` triggers Vercel); `GET https://www.roebel.app/api/webhooks/stripe-connect` → `{ has_secret: true }`.
- [ ] **Step 4: Flags:** `app_settings` upsert `stripe_connect_enabled = '<max wallet>'`, `stripe_tickets_enabled = 'true'`.
- [ ] **Step 5: Org flow on a device/emulator (Max):** org → Einstellungen → Zahlungen → Mit Stripe einrichten → complete the sandbox onboarding with test data → status "Aktiv"; Veranstaltung bearbeiten → Tickets verwalten → one paid type (€1) + one free type.
- [ ] **Step 6: Citizen flow:** event → "Tickets ab 1 €" → Weiter zur Zahlung → `4242 4242 4242 4242` → back in app → QR shown; `stripe-connect-smoke.mjs fees` shows the €0.12 application fee (2 % of €1 = 2 ct + 10 ct); org → Einlass → scan → "Gültig", second scan → "Bereits eingelöst".
- [ ] **Step 7: Refund:** `POST /api/tickets/refund` via the app (org order list is not in slice A; call it with the smoke script pattern or the Stripe dashboard "Refund" on the connected account) → order `refunded`, ticket QR shows "Erstattet", `fees` shows the fee refunded.
- [ ] **Step 8:** Update memory + assessment doc §8 with what shipped; Max runs `eas update` himself.
