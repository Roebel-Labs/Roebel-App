# Röbel Gamification — Admin Backend Spec

Drop-in context doc for a web/backend agent that wants to build or extend the admin CRUD surface for the gamification feature (Münzen, Schatzkammer, lootboxes, rewards, tasks, referrals). The mobile app is already shipped and consumes the schema below — treat the tables + RPCs as **the contract** and keep them stable.

Repo: Turborepo monorepo. Admin lives at `apps/web` (Next.js 15 App Router, Tailwind + shadcn/ui). Mobile lives at `apps/expo`. Backend is Supabase (Postgres + Auth + Storage).

---

## 1. What already exists

### Migrations shipped (apply in this order if starting from scratch)

| File | Purpose |
| --- | --- |
| `supabase/migrations/20260422_rewards_gamification.sql` | Initial schema: `rewards_tasks`, `rewards_task_completions`, `rewards_daily_checkins`, `lootboxes`, `lootbox_rewards`, `lootbox_reward_pool`, `user_lootbox_keys` (generic), `user_lootbox_rewards`, `referral_codes`, `referral_redemptions`. All six RPCs. Seed data for tasks + 9 lootboxes + 15 rewards + weighted pool. |
| `supabase/migrations/20260423_rewards_gamification_fixes.sql` | All RPCs guarded by `rewards_user_exists()` so they return `{ error: 'user_not_ready' }` instead of FK 23503 when `users` row hasn't committed yet. `ensure_referral_code` rewritten to use `md5()` (no `pgcrypto` dependency). |
| `supabase/migrations/20260424_referral_code_fix.sql` | `ensure_referral_code` made idempotent under concurrent callers via `ON CONFLICT DO NOTHING` + re-read, suffix widened to 8 hex chars. |
| `supabase/migrations/20260425_rewards_catalogue_expansion.sql` | 20 more `lootbox_rewards` entries + auto-wires them into every `lootboxes` row with rarity-weighted pool rows. |
| `supabase/migrations/20260426_rewards_per_lootbox_keys.sql` | **Breaking**: drops `user_lootbox_keys` and recreates with composite PK `(wallet_address, lootbox_id)`. `purchase_lootbox_key` / `open_lootbox` rewritten to scope to a specific chest. |
| `supabase/migrations/20260427_rewards_relax_rls.sql` | Relaxed SELECT RLS on user-scoped rewards tables to `using (true)` so the anon client can read its own rows (the app uses a wallet-address trust model, not Supabase Auth). |
| `supabase/migrations/20260428_rewards_unique_cosmetic_drops.sql` | `open_lootbox` excludes cosmetic rewards the user already owns. Coin bundles stay repeatable. |
| `supabase/migrations/20260429_themed_lootboxes.sql` | Adds `lootboxes.guaranteed_reward_type` (nullable). When set, `open_lootbox` only draws rewards of that type (e.g. Rahmen-Truhe → profile_frame). Re-seeds the 9 chests: 6 themed (one per reward type) + 3 mystery. |

### Admin UI already in place (minimal)

- `apps/web/src/app/admin/dashboard/rewards/page.tsx` — tabbed admin with three tabs (Aufgaben, Truhen, Belohnungen), dialog-based create/edit/delete, pool-weight editor.
- `apps/web/src/app/actions/rewards-admin.ts` — server actions calling Supabase via `@/lib/supabase/server`.
- Sidebar entry in `apps/web/src/components/admin/admin-sidebar.tsx` under "Belohnungen".

The existing admin works but uses remote URLs for images (admin pastes links). The main gap is **image uploads** (see §6).

### Admin files to read first
```
apps/web/src/app/admin/dashboard/rewards/page.tsx
apps/web/src/app/actions/rewards-admin.ts
apps/web/src/app/admin/dashboard/help/page.tsx      # reference pattern
apps/web/src/app/actions/help-hub.ts                # reference pattern
apps/web/src/app/api/upload-image/route.ts          # existing storage uploader
apps/web/src/lib/supabase/server.ts                 # createClient() pattern
apps/web/src/lib/supabase/client.ts                 # browser createClient()
```

---

## 2. Database schema — full reference

All tables live in the `public` schema. Convention across the codebase: snake_case, `uuid` PKs, `timestamptz` timestamps, RLS on with write access only via SECURITY DEFINER RPCs or via server actions using the server-side Supabase client.

### 2.1 `rewards_tasks`

Remote-configured onboarding + habit tasks. The mobile app pulls from here to render the "Missionen für Münzen" list and uses `key` as a stable slug for auto-complete logic.

```
id              uuid      PK, default gen_random_uuid()
key             text      UNIQUE, stable slug (e.g. 'complete_profile'). Never rename — mobile code references it.
title           text      NOT NULL
description     text      NOT NULL
image_url       text      optional, displayed as the task thumbnail
coin_amount     integer   NOT NULL, >= 0
cta_label       text      default 'Mitmachen'
cta_route       text      in-app route pushed when user taps the task (e.g. '/profile/edit')
is_repeatable   boolean   default false. When false → one-time completion per wallet.
cooldown_hours  integer   default 0, >= 0. Only meaningful when is_repeatable.
display_order   integer   default 0
is_published    boolean   default false. Only published tasks visible in the app.
created_at      timestamptz default now()
updated_at      timestamptz default now() (trigger keeps it fresh)
```

**RLS:** `for select using (is_published = true)`. Writes via server actions (no public write).

**Recognized stable keys** (trigger auto-completion from mobile client state — do NOT rename these):
`first_login`, `complete_profile`, `add_profile_picture`, `activate_push`, `read_help_hub`, `join_first_event`, `verify_citizen`, `refer_friend`, `vote_on_proposal`, `attend_event`.

Admins may add **new** keys at will. Custom keys need a matching mobile trigger or remain manual (user completes by tapping the CTA and returning).

### 2.2 `rewards_task_completions`

Per-user log of every time a task was completed.

```
id              uuid      PK
wallet_address  text      NOT NULL, indexed
task_id         uuid      NOT NULL, FK rewards_tasks(id) ON DELETE CASCADE
task_key        text      NOT NULL (denormalised for easy queries after a task is deleted)
coins_awarded   integer   NOT NULL
completed_at    timestamptz default now()
```

**RLS:** `for select using (true)` — the mobile client reads its own rows. Writes happen exclusively via the `complete_reward_task` RPC.

### 2.3 `rewards_daily_checkins`

Streak ledger — one row per (wallet, calendar_date).

```
wallet_address  text      NOT NULL
checkin_date    date      NOT NULL
coins_awarded   integer   NOT NULL
streak_day      integer   NOT NULL, >= 1
is_bonus        boolean   default false (true on every 3rd consecutive day → 2× coins)
created_at      timestamptz default now()
PRIMARY KEY (wallet_address, checkin_date)
```

**RLS:** `for select using (true)`. Writes via `claim_daily_checkin` RPC.

### 2.4 `lootboxes`

Chest catalogue. Each row is a purchasable chest variant.

```
id                      uuid      PK
name                    text      NOT NULL (e.g. 'Rahmen-Truhe', 'Mystery-Truhe')
description             text
image_url               text      chest art; can be blob-URL from Storage or placehold.co placeholder
coins_per_key           integer   NOT NULL, > 0 (cost of buying a key for this chest)
guaranteed_reward_type  text      nullable. When set (one of the six lootbox_rewards.type values), open_lootbox only draws rewards of that type — "themed" chest. NULL = mystery chest (full weighted pool).
display_order           integer   default 0
is_published            boolean   default false
created_at              timestamptz default now()
updated_at              timestamptz default now() (trigger)
```

**Current seeded chests** (renumbered by migration 29):

| # | name | guaranteed_reward_type |
| --- | --- | --- |
| 0 | Rahmen-Truhe | `profile_frame` |
| 1 | Sticker-Truhe | `sticker` |
| 2 | Mecky-Truhe | `animated_sticker` |
| 3 | Banner-Truhe | `profile_banner` |
| 4 | Abzeichen-Truhe | `badge` |
| 5 | Münz-Truhe | `coin_bundle` |
| 6 | Mystery-Truhe I | NULL |
| 7 | Mystery-Truhe II | NULL |
| 8 | Mystery-Truhe III | NULL |

Admin form should expose `guaranteed_reward_type` as a `<Select>` with options {Keine (Mystery), Profilrahmen, Sticker, Animierter Sticker, Banner, Abzeichen, Münzen}.

**RLS:** `for select using (is_published = true)`. Writes via server actions.

### 2.5 `lootbox_rewards`

Catalogue of possible drops. Six reward types are supported — mobile + admin UI both expect exactly these strings:

- `profile_frame` — decorative ring around the user's avatar on their identity card (rendered by `apps/expo/components/AvatarWithFrame.tsx`). Expected asset: transparent-PNG ring, square.
- `profile_banner` — header cover on public profile pages. Mobile surface not wired yet (staged in schema). Expected asset: wide landscape image, ~4:1.
- `sticker` — static Mecky reaction image. Future use in post + comment composer. Expected asset: square PNG.
- `animated_sticker` — animated Mecky. Future use in event experiences / chats. Expected asset: GIF or Lottie JSON.
- `badge` — small cosmetic pill rendered next to the avatar. Expected asset: square PNG, looks good at 28×28.
- `coin_bundle` — grants `coin_value` coins on open (self-consuming). `coin_value` column is required for this type.

```
id           uuid      PK
type         text      CHECK IN ('profile_frame','sticker','animated_sticker','profile_banner','badge','coin_bundle')
name         text      NOT NULL
description  text
asset_url    text      NOT NULL (image / GIF / lottie JSON URL)
rarity       text      CHECK IN ('common','rare','epic','legendary'), default 'common'
coin_value   integer   nullable; only used when type = 'coin_bundle'
created_at   timestamptz default now()
```

**RLS:** `for select using (true)`. Writes via server actions.

### 2.6 `lootbox_reward_pool`

Weighted drop pool: many-to-many (lootbox ↔ reward) with per-pairing weight.

```
lootbox_id  uuid  FK lootboxes(id) ON DELETE CASCADE
reward_id   uuid  FK lootbox_rewards(id) ON DELETE CASCADE
weight      integer NOT NULL, > 0
PRIMARY KEY (lootbox_id, reward_id)
```

`open_lootbox` does a weighted random walk: `sum(weight)`, roll `floor(random() * total)`, walk the running sum to pick a `reward_id`. Admin UI should let editors set weight to `0` (= remove row) or any positive integer.

**RLS:** `for select using (true)`. Writes via server actions.

**Baseline weighting** (seeded by migration 25): `common=50`, `rare=20`, `epic=8`, `legendary=2`. Admins can override per-chest to shift the drop table.

### 2.7 `user_lootbox_keys` (per-chest, not generic)

Per-user, per-lootbox key balance. Changed in migration 26.

```
wallet_address   text    NOT NULL
lootbox_id       uuid    NOT NULL, FK lootboxes(id) ON DELETE CASCADE
key_count        integer default 0, >= 0
total_purchased  integer default 0
total_used       integer default 0
updated_at       timestamptz default now()
PRIMARY KEY (wallet_address, lootbox_id)
```

**RLS:** `for select using (true)`. Writes only via `purchase_lootbox_key` + `open_lootbox` RPCs.

### 2.8 `user_lootbox_rewards`

Per-user inventory of won cosmetics.

```
id              uuid      PK
wallet_address  text      NOT NULL, indexed
reward_id       uuid      FK lootbox_rewards(id)
lootbox_id      uuid      FK lootboxes(id)  (nullable — the chest it came from, for telemetry)
obtained_at     timestamptz default now()
is_equipped     boolean   default false
```

**RLS:**
- `for select using (true)`
- `for update using (true) with check (true)` — the mobile client toggles `is_equipped` directly for wardrobe UX (NOT through an RPC).

### 2.9 `referral_codes`

One code per wallet. Code format: `MECKY-XXXXXXXX` (8 hex chars).

```
wallet_address  text  PK
code            text  UNIQUE, NOT NULL
created_at      timestamptz default now()
```

**RLS:** `for select using (true)`. Writes via `ensure_referral_code` RPC (idempotent).

### 2.10 `referral_redemptions`

One row per successful referral claim. Guarded by `UNIQUE (referred_wallet)` so a user can only redeem once.

```
id                      uuid      PK
code                    text      FK referral_codes(code)
referrer_wallet         text      NOT NULL
referred_wallet         text      NOT NULL UNIQUE
redeemed_at             timestamptz default now()
coins_awarded_referrer  integer   NOT NULL (default 200)
coins_awarded_referred  integer   NOT NULL (default 100)
```

**RLS:** `for select using (true)`. Writes via `redeem_referral` RPC.

### 2.11 Existing coin ledger (reused, DO NOT DUPLICATE)

The gamification feature piggybacks on the existing Röbel Card points system. These tables already exist:

```
roebel_points_card (
  wallet_address  text PK, FK users(wallet_address),
  points_balance  integer,
  total_earned    integer,
  total_spent     integer,
  tier            text, -- unused by gamification
  streak_days     integer, -- synced by claim_daily_checkin
  last_activity_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz
)

roebel_points_ledger (
  id              uuid PK,
  wallet_address  text,
  amount          integer, -- positive = credit, negative = debit
  action          text,    -- see list below
  reference_type  text,
  reference_id    text,
  description     text,
  created_at      timestamptz
)

increment_roebel_points(p_wallet_address text, p_amount integer) returns integer  -- the atomic balance mutation
```

`points_balance` is the **single source of truth for Münzen**. Do not create a second currency.

Ledger `action` values written by gamification RPCs:
- `daily_checkin_bonus`
- `task_complete`
- `lootbox_key_purchase`
- `lootbox_open_bonus`
- `referral_received`

(The legacy ledger also writes `vote`, `event_attend`, `post`, etc. from other features.)

---

## 3. RPC reference

Every mutation goes through a `SECURITY DEFINER` RPC. Call from server-side with the anon client + explicit wallet param (the codebase doesn't wire Supabase Auth to the wallet). All RPCs return a JSON object with `success: boolean` + either a typed error string or the payload.

```
claim_daily_checkin(p_wallet text) -> jsonb
  success cases: { success: true, coins_awarded, streak_day, is_bonus, new_balance, next_bonus_in }
  errors:        'user_not_ready' | 'already_checked_in'

complete_reward_task(p_wallet text, p_task_key text) -> jsonb
  success: { success: true, coins_awarded, new_balance, task_key }
  errors:  'user_not_ready' | 'task_not_found' | 'already_completed' | 'cooldown_active'

purchase_lootbox_key(p_wallet text, p_lootbox_id uuid) -> jsonb
  success: { success: true, new_balance, new_key_count }  -- new_key_count is for this specific lootbox
  errors:  'user_not_ready' | 'lootbox_not_found' | 'insufficient_balance'

open_lootbox(p_wallet text, p_lootbox_id uuid) -> jsonb
  success: { success: true, reward_id, user_reward_id, type, name, description, asset_url, rarity, coin_value }
  errors:  'user_not_ready' | 'no_key' | 'empty_pool' | 'pool_exhausted'
  note: Cosmetics (every type except coin_bundle) drop at most once per wallet.
        'pool_exhausted' fires when the user already owns every cosmetic in
        this chest's pool AND the pool has no coin_bundle entries.
        The key is NOT consumed in that case.

ensure_referral_code(p_wallet text) -> text
  returns the code (creates if missing). Idempotent under concurrency.

redeem_referral(p_code text, p_referred_wallet text) -> jsonb
  success: { success: true, referrer, bonus_referrer, bonus_referred }
  errors:  'code_invalid' | 'self_referral' | 'user_not_ready' | 'already_redeemed'
```

Helper function used internally: `rewards_user_exists(p_wallet text) -> boolean` (guards every RPC so the mobile client gets a clean `user_not_ready` while UserContext is still upserting the `users` row).

Admin dashboard rarely needs the RPCs — it edits the catalogue tables. The RPCs are for the mobile app. One exception: if the admin wants a "grant X" action (e.g. manually hand someone 500 coins) you'd wrap `increment_roebel_points` in a new admin-only RPC. Not currently implemented.

---

## 4. Seed data already in place

- **10 reward tasks** (see §2.1 recognised stable keys).
- **9 lootboxes** all named "Truhe", `coins_per_key = 200`, `is_published = true`.
- **15 base `lootbox_rewards`** (frames, stickers, animated stickers, banners, 1 coin_bundle) + **20 from the expansion migration** (more of each type plus three coin-bundle tiers). Total ≈ 35 rows.
- **Full `lootbox_reward_pool`**: every chest has every non-retired reward with a rarity-weighted entry.
- **All `asset_url` / `image_url` values are `https://placehold.co/...` placeholders.** Replacing these with real artwork via uploads is the #1 thing the admin needs.

---

## 5. What the admin dashboard should own (CRUD surface)

Current `/admin/dashboard/rewards` covers:
- List + create + edit + delete + publish-toggle for `rewards_tasks`.
- List + create + edit + delete for `lootboxes`, with a pool-weight editor dialog.
- List + create + edit + delete for `lootbox_rewards`.

Recommended additions the web agent should consider:

1. **Image uploads** for `rewards_tasks.image_url`, `lootboxes.image_url`, `lootbox_rewards.asset_url`. Reuse the existing `/api/upload-image` route at `apps/web/src/app/api/upload-image/route.ts` (it uploads to `storage.images/*`, returns a public URL). Suggested storage prefixes: `rewards-tasks/`, `lootboxes/`, `lootbox-rewards/`.
2. **Wallet-lookup page** — search a wallet address and see: coin balance, keys by lootbox, owned rewards, referral stats, ledger tail. Useful for support. Read-only.
3. **Ledger viewer** — paged list of `roebel_points_ledger` filtered by action, wallet, date. Already exists for the Röbel Card admin; gamification actions (`task_complete`, `lootbox_key_purchase`, etc.) should be surfaced alongside.
4. **Manual grant** — a "Give N Münzen" button on the wallet-lookup page. Will need a new admin-only RPC like:
   ```sql
   create function admin_grant_coins(p_wallet text, p_amount integer, p_reason text)
     returns integer
     language plpgsql
     security definer
   ```
   Lock it behind a service-role check or put it behind a server action that uses the service-role key.
5. **Referral audit** — list recent redemptions with both wallet addresses + links.
6. **Drop-rate preview** — given a selected lootbox, roll 1000 times client-side using the pool weights and show a histogram. Helps tune rarity.

---

## 6. Image upload pattern

Existing helper (reuse, don't duplicate):

```typescript
// apps/web/src/app/api/upload-image/route.ts
// POST multipart/form-data { file, folder? } -> { publicUrl, filePath }
```

Validates MIME (`image/*` only), size (max 5 MB), writes to `storage.images/<folder>/<timestamped-name>`, returns the public URL. Already used by the events admin.

For reward `asset_url` specifically, consider allowing larger files if animated Mecky rewards are Lotties (JSON) or higher-res GIFs; bump the size cap on a copy of this route if needed.

---

## 7. Auth / security notes

- The admin dashboard is **not currently gated by a login check** — the middleware was stripped. The perimeter today is RLS on write (writes go through server actions using `createClient()` from `@/lib/supabase/server`, which uses the anon key — so policies still apply).
- **Before production**, add an admin auth claim and write a proper INSERT/UPDATE/DELETE RLS policy on every catalogue table (`rewards_tasks`, `lootboxes`, `lootbox_rewards`, `lootbox_reward_pool`). Until then, anyone who loads `/admin/dashboard/rewards` could in principle edit via the browser devtools.
- Service-role key (for manual grants / audit-only queries) lives in `SUPABASE_SERVICE_ROLE_KEY` env var. Never ship it to the client.

---

## 8. Mobile ↔ admin contract that MUST NOT break

The mobile app reads:
- `rewards_tasks` where `is_published = true`, ordered by `display_order`.
- `lootboxes` where `is_published = true`, ordered by `display_order`.
- `lootbox_rewards` (full table).
- `user_lootbox_keys` for the current wallet where `key_count > 0`.
- `user_lootbox_rewards` for the current wallet (joined with `lootbox_rewards`).
- `roebel_points_card` / `roebel_points_ledger` for balance + history.
- `referral_codes` + `referral_redemptions`.

The mobile app writes:
- Directly: `user_lootbox_rewards.is_equipped` (wardrobe toggle).
- Via RPCs: everything in §3.

**Rules for the admin:**
- Never hard-delete a task or lootbox that has `rewards_task_completions` / `user_lootbox_rewards` referencing it — ON DELETE CASCADE will wipe user inventory. Prefer soft-delete via `is_published = false`, or handle with care.
- `rewards_tasks.key` is immutable once the mobile ships with it as a trigger condition. Never reassign.
- `lootbox_rewards.type` values are the six strings listed in §2.5 — don't introduce new types without also shipping mobile code to render them.
- `lootbox_rewards.coin_value` must be set for `type = 'coin_bundle'`; should be null for every other type.
- Cosmetic rewards (every type except `coin_bundle`) are one-shot per wallet: `open_lootbox` filters rewards the user already owns out of the weighted roll. If you want a visually-similar drop to appear twice, create a second `lootbox_rewards` row with a distinct `id` — the filter matches on `reward_id`, not on name.

---

## 9. Verification checklist

1. Run all six migrations in order (or confirm they've been applied in the dashboard's `supabase_migrations.schema_migrations` table).
2. Load `/admin/dashboard/rewards`. All three tabs render with seed data.
3. Create a new task with a uploaded image, publish it → refresh the mobile `/rewards` screen → the new task appears in "Verfügbar".
4. Create a new reward of type `sticker` with an uploaded asset, add it to an existing lootbox's pool with weight 100, publish the lootbox → from the mobile app, open a key for that lootbox → the new sticker drops with high frequency.
5. Edit a lootbox's `coins_per_key` → mobile Schatzkammer reflects the new cost without needing a rebuild.
6. Toggle `is_published = false` on a task → it disappears from the mobile list. Toggle it back on → it returns.
7. Delete a `lootbox_rewards` entry that's in a pool → the `ON DELETE CASCADE` removes pool rows. Confirm the lootbox is still openable (remaining weights re-normalise automatically).
8. Inspect `roebel_points_ledger` after a mobile test: rows with actions `daily_checkin_bonus`, `task_complete`, `lootbox_key_purchase`, `lootbox_open_bonus`, `referral_received` should all appear.

---

## 10. Quick wins for the first admin PR

Ranked by user value:

1. Storage-backed image uploads on all three edit dialogs (replaces placehold.co placeholders with real artwork → mobile UI finally looks shippable).
2. Admin-login gate on `/admin/dashboard/**` + write RLS policies.
3. Drop-rate preview histogram inside the pool editor.
4. Wallet-lookup + manual coin grant.
5. Ledger viewer with gamification action filters.

Everything else (referral audit, advanced reward types) can come later.
