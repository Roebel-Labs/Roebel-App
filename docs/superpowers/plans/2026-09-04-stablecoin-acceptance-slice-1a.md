# Stablecoin Acceptance Rail — Slice 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Röbel business owner onboards a Gnosis Pay account from the Expo app and appears on the map with an "accepts stablecoin" badge.

**Architecture:** The owner's existing thirdweb Gnosis smart account signs Sign-In-with-Ethereum against the Gnosis Pay API, walks the fixed onboarding sequence (signup → terms → KYC → source-of-funds → phone OTP → Safe deploy), and the resulting Safe address is stored in a new Supabase registry linked to the `businesses` / `restaurants` / `accounts` row. A Gnosis Pay webhook edge function advances KYC status server-side so the app does not have to poll. The map reads a public view and draws a badge.

**Tech Stack:** Expo SDK 56 / React Native (StyleSheet + `useTheme()`), thirdweb v5 (`useActiveAccount`, ERC-1271 smart accounts, chain 100), Supabase (Postgres + RLS + Deno edge functions), Jest (`jest-expo`), Gnosis Pay REST API v1.

**Spec:** [`docs/superpowers/specs/2026-09-04-stablecoin-acceptance-rail-design.md`](../specs/2026-09-04-stablecoin-acceptance-rail-design.md)

## Global Constraints

- **Code English, UI German.** Every identifier and comment in English; every user-facing string in German. Applied migrations are never renamed.
- **Styling:** `StyleSheet.create()` + `useTheme()`. NO NativeWind. Tokens from `constants/theme.ts`.
- **Never show wallet addresses.** Resolve to a display name. The single exception in this slice is the merchant's own "Empfangen" screen (slice 1b) — nothing in 1a renders a raw `0x`.
- **Chain:** Gnosis, chain id 100. `gnosis` (thirdweb bundler, gasless writes) vs `gnosisRead` (pinned public RPC, reads) from `@/constants/gnosis`.
- **Supabase operations go through the Supabase MCP**, project ref `wwbeqhkslxdxhktqzqti` (`https://wwbeqhkslxdxhktqzqti.supabase.co`). The `supabase` CLI is not installed. Verify with `get_project_url` before any write.
- **Gnosis Pay partner identifiers** (already in `apps/expo/.env`, gitignored): `EXPO_PUBLIC_GNOSISPAY_PARTNER_ID=cmtmk560q0003z731jdlgrtj4`, `EXPO_PUBLIC_GNOSISPAY_APP_ID=gp_712789a8926bca9b2fa6f5d10110c087`, `EXPO_PUBLIC_GNOSISPAY_API_URL=https://api.gnosispay.com`.
- **EURe V2 on Gnosis:** `0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430` (18 decimals). V1 `0xcB444e90…` is deprecated — never use it.
- **Migrations** live in `apps/expo/supabase/migrations/`, named `YYYYMMDD_snake_case.sql`.
- **Commit convention:** `feat(expo): …`, `feat(supabase): …`, `docs: …`. Stage only the files the task touched — never `git add .` or `-A`. Push after every commit.
- **Do not run `eas update`.** Max runs EAS himself; "done" means commit + push.
- **Typecheck needs 8 GB:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` from `apps/expo`. The 2026-09-02 baseline is 30 pre-existing errors, all under `app/`, none in `lib/`. Do not chase those.

---

## File Structure

**New — Gnosis Pay client (`apps/expo/lib/gnosispay/`)**
| File | Responsibility |
|------|----------------|
| `types.ts` | Wire types + status unions for the whole client. No logic. |
| `client.ts` | One `gpFetch()` — base URL, bearer header, error normalisation. Nothing above it constructs a URL. |
| `auth.ts` | SIWE: nonce → message → sign → challenge → JWT. Token storage in `expo-secure-store`. |
| `onboarding.ts` | Pure state machine: given a `GpUser`, what is the next onboarding step? No I/O. |
| `api.ts` | Thin typed wrappers: signup, terms, KYC link, source-of-funds, phone OTP, safe deploy/config. |

**New — registry (`apps/expo/lib/merchant/`)**
| File | Responsibility |
|------|----------------|
| `registry.ts` | Supabase reads/writes for `merchant_payment_accounts` + `merchant_entities`. |
| `types.ts` | `MerchantPaymentAccount`, `MerchantEntityRef`, status unions. |

**New — UI (`apps/expo/app/(payments)/`)**
| File | Responsibility |
|------|----------------|
| `_layout.tsx` | Stack for the onboarding flow. |
| `onboarding.tsx` | The 7-step wizard host; owns progress + step routing. |
| `components/OnboardingStep.tsx` | Shared chrome: progress rail, title, body, one primary button. |

**New — backend**
| File | Responsibility |
|------|----------------|
| `apps/expo/supabase/migrations/20260904_merchant_payment_accounts.sql` | Tables, enums, RLS, public view. |
| `apps/expo/supabase/functions/gnosispay-webhook/index.ts` | Ed25519-verified webhook receiver. |

**Modified**
| File | Change |
|------|--------|
| `apps/expo/lib/map/filters.ts` | Add `acceptsStablecoin` to `MapFilterState`. |
| `apps/expo/lib/supabase-app-settings.ts` | Add `isStablecoinPaymentsEnabled()`. |
| `apps/expo/lib/types.ts` | Re-export merchant types alongside existing records. |

---

## Task 1: Merchant registry schema

**Files:**
- Create: `apps/expo/supabase/migrations/20260904_merchant_payment_accounts.sql`
- Apply via: Supabase MCP `apply_migration`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `merchant_payment_accounts`, `merchant_entities`; view `merchant_acceptance_public`; enums `merchant_account_status`, `merchant_entity_type`.

- [ ] **Step 1: Verify the MCP points at the right project**

Call `mcp__supabase__get_project_url`. Expected: `https://wwbeqhkslxdxhktqzqti.supabase.co`. If it differs, STOP — the MCP is bound to another working directory's `.mcp.json`.

- [ ] **Step 2: Write the migration file**

```sql
-- Merchant stablecoin acceptance registry (spec 2026-09-04, slice 1a).
--
-- One row per PERSON's Gnosis Pay account (the "Konto"); a person who owns
-- several places links each of them through merchant_entities. The Safe
-- address is the receive address printed into EIP-681 QR codes in slice 1b.

create type merchant_account_status as enum (
  'pending_kyc', 'kyc_approved', 'deploying', 'live', 'suspended'
);

create type merchant_entity_type as enum ('business', 'restaurant', 'account');

create table merchant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  -- lower-cased thirdweb smart-account address; the Gnosis Pay identity
  owner_wallet text not null unique,
  gp_user_id text unique,
  gp_safe_address text unique,
  chain_id integer not null default 100,
  token text not null default 'EURe',
  status merchant_account_status not null default 'pending_kyc',
  card_status text,
  iban_status text,
  daily_allowance_eur numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index merchant_payment_accounts_status_idx
  on merchant_payment_accounts (status);

create table merchant_entities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references merchant_payment_accounts(id) on delete cascade,
  entity_type merchant_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

create index merchant_entities_account_idx on merchant_entities (account_id);

alter table merchant_payment_accounts enable row level security;
alter table merchant_entities enable row level security;

-- The app authenticates with the anon key and carries no JWT claim for the
-- wallet, so reads are open on the non-sensitive columns via the view below
-- and ALL writes go through edge functions with the service role.
create policy merchant_accounts_no_client_write
  on merchant_payment_accounts for all
  using (false) with check (false);

create policy merchant_entities_no_client_write
  on merchant_entities for all
  using (false) with check (false);

-- Public acceptance list: what the map and (later) any third-party map needs,
-- and nothing else. No wallet, no user id, no status detail.
create view merchant_acceptance_public
with (security_invoker = off) as
  select e.entity_type,
         e.entity_id,
         a.token,
         a.chain_id
  from merchant_entities e
  join merchant_payment_accounts a on a.id = e.account_id
  where a.status = 'live';

grant select on merchant_acceptance_public to anon, authenticated;

-- Owner-scoped read of one's own account, by wallet. Security definer so it
-- bypasses the deny-all policy; the wallet argument is the only key, which is
-- safe because the Safe address is public information anyway.
create function merchant_account_for_wallet(p_wallet text)
returns table (
  id uuid,
  gp_user_id text,
  gp_safe_address text,
  status merchant_account_status,
  card_status text,
  iban_status text,
  token text,
  chain_id integer
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.gp_user_id, a.gp_safe_address, a.status,
         a.card_status, a.iban_status, a.token, a.chain_id
  from merchant_payment_accounts a
  where a.owner_wallet = lower(p_wallet)
$$;

revoke execute on function merchant_account_for_wallet(text) from public;
grant execute on function merchant_account_for_wallet(text) to anon, authenticated;
```

- [ ] **Step 3: Apply the migration**

Call `mcp__supabase__apply_migration` with `name: "merchant_payment_accounts"` and the SQL above.

- [ ] **Step 4: Verify the objects exist**

Call `mcp__supabase__execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('merchant_payment_accounts','merchant_entities','merchant_acceptance_public')
order by table_name;
```

Expected: all three rows.

- [ ] **Step 5: Check the security advisor**

Call `mcp__supabase__get_advisors` with `type: "security"`. The new view must not appear as a SECURITY DEFINER-view finding beyond the intended `merchant_acceptance_public`. Fix anything it flags on the new objects before committing; ignore pre-existing findings on other tables.

- [ ] **Step 6: Commit**

```bash
git add apps/expo/supabase/migrations/20260904_merchant_payment_accounts.sql
git commit -m "feat(supabase): merchant payment account registry + public acceptance view

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Gnosis Pay wire types and fetch client

**Files:**
- Create: `apps/expo/lib/gnosispay/types.ts`
- Create: `apps/expo/lib/gnosispay/client.ts`
- Test: `apps/expo/lib/__tests__/gnosispay-client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type GpKycStatus = 'notStarted' | 'documentsRequested' | 'pending' | 'processing' | 'approved' | 'resubmissionRequested' | 'rejected' | 'requiresAction'`
  - `interface GpUser { id: string; kycStatus: GpKycStatus; isSourceOfFundsAnswered: boolean; isPhoneValidated: boolean; safeWallet: { address: string }[] }`
  - `interface GpSafeConfig { address: string; accountStatus: number; tokenSymbol: string }`
  - `type GpResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }`
  - `async function gpFetch<T>(path: string, init?: { method?: string; body?: unknown; token?: string | null }): Promise<GpResult<T>>`

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/gnosispay-client.test.ts`:

```typescript
/**
 * gpFetch is the single door to the Gnosis Pay API. Everything above it
 * passes a path, never a URL, and reads a discriminated GpResult rather
 * than catching. These tests pin that contract with a stubbed fetch.
 */
import { gpFetch } from '@/lib/gnosispay/client';

const originalFetch = global.fetch;

function stubFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('gpFetch', () => {
  it('builds the URL from the configured base and returns parsed data', async () => {
    stubFetch(200, { id: 'user-1' });
    const result = await gpFetch<{ id: string }>('/api/v1/user', { token: 'jwt-1' });

    expect(result).toEqual({ ok: true, data: { id: 'user-1' } });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.gnosispay.com/api/v1/user');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-1');
  });

  it('omits the Authorization header when no token is given', async () => {
    stubFetch(200, {});
    await gpFetch('/api/v1/auth/nonce');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('maps 401 to an UNAUTHORIZED code rather than throwing', async () => {
    stubFetch(401, { message: 'nope' });
    const result = await gpFetch('/api/v1/user', { token: 'stale' });

    expect(result).toEqual({ ok: false, code: 'UNAUTHORIZED', message: 'nope' });
  });

  it('maps 422 to KYC_REQUIRED so safe deploy can explain itself', async () => {
    stubFetch(422, { message: 'User is not KYC approved' });
    const result = await gpFetch('/api/v1/safe/deploy', { method: 'POST', token: 'jwt' });

    expect(result).toEqual({
      ok: false,
      code: 'KYC_REQUIRED',
      message: 'User is not KYC approved',
    });
  });

  it('turns a network failure into NETWORK_ERROR, never a rejection', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const result = await gpFetch('/api/v1/user', { token: 'jwt' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NETWORK_ERROR');
  });

  it('serialises a JSON body and sets the content type', async () => {
    stubFetch(200, {});
    await gpFetch('/api/v1/auth/signup', {
      method: 'POST',
      token: 'jwt',
      body: { authEmail: 'a@b.de', partnerId: 'p1' },
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ authEmail: 'a@b.de', partnerId: 'p1' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-client.test.ts
```

Expected: FAIL — cannot resolve `@/lib/gnosispay/client`.

- [ ] **Step 3: Write the types**

Create `apps/expo/lib/gnosispay/types.ts`:

```typescript
/**
 * Wire types for the Gnosis Pay partner API (api.gnosispay.com, v1).
 *
 * Only the fields this app reads are modelled — the API returns more. Status
 * unions are copied verbatim from the vendor docs; a value outside them means
 * the API changed and the onboarding state machine should refuse to guess.
 */

/** KYC lifecycle as reported by GET /api/v1/user. */
export type GpKycStatus =
  | 'notStarted'
  | 'documentsRequested'
  | 'pending'
  | 'processing'
  | 'approved'
  | 'resubmissionRequested'
  | 'rejected'
  | 'requiresAction';

export interface GpUser {
  id: string;
  kycStatus: GpKycStatus;
  isSourceOfFundsAnswered: boolean;
  isPhoneValidated: boolean;
  /** Empty until POST /api/v1/safe/deploy has completed. */
  safeWallet: { address: string }[];
}

export interface GpSafeConfig {
  address: string;
  /** 0 means fully configured and ready to use. */
  accountStatus: number;
  tokenSymbol: string;
}

export interface GpTerms {
  id: string;
  version: string;
  /** Vendor calls this `currentVersion` in some payloads; normalised on read. */
  accepted: boolean;
}

export interface GpKycIntegration {
  type: 'SUMSUB_WEB';
  url: string;
}

export interface GpSourceOfFundsQuestion {
  question: string;
  answers: string[];
}

/**
 * Every call returns this instead of throwing: a failed call is an expected
 * outcome in an onboarding wizard, not an exception.
 */
export type GpResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GpErrorCode; message: string };

export type GpErrorCode =
  | 'UNAUTHORIZED'
  | 'KYC_REQUIRED'
  | 'ALREADY_DONE'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'NOT_CONFIGURED'
  | 'BAD_REQUEST';
```

- [ ] **Step 4: Write the client**

Create `apps/expo/lib/gnosispay/client.ts`:

```typescript
/**
 * The only place that knows the Gnosis Pay base URL and how one of its
 * responses becomes a GpResult. Callers pass a path; nothing above this file
 * builds a URL or reads `response.status`.
 */
import Constants from 'expo-constants';
import type { GpErrorCode, GpResult } from './types';

type Extra = {
  GNOSISPAY_API_URL?: string;
  GNOSISPAY_PARTNER_ID?: string;
  GNOSISPAY_APP_ID?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const GP_API_URL =
  extra.GNOSISPAY_API_URL ??
  process.env.EXPO_PUBLIC_GNOSISPAY_API_URL ??
  'https://api.gnosispay.com';

export const GP_PARTNER_ID =
  extra.GNOSISPAY_PARTNER_ID ?? process.env.EXPO_PUBLIC_GNOSISPAY_PARTNER_ID ?? '';

export const GP_APP_ID =
  extra.GNOSISPAY_APP_ID ?? process.env.EXPO_PUBLIC_GNOSISPAY_APP_ID ?? '';

function codeForStatus(status: number): GpErrorCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 409) return 'ALREADY_DONE';
  if (status === 422) return 'KYC_REQUIRED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'BAD_REQUEST';
}

export async function gpFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown; token?: string | null }
): Promise<GpResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(`${GP_API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, data: (payload ?? {}) as T };
    }

    const message =
      (payload as { message?: string } | null)?.message ?? `HTTP ${response.status}`;
    return { ok: false, code: codeForStatus(response.status), message };
  } catch (error) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Netzwerkfehler',
    };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-client.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/expo/lib/gnosispay/types.ts apps/expo/lib/gnosispay/client.ts apps/expo/lib/__tests__/gnosispay-client.test.ts
git commit -m "feat(expo): Gnosis Pay wire types + fetch client

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: Onboarding state machine

**Files:**
- Create: `apps/expo/lib/gnosispay/onboarding.ts`
- Test: `apps/expo/lib/__tests__/gnosispay-onboarding.test.ts`

**Interfaces:**
- Consumes: `GpUser`, `GpKycStatus` from `./types` (Task 2).
- Produces:
  - `type OnboardingStep = 'signup' | 'terms' | 'kyc' | 'kyc_wait' | 'kyc_blocked' | 'source_of_funds' | 'phone' | 'deploy' | 'done'`
  - `function nextStep(user: GpUser | null, termsAccepted: boolean): OnboardingStep`
  - `function isKycTerminal(status: GpKycStatus): boolean`
  - `const ONBOARDING_ORDER: OnboardingStep[]`
  - `function stepProgress(step: OnboardingStep): { index: number; total: number }`

This is the heart of the wizard and it is pure, so it is tested exhaustively before any screen exists.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/gnosispay-onboarding.test.ts`:

```typescript
/**
 * The onboarding wizard never decides for itself what comes next — it asks
 * nextStep(). The order is fixed by the Gnosis Pay API's own prerequisites:
 * KYC must be approved before source-of-funds, and everything must be done
 * before POST /safe/deploy (which 422s otherwise).
 */
import {
  nextStep,
  isKycTerminal,
  stepProgress,
  ONBOARDING_ORDER,
} from '@/lib/gnosispay/onboarding';
import type { GpUser } from '@/lib/gnosispay/types';

function user(overrides: Partial<GpUser> = {}): GpUser {
  return {
    id: 'u1',
    kycStatus: 'approved',
    isSourceOfFundsAnswered: true,
    isPhoneValidated: true,
    safeWallet: [{ address: '0xsafe' }],
    ...overrides,
  };
}

describe('nextStep', () => {
  it('starts at signup when there is no user yet', () => {
    expect(nextStep(null, false)).toBe('signup');
  });

  it('asks for terms before anything else once a user exists', () => {
    expect(nextStep(user({ kycStatus: 'notStarted' }), false)).toBe('terms');
  });

  it('opens KYC when terms are accepted and KYC has not started', () => {
    expect(nextStep(user({ kycStatus: 'notStarted' }), true)).toBe('kyc');
  });

  it('re-opens KYC when documents or a resubmission are requested', () => {
    expect(nextStep(user({ kycStatus: 'documentsRequested' }), true)).toBe('kyc');
    expect(nextStep(user({ kycStatus: 'resubmissionRequested' }), true)).toBe('kyc');
  });

  it('waits while KYC is pending or processing', () => {
    expect(nextStep(user({ kycStatus: 'pending' }), true)).toBe('kyc_wait');
    expect(nextStep(user({ kycStatus: 'processing' }), true)).toBe('kyc_wait');
  });

  it('blocks on a terminal KYC failure instead of looping', () => {
    expect(nextStep(user({ kycStatus: 'rejected' }), true)).toBe('kyc_blocked');
    expect(nextStep(user({ kycStatus: 'requiresAction' }), true)).toBe('kyc_blocked');
  });

  it('asks source-of-funds only after KYC approval', () => {
    expect(
      nextStep(user({ isSourceOfFundsAnswered: false, safeWallet: [] }), true)
    ).toBe('source_of_funds');
  });

  it('asks for phone verification after source-of-funds', () => {
    expect(
      nextStep(user({ isPhoneValidated: false, safeWallet: [] }), true)
    ).toBe('phone');
  });

  it('deploys the Safe once every prerequisite is met and none exists', () => {
    expect(nextStep(user({ safeWallet: [] }), true)).toBe('deploy');
  });

  it('is done when a Safe exists', () => {
    expect(nextStep(user(), true)).toBe('done');
  });

  it('does not skip ahead when several things are missing at once', () => {
    const incomplete = user({
      kycStatus: 'notStarted',
      isSourceOfFundsAnswered: false,
      isPhoneValidated: false,
      safeWallet: [],
    });
    expect(nextStep(incomplete, true)).toBe('kyc');
  });
});

describe('isKycTerminal', () => {
  it('is true only for the two states support must resolve', () => {
    expect(isKycTerminal('rejected')).toBe(true);
    expect(isKycTerminal('requiresAction')).toBe(true);
    expect(isKycTerminal('pending')).toBe(false);
    expect(isKycTerminal('approved')).toBe(false);
  });
});

describe('stepProgress', () => {
  it('numbers the visible steps from 1 and shares one total', () => {
    expect(stepProgress('signup')).toEqual({ index: 1, total: ONBOARDING_ORDER.length });
    expect(stepProgress('done')).toEqual({
      index: ONBOARDING_ORDER.length,
      total: ONBOARDING_ORDER.length,
    });
  });

  it('reports the waiting and blocked states at their KYC position', () => {
    expect(stepProgress('kyc_wait').index).toBe(stepProgress('kyc').index);
    expect(stepProgress('kyc_blocked').index).toBe(stepProgress('kyc').index);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-onboarding.test.ts
```

Expected: FAIL — cannot resolve `@/lib/gnosispay/onboarding`.

- [ ] **Step 3: Write the state machine**

Create `apps/expo/lib/gnosispay/onboarding.ts`:

```typescript
/**
 * Which onboarding screen comes next, as a pure function of the user Gnosis
 * Pay reports plus whether we have recorded terms acceptance.
 *
 * The order is not a UX preference — it is the API's prerequisite chain:
 * source-of-funds requires kycStatus 'approved', and POST /safe/deploy
 * returns 422 unless KYC, source-of-funds and phone are all done.
 */
import type { GpKycStatus, GpUser } from './types';

export type OnboardingStep =
  | 'signup'
  | 'terms'
  | 'kyc'
  | 'kyc_wait'
  | 'kyc_blocked'
  | 'source_of_funds'
  | 'phone'
  | 'deploy'
  | 'done';

/** The steps that occupy a slot in the progress rail, in order. */
export const ONBOARDING_ORDER: OnboardingStep[] = [
  'signup',
  'terms',
  'kyc',
  'source_of_funds',
  'phone',
  'deploy',
  'done',
];

/** Failure states no amount of retrying inside the app will clear. */
export function isKycTerminal(status: GpKycStatus): boolean {
  return status === 'rejected' || status === 'requiresAction';
}

export function nextStep(user: GpUser | null, termsAccepted: boolean): OnboardingStep {
  if (!user) return 'signup';
  if (!termsAccepted) return 'terms';

  if (isKycTerminal(user.kycStatus)) return 'kyc_blocked';
  if (user.kycStatus === 'pending' || user.kycStatus === 'processing') return 'kyc_wait';
  if (user.kycStatus !== 'approved') return 'kyc';

  if (!user.isSourceOfFundsAnswered) return 'source_of_funds';
  if (!user.isPhoneValidated) return 'phone';
  if (user.safeWallet.length === 0) return 'deploy';
  return 'done';
}

/** Position in the progress rail; the KYC sub-states share KYC's slot. */
export function stepProgress(step: OnboardingStep): { index: number; total: number } {
  const normalised: OnboardingStep =
    step === 'kyc_wait' || step === 'kyc_blocked' ? 'kyc' : step;
  const zeroBased = ONBOARDING_ORDER.indexOf(normalised);
  return {
    index: zeroBased < 0 ? 1 : zeroBased + 1,
    total: ONBOARDING_ORDER.length,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-onboarding.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/gnosispay/onboarding.ts apps/expo/lib/__tests__/gnosispay-onboarding.test.ts
git commit -m "feat(expo): Gnosis Pay onboarding state machine

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: SIWE authentication

**Files:**
- Create: `apps/expo/lib/gnosispay/auth.ts`
- Test: `apps/expo/lib/__tests__/gnosispay-auth.test.ts`

**Interfaces:**
- Consumes: `gpFetch`, `GP_API_URL` (Task 2); `SigningAccount` shape from `@/lib/org-membership` (structural, re-declared locally to avoid a dependency).
- Produces:
  - `function buildSiweMessage(params: { domain: string; address: string; nonce: string; issuedAt: string; uri: string; chainId?: number }): string`
  - `async function signIn(account: SigningAccount): Promise<GpResult<string>>` — returns the JWT
  - `async function getStoredToken(address: string): Promise<string | null>`
  - `async function storeToken(address: string, token: string, expiresAtMs: number): Promise<void>`
  - `async function clearToken(address: string): Promise<void>`
  - `const GP_SIWE_DOMAIN = 'app.roebel.app'`

The domain is the one registered in the partner dashboard. An unregistered domain fails CORS/SIWE server-side, so it is a constant, not a guess.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/gnosispay-auth.test.ts`:

```typescript
/**
 * SIWE against Gnosis Pay. The message must be EIP-4361 shaped and must name
 * the domain registered in the partner dashboard — an unregistered domain is
 * rejected server-side. The smart account signs it via ERC-1271, which the
 * vendor accepts ("EOAs and Smart Accounts (EIP-1271)").
 */
import { buildSiweMessage, GP_SIWE_DOMAIN } from '@/lib/gnosispay/auth';

describe('buildSiweMessage', () => {
  const params = {
    domain: GP_SIWE_DOMAIN,
    address: '0xAbC0000000000000000000000000000000000001',
    nonce: 'nonce-123',
    issuedAt: '2026-09-04T10:00:00.000Z',
    uri: 'https://app.roebel.app',
  };

  it('opens with the EIP-4361 domain line', () => {
    const message = buildSiweMessage(params);
    expect(message.split('\n')[0]).toBe(
      'app.roebel.app wants you to sign in with your Ethereum account:'
    );
  });

  it('puts the checksummed address on its own second line', () => {
    const message = buildSiweMessage(params);
    expect(message.split('\n')[1]).toBe(params.address);
  });

  it('defaults to Gnosis chain id 100', () => {
    expect(buildSiweMessage(params)).toContain('Chain ID: 100');
  });

  it('carries the nonce and issued-at verbatim', () => {
    const message = buildSiweMessage(params);
    expect(message).toContain('Nonce: nonce-123');
    expect(message).toContain('Issued At: 2026-09-04T10:00:00.000Z');
  });

  it('honours an explicit chain id when one is given', () => {
    expect(buildSiweMessage({ ...params, chainId: 1 })).toContain('Chain ID: 1');
  });

  it('is stable — the same inputs produce the same message', () => {
    expect(buildSiweMessage(params)).toBe(buildSiweMessage(params));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-auth.test.ts
```

Expected: FAIL — cannot resolve `@/lib/gnosispay/auth`.

- [ ] **Step 3: Write the auth module**

Create `apps/expo/lib/gnosispay/auth.ts`:

```typescript
/**
 * Sign-In with Ethereum against Gnosis Pay, plus JWT storage.
 *
 * The signer is the citizen's thirdweb Gnosis smart account. Gnosis Pay
 * verifies it through ERC-1271, which requires the account to be DEPLOYED on
 * Gnosis — a counterfactual account cannot sign in. Callers must ensure
 * deployment first (see ensureDeployed in the onboarding screen).
 *
 * The JWT lives in expo-secure-store, keyed by address, with the expiry we
 * requested. It is a bearer credential for one user; it is never logged.
 */
import * as SecureStore from 'expo-secure-store';
import { gpFetch } from './client';
import type { GpResult } from './types';

/** Registered in the Gnosis Pay partner dashboard. Must match exactly. */
export const GP_SIWE_DOMAIN = 'app.roebel.app';
const GP_SIWE_URI = 'https://app.roebel.app';

/** 24 h is the vendor maximum; we ask for it and refresh on 401. */
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

export interface SigningAccount {
  address: string;
  signMessage: (args: { message: string }) => Promise<string>;
}

export function buildSiweMessage(params: {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
  uri: string;
  chainId?: number;
}): string {
  const chainId = params.chainId ?? 100;
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    '',
    'Sign in to Gnosis Pay',
    '',
    `URI: ${params.uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
  ].join('\n');
}

function tokenKey(address: string): string {
  return `gp_jwt_${address.toLowerCase()}`;
}

export async function storeToken(
  address: string,
  token: string,
  expiresAtMs: number
): Promise<void> {
  await SecureStore.setItemAsync(
    tokenKey(address),
    JSON.stringify({ token, expiresAtMs })
  );
}

export async function getStoredToken(address: string): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(tokenKey(address));
  if (!raw) return null;
  try {
    const { token, expiresAtMs } = JSON.parse(raw) as {
      token: string;
      expiresAtMs: number;
    };
    // One minute of slack so a token does not expire mid-request.
    if (Date.now() > expiresAtMs - 60_000) return null;
    return token;
  } catch {
    return null;
  }
}

export async function clearToken(address: string): Promise<void> {
  await SecureStore.deleteItemAsync(tokenKey(address));
}

/**
 * Full SIWE round trip. Returns the JWT and stores it; callers that already
 * hold a valid token should call getStoredToken first.
 */
export async function signIn(account: SigningAccount): Promise<GpResult<string>> {
  const nonceResult = await gpFetch<{ nonce: string } | string>('/api/v1/auth/nonce');
  if (!nonceResult.ok) return nonceResult;

  const nonce =
    typeof nonceResult.data === 'string' ? nonceResult.data : nonceResult.data.nonce;

  const message = buildSiweMessage({
    domain: GP_SIWE_DOMAIN,
    address: account.address,
    nonce,
    issuedAt: new Date().toISOString(),
    uri: GP_SIWE_URI,
  });

  const signature = await account.signMessage({ message });

  const challenge = await gpFetch<{ token: string }>('/api/v1/auth/challenge', {
    method: 'POST',
    body: { message, signature, ttlInSeconds: TOKEN_TTL_SECONDS },
  });
  if (!challenge.ok) return challenge;

  const token = challenge.data.token;
  await storeToken(account.address, token, Date.now() + TOKEN_TTL_SECONDS * 1000);
  return { ok: true, data: token };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-auth.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/gnosispay/auth.ts apps/expo/lib/__tests__/gnosispay-auth.test.ts
git commit -m "feat(expo): Gnosis Pay SIWE auth + secure token storage

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: Typed API wrappers

**Files:**
- Create: `apps/expo/lib/gnosispay/api.ts`
- Test: `apps/expo/lib/__tests__/gnosispay-api.test.ts`

**Interfaces:**
- Consumes: `gpFetch`, `GP_PARTNER_ID` (Task 2); types from `./types`.
- Produces (all take the JWT as the last argument):
  - `getUser(token): Promise<GpResult<GpUser>>`
  - `signup(authEmail, token): Promise<GpResult<{ id: string }>>`
  - `getTerms(token): Promise<GpResult<GpTerms[]>>`
  - `acceptTerm(id, version, token): Promise<GpResult<unknown>>`
  - `getKycLink(token, lang?): Promise<GpResult<GpKycIntegration>>`
  - `getSourceOfFundsQuestions(token): Promise<GpResult<GpSourceOfFundsQuestion[]>>`
  - `submitSourceOfFunds(answers, token): Promise<GpResult<unknown>>`
  - `requestPhoneOtp(phoneNumber, token): Promise<GpResult<unknown>>`
  - `verifyPhoneOtp(code, token): Promise<GpResult<unknown>>`
  - `deploySafe(token, dailyAllowanceEur?): Promise<GpResult<{ status: string }>>`
  - `getSafeDeployStatus(token): Promise<GpResult<{ status: string }>>`
  - `getSafeConfig(token): Promise<GpResult<GpSafeConfig>>`
  - `const REQUIRED_TERMS = ['general-tos', 'card-monavate-tos', 'privacy-policy']`

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/gnosispay-api.test.ts`:

```typescript
/**
 * The API wrappers are deliberately thin: their job is to pin each endpoint's
 * path, method and body shape so no screen has to remember them. These tests
 * assert exactly that, against a stubbed gpFetch.
 */
import * as client from '@/lib/gnosispay/client';
import {
  signup,
  acceptTerm,
  submitSourceOfFunds,
  requestPhoneOtp,
  verifyPhoneOtp,
  deploySafe,
  REQUIRED_TERMS,
} from '@/lib/gnosispay/api';

jest.mock('@/lib/gnosispay/client', () => ({
  ...jest.requireActual('@/lib/gnosispay/client'),
  gpFetch: jest.fn(),
}));

const gpFetch = client.gpFetch as jest.Mock;

beforeEach(() => {
  gpFetch.mockReset();
  gpFetch.mockResolvedValue({ ok: true, data: {} });
});

describe('signup', () => {
  it('posts the email together with the partner id', async () => {
    await signup('wirt@roebel.de', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/auth/signup', {
      method: 'POST',
      token: 'jwt',
      body: { authEmail: 'wirt@roebel.de', partnerId: client.GP_PARTNER_ID },
    });
  });
});

describe('acceptTerm', () => {
  it('posts the term id and version', async () => {
    await acceptTerm('general-tos', '1.2', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/user/terms', {
      method: 'POST',
      token: 'jwt',
      body: { terms: 'general-tos', version: '1.2' },
    });
  });
});

describe('REQUIRED_TERMS', () => {
  it('names the three terms the flow must accept', () => {
    expect(REQUIRED_TERMS).toEqual([
      'general-tos',
      'card-monavate-tos',
      'privacy-policy',
    ]);
  });
});

describe('submitSourceOfFunds', () => {
  it('posts the answers as a question/answer array', async () => {
    await submitSourceOfFunds([{ question: 'Herkunft?', answer: 'Umsatz' }], 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/source-of-funds', {
      method: 'POST',
      token: 'jwt',
      body: { answers: [{ question: 'Herkunft?', answer: 'Umsatz' }] },
    });
  });
});

describe('phone verification', () => {
  it('requests an OTP for a phone number', async () => {
    await requestPhoneOtp('+4915112345678', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/verification', {
      method: 'POST',
      token: 'jwt',
      body: { phoneNumber: '+4915112345678' },
    });
  });

  it('checks the code on the check endpoint', async () => {
    await verifyPhoneOtp('123456', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/verification/check', {
      method: 'POST',
      token: 'jwt',
      body: { code: '123456' },
    });
  });
});

describe('deploySafe', () => {
  it('posts without a body when no allowance is given', async () => {
    await deploySafe('jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/safe/deploy', {
      method: 'POST',
      token: 'jwt',
      body: {},
    });
  });

  it('passes a daily allowance in whole token units when given', async () => {
    await deploySafe('jwt', 350);
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/safe/deploy', {
      method: 'POST',
      token: 'jwt',
      body: { dailyAllowance: 350 },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-api.test.ts
```

Expected: FAIL — cannot resolve `@/lib/gnosispay/api`.

- [ ] **Step 3: Write the wrappers**

Create `apps/expo/lib/gnosispay/api.ts`:

```typescript
/**
 * One typed function per Gnosis Pay endpoint this app uses. Paths, methods and
 * body shapes live here and nowhere else, so a vendor change is a one-file fix.
 *
 * Sequence (each step's prerequisite is the previous one):
 *   signup → terms → KYC → source-of-funds → phone OTP → safe deploy
 */
import { gpFetch, GP_PARTNER_ID } from './client';
import type {
  GpKycIntegration,
  GpResult,
  GpSafeConfig,
  GpSourceOfFundsQuestion,
  GpTerms,
  GpUser,
} from './types';

/** The three agreements a merchant must accept before KYC. */
export const REQUIRED_TERMS = [
  'general-tos',
  'card-monavate-tos',
  'privacy-policy',
] as const;

export function getUser(token: string): Promise<GpResult<GpUser>> {
  return gpFetch<GpUser>('/api/v1/user', { token });
}

export function signup(authEmail: string, token: string): Promise<GpResult<{ id: string }>> {
  return gpFetch<{ id: string }>('/api/v1/auth/signup', {
    method: 'POST',
    token,
    body: { authEmail, partnerId: GP_PARTNER_ID },
  });
}

export function getTerms(token: string): Promise<GpResult<GpTerms[]>> {
  return gpFetch<GpTerms[]>('/api/v1/user/terms', { token });
}

export function acceptTerm(
  id: string,
  version: string,
  token: string
): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/user/terms', {
    method: 'POST',
    token,
    body: { terms: id, version },
  });
}

/** Hosted Sumsub flow — opened in an in-app browser, so this ships over OTA. */
export function getKycLink(token: string, lang = 'de'): Promise<GpResult<GpKycIntegration>> {
  return gpFetch<GpKycIntegration>(`/api/v1/kyc/integration?lang=${lang}`, { token });
}

export function getSourceOfFundsQuestions(
  token: string
): Promise<GpResult<GpSourceOfFundsQuestion[]>> {
  return gpFetch<GpSourceOfFundsQuestion[]>('/api/v1/source-of-funds', { token });
}

export function submitSourceOfFunds(
  answers: { question: string; answer: string }[],
  token: string
): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/source-of-funds', {
    method: 'POST',
    token,
    body: { answers },
  });
}

export function requestPhoneOtp(
  phoneNumber: string,
  token: string
): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/verification', {
    method: 'POST',
    token,
    body: { phoneNumber },
  });
}

export function verifyPhoneOtp(code: string, token: string): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/verification/check', {
    method: 'POST',
    token,
    body: { code },
  });
}

/** Idempotent: re-posting while a deployment runs returns 202 without restarting it. */
export function deploySafe(
  token: string,
  dailyAllowanceEur?: number
): Promise<GpResult<{ status: string }>> {
  return gpFetch<{ status: string }>('/api/v1/safe/deploy', {
    method: 'POST',
    token,
    body: dailyAllowanceEur === undefined ? {} : { dailyAllowance: dailyAllowanceEur },
  });
}

/** Statuses: processing | ok | failed | not_deployed. */
export function getSafeDeployStatus(token: string): Promise<GpResult<{ status: string }>> {
  return gpFetch<{ status: string }>('/api/v1/safe/deploy', { token });
}

/** accountStatus === 0 means fully configured and ready. */
export function getSafeConfig(token: string): Promise<GpResult<GpSafeConfig>> {
  return gpFetch<GpSafeConfig>('/api/v1/safe-config', { token });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/gnosispay-api.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/gnosispay/api.ts apps/expo/lib/__tests__/gnosispay-api.test.ts
git commit -m "feat(expo): typed Gnosis Pay API wrappers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: Webhook receiver edge function

**Files:**
- Create: `apps/expo/supabase/functions/gnosispay-webhook/index.ts`
- Deploy via: Supabase MCP `deploy_edge_function`

**Interfaces:**
- Consumes: tables from Task 1.
- Produces: a public HTTPS endpoint at `https://wwbeqhkslxdxhktqzqti.supabase.co/functions/v1/gnosispay-webhook`, already registered in the partner dashboard.

Gnosis Pay signs with Ed25519 over `${timestamp}.${body}`, retries non-2xx three times (1/5/15 min) and times out at 30 s. There is no inbound-transfer event — that is the indexer's job in slice 1b.

- [ ] **Step 1: Write the function**

Create `apps/expo/supabase/functions/gnosispay-webhook/index.ts`:

```typescript
// Edge Function: gnosispay-webhook
//
// Receives partner events from Gnosis Pay and advances the merchant registry
// so the app never has to poll KYC. Registered in the partner dashboard at
// https://partners.gnosispay.com → Integrations → Webhooks.
//
// Events handled:
//   user.created         → bind gp_user_id
//   kyc.status.changed   → pending_kyc → kyc_approved
//   card.transaction.created → stored raw for slice 3; no behaviour yet
//
// There is NO inbound-transfer event. Payment detection is the EURe log
// indexer (slice 1b), not this function.
//
// Verification: Ed25519 over `${X-Webhook-Timestamp}.${rawBody}`, public key
// from webhooks.gnosispay.com. Signature failures are 401 with no state
// change. A stale timestamp (>5 min) is refused to blunt replay.
//
// Auto env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const PUBLIC_KEY_URL = "https://webhooks.gnosispay.com/api/v1/public-key";
const MAX_SKEW_MS = 5 * 60 * 1000;

let cachedKey: { key: CryptoKey; fetchedAt: number } | null = null;

async function getPublicKey(): Promise<CryptoKey | null> {
  if (cachedKey && Date.now() - cachedKey.fetchedAt < 60 * 60 * 1000) {
    return cachedKey.key;
  }
  try {
    const response = await fetch(PUBLIC_KEY_URL);
    if (!response.ok) return null;
    const payload = await response.json();
    const raw = typeof payload === "string" ? payload : payload.publicKey ?? payload.key;
    if (typeof raw !== "string") return null;

    const key = await crypto.subtle.importKey(
      "raw",
      decodeBase64(raw),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    cachedKey = { key, fetchedAt: Date.now() };
    return key;
  } catch (error) {
    console.error("gnosispay-webhook: public key fetch failed", error);
    return null;
  }
}

async function verify(
  rawBody: string,
  timestamp: string,
  signature: string,
): Promise<boolean> {
  const key = await getPublicKey();
  if (!key) return false;
  try {
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      decodeBase64(signature),
      new TextEncoder().encode(`${timestamp}.${rawBody}`),
    );
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const timestamp = request.headers.get("X-Webhook-Timestamp") ?? "";
  const signature = request.headers.get("X-Webhook-Signature") ?? "";
  const rawBody = await request.text();

  if (!timestamp || !signature) {
    return new Response(JSON.stringify({ error: "missing signature headers" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS) {
    return new Response(JSON.stringify({ error: "stale timestamp" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!(await verify(rawBody, timestamp, signature))) {
    return new Response(JSON.stringify({ error: "bad signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    // Malformed but signed: acknowledge so it is not retried forever.
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const data = event.data ?? {};
  const userId = (data.userId ?? data.id) as string | undefined;

  try {
    if (event.type === "kyc.status.changed" && userId) {
      const status = String(data.status ?? "");
      if (status === "approved") {
        await supabase
          .from("merchant_payment_accounts")
          .update({ status: "kyc_approved", updated_at: new Date().toISOString() })
          .eq("gp_user_id", userId)
          .eq("status", "pending_kyc");
      }
    }
    // user.created and card.transaction.created carry no slice-1a behaviour.
    // The app binds gp_user_id directly after signup; card transactions are
    // slice 3's concern.
  } catch (error) {
    console.error("gnosispay-webhook: update failed", error);
    // 500 so Gnosis Pay retries — the event is worth redelivering.
    return new Response(JSON.stringify({ error: "update failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Deploy the function**

Call `mcp__supabase__deploy_edge_function` with `name: "gnosispay-webhook"`, the file above as its entrypoint, and `verify_jwt: false` — Gnosis Pay does not send a Supabase JWT, and the Ed25519 signature is the real authentication.

- [ ] **Step 3: Verify it rejects an unsigned request**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://wwbeqhkslxdxhktqzqti.supabase.co/functions/v1/gnosispay-webhook \
  -H 'Content-Type: application/json' -d '{"type":"kyc.status.changed"}'
```

Expected: `401`. A `404` means the deploy did not land; a `401` from Supabase's own gateway rather than the function means `verify_jwt` was left on — redeploy with it false.

- [ ] **Step 4: Check the logs are clean**

Call `mcp__supabase__get_logs` with `service: "edge-function"`. Expected: the 401 above, no unhandled exceptions.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/supabase/functions/gnosispay-webhook/index.ts
git commit -m "feat(supabase): Gnosis Pay webhook receiver (Ed25519-verified)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: Merchant registry client

**Files:**
- Create: `apps/expo/lib/merchant/types.ts`
- Create: `apps/expo/lib/merchant/registry.ts`
- Create: `apps/expo/supabase/functions/merchant-registry/index.ts`
- Test: `apps/expo/lib/__tests__/merchant-registry.test.ts`
- Deploy via: Supabase MCP `deploy_edge_function`

**Interfaces:**
- Consumes: Task 1 tables; the `SigningAccount` shape and signed-request pattern from `@/lib/org-membership` (`roebel-org-v1:` message format — this module uses its own `roebel-merchant-v1:` prefix).
- Produces:
  - `interface MerchantPaymentAccount { id: string; gpUserId: string | null; safeAddress: string | null; status: MerchantAccountStatus; token: string; chainId: number }`
  - `type MerchantAccountStatus = 'pending_kyc' | 'kyc_approved' | 'deploying' | 'live' | 'suspended'`
  - `type MerchantEntityType = 'business' | 'restaurant' | 'account'`
  - `async function fetchMerchantAccount(wallet: string): Promise<MerchantPaymentAccount | null>`
  - `async function fetchAcceptanceSet(): Promise<Set<string>>` — keys are `` `${entityType}:${entityId}` ``
  - `function acceptanceKey(entityType: MerchantEntityType, entityId: string): string`
  - `async function upsertMerchantAccount(account, params): Promise<MerchantRegistryResponse>`
  - `async function linkEntity(account, params): Promise<MerchantRegistryResponse>`

RLS denies all client writes (Task 1), so writes go through a signed edge function exactly like `org-membership`.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/merchant-registry.test.ts`:

```typescript
/**
 * The registry's pure parts: the acceptance-key format the map joins on, and
 * the signed request body the edge function verifies. Network calls are not
 * exercised here — the edge function has its own curl check.
 */
import {
  acceptanceKey,
  buildMerchantRequestBody,
} from '@/lib/merchant/registry';

describe('acceptanceKey', () => {
  it('joins type and id with a colon', () => {
    expect(acceptanceKey('business', 'b-1')).toBe('business:b-1');
    expect(acceptanceKey('restaurant', 'r-1')).toBe('restaurant:r-1');
    expect(acceptanceKey('account', 'a-1')).toBe('account:a-1');
  });

  it('lower-cases the id so lookups are case-insensitive', () => {
    expect(acceptanceKey('business', 'B-1')).toBe('business:b-1');
  });
});

describe('buildMerchantRequestBody', () => {
  const account = {
    address: '0xAbC0000000000000000000000000000000000001',
    signMessage: jest.fn().mockResolvedValue('0xsig'),
  };

  beforeEach(() => account.signMessage.mockClear());

  it('lower-cases the wallet and carries action, timestamp and signature', async () => {
    const body = await buildMerchantRequestBody(
      account,
      'upsert_account',
      { gpUserId: 'u1' },
      1_757_000_000
    );

    expect(body.wallet).toBe('0xabc0000000000000000000000000000000000001');
    expect(body.action).toBe('upsert_account');
    expect(body.timestampSec).toBe(1_757_000_000);
    expect(body.signature).toBe('0xsig');
    expect(body.payload).toEqual({ gpUserId: 'u1' });
  });

  it('signs a versioned message naming the action and wallet', async () => {
    await buildMerchantRequestBody(account, 'link_entity', { entityId: 'b-1' }, 1_757_000_000);

    const [{ message }] = account.signMessage.mock.calls[0];
    expect(message).toContain('roebel-merchant-v1:link_entity:');
    expect(message).toContain('0xabc0000000000000000000000000000000000001');
    expect(message).toContain('1757000000');
  });

  it('produces the same signed message for the same inputs', async () => {
    await buildMerchantRequestBody(account, 'upsert_account', { a: 1, b: 2 }, 1_757_000_000);
    const first = account.signMessage.mock.calls[0][0].message;
    account.signMessage.mockClear();

    // Key order must not matter — the payload is hashed after sorting.
    await buildMerchantRequestBody(account, 'upsert_account', { b: 2, a: 1 }, 1_757_000_000);
    const second = account.signMessage.mock.calls[0][0].message;

    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/merchant-registry.test.ts
```

Expected: FAIL — cannot resolve `@/lib/merchant/registry`.

- [ ] **Step 3: Write the types**

Create `apps/expo/lib/merchant/types.ts`:

```typescript
/** Merchant stablecoin-acceptance registry types (spec 2026-09-04). */

export type MerchantAccountStatus =
  | 'pending_kyc'
  | 'kyc_approved'
  | 'deploying'
  | 'live'
  | 'suspended';

/** A Konto can back a business, a restaurant or an org account — all map pins. */
export type MerchantEntityType = 'business' | 'restaurant' | 'account';

export interface MerchantPaymentAccount {
  id: string;
  gpUserId: string | null;
  /** The Gnosis Pay Safe — the receive address. Null until deployed. */
  safeAddress: string | null;
  status: MerchantAccountStatus;
  token: string;
  chainId: number;
}

export interface MerchantRegistryResponse {
  ok: boolean;
  code?: string;
  message?: string;
}
```

- [ ] **Step 4: Write the registry client**

Create `apps/expo/lib/merchant/registry.ts`:

```typescript
/**
 * Reads and writes for the merchant acceptance registry.
 *
 * Reads go straight to Postgres: the public view exposes only entity ids, and
 * a security-definer function returns one owner's own account by wallet.
 * Writes cannot — RLS denies every client write — so they are signed with the
 * owner's smart account and posted to the merchant-registry edge function,
 * mirroring lib/org-membership.ts.
 */
import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { supabase } from '../supabase';
import type {
  MerchantAccountStatus,
  MerchantEntityType,
  MerchantPaymentAccount,
  MerchantRegistryResponse,
} from './types';

export type MerchantAction = 'upsert_account' | 'link_entity';

export interface SigningAccount {
  address: string;
  signMessage: (args: { message: string }) => Promise<string>;
}

export interface MerchantRequestBody {
  action: MerchantAction;
  wallet: string;
  timestampSec: number;
  payload: Record<string, unknown>;
  signature: string;
}

/** Stable key for joining map rows against the acceptance list. */
export function acceptanceKey(entityType: MerchantEntityType, entityId: string): string {
  return `${entityType}:${entityId.toLowerCase()}`;
}

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(sorted));
}

export async function buildMerchantRequestBody(
  account: SigningAccount,
  action: MerchantAction,
  payload: Record<string, unknown>,
  timestampSec: number = Math.floor(Date.now() / 1000)
): Promise<MerchantRequestBody> {
  const wallet = account.address.toLowerCase();
  const message = `roebel-merchant-v1:${action}:${wallet}:${timestampSec}:${await hashPayload(payload)}`;
  const signature = await account.signMessage({ message });
  return { action, wallet, timestampSec, payload, signature };
}

type Extra = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
const SUPABASE_URL = extra.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  extra.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function postSigned(
  account: SigningAccount,
  action: MerchantAction,
  payload: Record<string, unknown>
): Promise<MerchantRegistryResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'Supabase nicht konfiguriert' };
  }
  try {
    const body = await buildMerchantRequestBody(account, action, payload);
    const response = await fetch(`${SUPABASE_URL}/functions/v1/merchant-registry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as MerchantRegistryResponse;
  } catch (error) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Netzwerkfehler',
    };
  }
}

export function upsertMerchantAccount(
  account: SigningAccount,
  params: {
    gpUserId?: string | null;
    safeAddress?: string | null;
    status?: MerchantAccountStatus;
  }
): Promise<MerchantRegistryResponse> {
  return postSigned(account, 'upsert_account', params as Record<string, unknown>);
}

export function linkEntity(
  account: SigningAccount,
  params: { entityType: MerchantEntityType; entityId: string }
): Promise<MerchantRegistryResponse> {
  return postSigned(account, 'link_entity', params as Record<string, unknown>);
}

/** The owner's own Konto, via the security-definer function. */
export async function fetchMerchantAccount(
  wallet: string
): Promise<MerchantPaymentAccount | null> {
  const { data, error } = await supabase.rpc('merchant_account_for_wallet', {
    p_wallet: wallet.toLowerCase(),
  });
  if (error) {
    console.error('fetchMerchantAccount error:', error);
    return null;
  }
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return null;
  return {
    id: String(row.id),
    gpUserId: (row.gp_user_id as string | null) ?? null,
    safeAddress: (row.gp_safe_address as string | null) ?? null,
    status: row.status as MerchantAccountStatus,
    token: String(row.token ?? 'EURe'),
    chainId: Number(row.chain_id ?? 100),
  };
}

/** Every live acceptance point, as `${entityType}:${entityId}` keys. */
export async function fetchAcceptanceSet(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('merchant_acceptance_public')
    .select('entity_type, entity_id');
  if (error) {
    console.error('fetchAcceptanceSet error:', error);
    return new Set();
  }
  const rows = (data ?? []) as { entity_type: MerchantEntityType; entity_id: string }[];
  return new Set(rows.map((r) => acceptanceKey(r.entity_type, r.entity_id)));
}
```

- [ ] **Step 5: Write the edge function**

Create `apps/expo/supabase/functions/merchant-registry/index.ts`:

```typescript
// Edge Function: merchant-registry
//
// The only write path into merchant_payment_accounts / merchant_entities.
// Those tables have deny-all RLS policies, so the anon key cannot touch them.
//
// Authentication mirrors org-membership: the caller signs
//   roebel-merchant-v1:<action>:<wallet>:<timestampSec>:<sha256(sorted payload)>
// with their thirdweb Gnosis smart account. Because that account is an
// ERC-4337 contract with no key of its own, the signature is verified via
// ERC-1271 isValidSignature on Gnosis — not ecrecover.
//
// Actions:
//   upsert_account — create/update the caller's own Konto row
//   link_entity    — attach a business/restaurant/account the caller owns
//
// Auto env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: GNOSIS_RPC_URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createPublicClient,
  hashMessage,
  http,
} from "https://esm.sh/viem@2.21.0";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";

const MAX_SKEW_SEC = 300;

const publicClient = createPublicClient({
  chain: gnosis,
  transport: http(Deno.env.get("GNOSIS_RPC_URL") ?? "https://rpc.gnosischain.com"),
});

const ERC1271_ABI = [
  {
    name: "isValidSignature",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "magicValue", type: "bytes4" }],
  },
] as const;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(
  wallet: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: wallet as `0x${string}`,
      abi: ERC1271_ABI,
      functionName: "isValidSignature",
      args: [hashMessage(message), signature as `0x${string}`],
    });
    return String(result).toLowerCase().startsWith("0x1626ba7e");
  } catch (error) {
    console.error("merchant-registry: ERC-1271 verify failed", error);
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, code: "METHOD" }, 405);

  let body: {
    action?: string;
    wallet?: string;
    timestampSec?: number;
    payload?: Record<string, unknown>;
    signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: "BAD_JSON" }, 400);
  }

  const { action, wallet, timestampSec, payload, signature } = body;
  if (!action || !wallet || !timestampSec || !payload || !signature) {
    return json({ ok: false, code: "MISSING_FIELDS" }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > MAX_SKEW_SEC) {
    return json({ ok: false, code: "STALE_REQUEST" }, 401);
  }

  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const message =
    `roebel-merchant-v1:${action}:${wallet.toLowerCase()}:${timestampSec}:` +
    `${await sha256Hex(JSON.stringify(sorted))}`;

  if (!(await verifySignature(wallet, message, signature))) {
    return json({ ok: false, code: "BAD_SIGNATURE" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const owner = wallet.toLowerCase();

  if (action === "upsert_account") {
    const update: Record<string, unknown> = {
      owner_wallet: owner,
      updated_at: new Date().toISOString(),
    };
    if (payload.gpUserId !== undefined) update.gp_user_id = payload.gpUserId;
    if (payload.safeAddress !== undefined) {
      update.gp_safe_address =
        typeof payload.safeAddress === "string" ? payload.safeAddress.toLowerCase() : null;
    }
    if (payload.status !== undefined) update.status = payload.status;

    const { error } = await supabase
      .from("merchant_payment_accounts")
      .upsert(update, { onConflict: "owner_wallet" });
    if (error) {
      console.error("merchant-registry: upsert failed", error);
      return json({ ok: false, code: "DB_ERROR", message: error.message }, 500);
    }
    return json({ ok: true });
  }

  if (action === "link_entity") {
    const entityType = String(payload.entityType ?? "");
    const entityId = String(payload.entityId ?? "");
    if (!["business", "restaurant", "account"].includes(entityType) || !entityId) {
      return json({ ok: false, code: "BAD_ENTITY" }, 400);
    }

    const { data: account, error: accountError } = await supabase
      .from("merchant_payment_accounts")
      .select("id")
      .eq("owner_wallet", owner)
      .maybeSingle();
    if (accountError || !account) {
      return json({ ok: false, code: "NO_ACCOUNT" }, 404);
    }

    // Ownership check: the caller must own the row they are linking.
    const table = entityType === "account" ? "accounts" : `${entityType}s`;
    const ownerColumn =
      entityType === "account" ? "owner_wallet_address" : "owner_wallet_address";
    const { data: entity, error: entityError } = await supabase
      .from(table)
      .select("id")
      .eq("id", entityId)
      .ilike(ownerColumn, owner)
      .maybeSingle();
    if (entityError || !entity) {
      return json({ ok: false, code: "NOT_OWNER" }, 403);
    }

    const { error } = await supabase
      .from("merchant_entities")
      .upsert(
        { account_id: account.id, entity_type: entityType, entity_id: entityId },
        { onConflict: "entity_type,entity_id" },
      );
    if (error) {
      console.error("merchant-registry: link failed", error);
      return json({ ok: false, code: "DB_ERROR", message: error.message }, 500);
    }
    return json({ ok: true });
  }

  return json({ ok: false, code: "UNKNOWN_ACTION" }, 400);
});
```

- [ ] **Step 6: Confirm the ownership column name before deploying**

Call `mcp__supabase__list_tables` with `schemas: ["public"]`, `verbose: true`. Find `accounts`, `businesses` and `restaurants` and confirm each has `owner_wallet_address`. `businesses` does (`BusinessRecord.owner_wallet_address`). If `accounts` or `restaurants` names it differently, fix `ownerColumn` before deploying — a wrong column silently returns `NOT_OWNER` for everyone.

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/merchant-registry.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 8: Deploy and smoke-test the edge function**

Call `mcp__supabase__deploy_edge_function` with `name: "merchant-registry"` and `verify_jwt: false` (the anon-key bearer plus the ERC-1271 signature is the authentication).

```bash
curl -s -X POST https://wwbeqhkslxdxhktqzqti.supabase.co/functions/v1/merchant-registry \
  -H 'Content-Type: application/json' -d '{"action":"upsert_account"}'
```

Expected: `{"ok":false,"code":"MISSING_FIELDS"}`.

- [ ] **Step 9: Commit**

```bash
git add apps/expo/lib/merchant/types.ts apps/expo/lib/merchant/registry.ts \
        apps/expo/lib/__tests__/merchant-registry.test.ts \
        apps/expo/supabase/functions/merchant-registry/index.ts
git commit -m "feat(expo): merchant registry client + signed write edge function

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 8: Kill switch

**Files:**
- Modify: `apps/expo/lib/supabase-app-settings.ts` (append at end of file)
- Test: `apps/expo/lib/__tests__/stablecoin-gate.test.ts`

**Interfaces:**
- Consumes: the existing private `fetchAppSetting` in that file.
- Produces: `async function isStablecoinPaymentsEnabled(opts?: { walletAddress?: string | null }): Promise<boolean>`

Same three-mode shape as `isDeliberateDebatesEnabled`: dev always on, `'true'` for everyone, otherwise a comma-separated wallet allowlist. Missing or `'false'` means off — this is a new pilot surface, so the default is OFF.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/stablecoin-gate.test.ts`:

```typescript
/**
 * The stablecoin-payments pilot gate. New surface, so a missing key means OFF
 * — the opposite default from the XMTP kill switch, which guards a feature
 * that already shipped.
 */
import { supabase } from '@/lib/supabase';
import { isStablecoinPaymentsEnabled } from '@/lib/supabase-app-settings';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

function stubSetting(value: string | null) {
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: value === null ? null : { value }, error: null }),
      }),
    }),
  });
}

const originalDev = (global as { __DEV__?: boolean }).__DEV__;

beforeEach(() => {
  (global as { __DEV__?: boolean }).__DEV__ = false;
  (supabase.from as jest.Mock).mockReset();
});

afterAll(() => {
  (global as { __DEV__?: boolean }).__DEV__ = originalDev;
});

describe('isStablecoinPaymentsEnabled', () => {
  it('is off when the key is unset', async () => {
    stubSetting(null);
    await expect(isStablecoinPaymentsEnabled()).resolves.toBe(false);
  });

  it('is off when the key is explicitly false', async () => {
    stubSetting('false');
    await expect(isStablecoinPaymentsEnabled()).resolves.toBe(false);
  });

  it('is on for everyone when the key is true', async () => {
    stubSetting('true');
    await expect(isStablecoinPaymentsEnabled()).resolves.toBe(true);
  });

  it('treats any other value as a wallet allowlist', async () => {
    stubSetting('0xAAA,0xBBB');
    await expect(
      isStablecoinPaymentsEnabled({ walletAddress: '0xaaa' })
    ).resolves.toBe(true);
    await expect(
      isStablecoinPaymentsEnabled({ walletAddress: '0xccc' })
    ).resolves.toBe(false);
  });

  it('is off for an allowlist when no wallet is known', async () => {
    stubSetting('0xAAA');
    await expect(isStablecoinPaymentsEnabled()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/stablecoin-gate.test.ts
```

Expected: FAIL — `isStablecoinPaymentsEnabled` is not exported.

- [ ] **Step 3: Append the gate**

Add to the end of `apps/expo/lib/supabase-app-settings.ts`:

```typescript
/**
 * Pilot gate for merchant stablecoin payments (Gnosis Pay Konto + acceptance
 * map). A NEW surface, so a missing key means OFF: only an explicit 'true'
 * opens it to everyone, and any other non-empty value is read as a
 * comma-separated wallet allowlist. Dev builds always see it.
 */
export async function isStablecoinPaymentsEnabled(opts?: {
  walletAddress?: string | null;
}): Promise<boolean> {
  if (__DEV__) return true;
  const value = await fetchAppSetting('stablecoin_payments_enabled');
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (!opts?.walletAddress) return false;
  return value.toLowerCase().split(',').includes(opts.walletAddress.toLowerCase());
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/stablecoin-gate.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Seed the key as off**

Call `mcp__supabase__execute_sql`:

```sql
insert into app_settings (key, value)
values ('stablecoin_payments_enabled', 'false')
on conflict (key) do nothing;
```

- [ ] **Step 6: Commit**

```bash
git add apps/expo/lib/supabase-app-settings.ts apps/expo/lib/__tests__/stablecoin-gate.test.ts
git commit -m "feat(expo): stablecoin payments pilot gate

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 9: Map acceptance badge

**Files:**
- Modify: `apps/expo/lib/map/filters.ts`
- Create: `apps/expo/lib/map/acceptance.ts`
- Test: `apps/expo/lib/__tests__/map-acceptance.test.ts`

**Interfaces:**
- Consumes: `acceptanceKey`, `fetchAcceptanceSet`, `MerchantEntityType` (Task 7).
- Produces:
  - `MapFilterState` gains `acceptsStablecoin: boolean`
  - `function filterByAcceptance<T extends { id: string }>(items: T[], entityType: MerchantEntityType, acceptance: Set<string>, enabled: boolean): T[]`
  - `function acceptsStablecoin(entityType: MerchantEntityType, id: string, acceptance: Set<string>): boolean`

Mirrors `filterOpenNow` in the same directory: a pure filter that takes the toggle as its last argument and returns the input untouched when disabled.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/map-acceptance.test.ts`:

```typescript
/**
 * The "Stablecoin" map filter. Same shape as filterOpenNow: pure, takes the
 * toggle explicitly, and is a no-op when the toggle is off.
 */
import { acceptsStablecoin, filterByAcceptance } from '@/lib/map/acceptance';
import { acceptanceKey } from '@/lib/merchant/registry';

const acceptance = new Set([
  acceptanceKey('business', 'b-1'),
  acceptanceKey('restaurant', 'r-9'),
]);

describe('acceptsStablecoin', () => {
  it('is true for a listed entity', () => {
    expect(acceptsStablecoin('business', 'b-1', acceptance)).toBe(true);
    expect(acceptsStablecoin('restaurant', 'r-9', acceptance)).toBe(true);
  });

  it('is false for an unlisted entity', () => {
    expect(acceptsStablecoin('business', 'b-2', acceptance)).toBe(false);
  });

  it('does not confuse types that share an id', () => {
    expect(acceptsStablecoin('restaurant', 'b-1', acceptance)).toBe(false);
  });

  it('ignores id casing', () => {
    expect(acceptsStablecoin('business', 'B-1', acceptance)).toBe(true);
  });
});

describe('filterByAcceptance', () => {
  const items = [{ id: 'b-1' }, { id: 'b-2' }, { id: 'b-3' }];

  it('returns everything untouched when the filter is off', () => {
    expect(filterByAcceptance(items, 'business', acceptance, false)).toBe(items);
  });

  it('keeps only accepting places when the filter is on', () => {
    expect(filterByAcceptance(items, 'business', acceptance, true)).toEqual([{ id: 'b-1' }]);
  });

  it('returns an empty list when nothing accepts', () => {
    expect(filterByAcceptance(items, 'business', new Set(), true)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/map-acceptance.test.ts
```

Expected: FAIL — cannot resolve `@/lib/map/acceptance`.

- [ ] **Step 3: Add the filter flag**

In `apps/expo/lib/map/filters.ts`, extend the type:

```typescript
export type MapFilterState = {
  events: boolean;
  restaurants: boolean;
  businesses: boolean;
  orgs: boolean;
  pois: boolean;
  openNow: boolean;
  /** "Stablecoin" chip — keeps only places with a live merchant Konto. */
  acceptsStablecoin: boolean;
};
```

- [ ] **Step 4: Write the acceptance helpers**

Create `apps/expo/lib/map/acceptance.ts`:

```typescript
/**
 * The "Stablecoin" map layer: which pins accept euro-stablecoin payments.
 *
 * The acceptance set is fetched once per map session from the public view
 * (see lib/merchant/registry.ts) and passed in, so these helpers stay pure and
 * testable — the same shape as filterOpenNow in ./filters.
 */
import { acceptanceKey } from '../merchant/registry';
import type { MerchantEntityType } from '../merchant/types';

export function acceptsStablecoin(
  entityType: MerchantEntityType,
  id: string,
  acceptance: Set<string>
): boolean {
  return acceptance.has(acceptanceKey(entityType, id));
}

/** No-op when the chip is off, so callers can apply it unconditionally. */
export function filterByAcceptance<T extends { id: string }>(
  items: T[],
  entityType: MerchantEntityType,
  acceptance: Set<string>,
  enabled: boolean
): T[] {
  if (!enabled) return items;
  return items.filter((item) => acceptsStablecoin(entityType, item.id, acceptance));
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/map-acceptance.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Fix every MapFilterState literal the new field broke**

```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -i "acceptsStablecoin\|MapFilterState"
```

Add `acceptsStablecoin: false` to each object literal the compiler names (initial filter state in the map screen, any test fixture, `MAP_CATEGORIES` entries in `lib/map/categories.ts` use `Partial<MapFilterState>` so they need no change). Re-run until this grep is empty.

- [ ] **Step 7: Run the whole map test suite for regressions**

```bash
cd apps/expo && npx jest lib/__tests__/map-
```

Expected: all map suites pass (`map-categories`, `map-filters`, `map-geojson`, `map-markers`, `map-org-lookup`, `map-acceptance`).

- [ ] **Step 8: Commit**

```bash
git add apps/expo/lib/map/acceptance.ts apps/expo/lib/map/filters.ts \
        apps/expo/lib/__tests__/map-acceptance.test.ts
git commit -m "feat(expo): stablecoin acceptance map filter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 10: Onboarding wizard screen

**Files:**
- Create: `apps/expo/app/(payments)/_layout.tsx`
- Create: `apps/expo/app/(payments)/components/OnboardingStep.tsx`
- Create: `apps/expo/app/(payments)/onboarding.tsx`
- Modify: `apps/expo/app/business/[slug].tsx` (add the entry point)

**Interfaces:**
- Consumes: everything from Tasks 2–9.
- Produces: route `/(payments)/onboarding?entityType=business&entityId=<uuid>`.

No new unit tests: this is composition over already-tested units. It is verified on device (Task 11).

- [ ] **Step 1: Write the stack layout**

Create `apps/expo/app/(payments)/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function PaymentsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: 'PlusJakartaSans_600SemiBold' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="onboarding" options={{ title: 'Stablecoin-Zahlungen' }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Write the shared step chrome**

Create `apps/expo/app/(payments)/components/OnboardingStep.tsx`:

```typescript
/**
 * Shared chrome for every onboarding step: a progress rail, a title, body
 * content and exactly ONE primary action. The single-action rule is the
 * Uber-Eats bar from the spec — a step that needs two buttons is two steps.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  stepIndex: number;
  stepTotal: number;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  children?: React.ReactNode;
};

export function OnboardingStep({
  stepIndex,
  stepTotal,
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled,
  busy,
  error,
  children,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.rail}>
        {Array.from({ length: stepTotal }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.railSegment,
              {
                backgroundColor: index < stepIndex ? colors.primary : colors.border,
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.step, { color: colors.textSecondary }]}>
        Schritt {stepIndex} von {stepTotal}
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text> : null}

      <View style={styles.content}>{children}</View>

      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          disabled={actionDisabled || busy}
          style={[
            styles.action,
            {
              backgroundColor: actionDisabled || busy ? colors.border : colors.primary,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.actionLabel}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  rail: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  railSegment: { flex: 1, height: 4, borderRadius: 2 },
  step: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  title: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 24, lineHeight: 30 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  content: { flex: 1, gap: 12 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  action: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
```

- [ ] **Step 3: Write the wizard**

Create `apps/expo/app/(payments)/onboarding.tsx`:

```typescript
/**
 * The merchant onboarding wizard. Drives the fixed Gnosis Pay sequence and
 * writes the resulting Safe into the merchant registry, at which point the
 * business appears on the map.
 *
 * The step order is decided by lib/gnosispay/onboarding.nextStep — this screen
 * only renders whatever it is told and reports results back.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { OnboardingStep } from './components/OnboardingStep';
import { getStoredToken, signIn } from '@/lib/gnosispay/auth';
import {
  REQUIRED_TERMS,
  acceptTerm,
  deploySafe,
  getKycLink,
  getSafeConfig,
  getSafeDeployStatus,
  getSourceOfFundsQuestions,
  getTerms,
  getUser,
  requestPhoneOtp,
  signup,
  submitSourceOfFunds,
  verifyPhoneOtp,
} from '@/lib/gnosispay/api';
import { nextStep, stepProgress, type OnboardingStep as Step } from '@/lib/gnosispay/onboarding';
import type { GpSourceOfFundsQuestion, GpUser } from '@/lib/gnosispay/types';
import { linkEntity, upsertMerchantAccount } from '@/lib/merchant/registry';
import type { MerchantEntityType } from '@/lib/merchant/types';

export default function MerchantOnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string }>();
  const entityType = (params.entityType ?? 'business') as MerchantEntityType;
  const entityId = params.entityId ?? '';

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GpUser | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [step, setStep] = useState<Step>('signup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [sofQuestions, setSofQuestions] = useState<GpSourceOfFundsQuestion[]>([]);
  const [sofAnswers, setSofAnswers] = useState<Record<string, string>>({});

  /** Refresh the user and recompute the step. */
  const refresh = useCallback(
    async (jwt: string) => {
      const result = await getUser(jwt);
      if (!result.ok) {
        setError(result.message);
        return null;
      }
      setUser(result.data);
      setStep(nextStep(result.data, termsAccepted));
      return result.data;
    },
    [termsAccepted]
  );

  /** Sign in once the wallet is ready; a stored JWT short-circuits it. */
  useEffect(() => {
    if (!account) return;
    let cancelled = false;

    (async () => {
      setBusy(true);
      const stored = await getStoredToken(account.address);
      const jwt = stored ?? (await signIn(account).then((r) => (r.ok ? r.data : null)));
      if (cancelled) return;
      if (!jwt) {
        setError('Anmeldung bei Gnosis Pay fehlgeschlagen.');
        setBusy(false);
        return;
      }
      setToken(jwt);
      await refresh(jwt);
      setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [account, refresh]);

  /** Poll while KYC is being reviewed. */
  useEffect(() => {
    if (step !== 'kyc_wait' || !token) return;
    const timer = setInterval(() => void refresh(token), 10_000);
    return () => clearInterval(timer);
  }, [step, token, refresh]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }

  const progress = stepProgress(step);

  if (!account) {
    return (
      <OnboardingStep
        stepIndex={1}
        stepTotal={progress.total}
        title="Kurz anmelden"
        body="Bitte melden Sie sich in der App an, um Stablecoin-Zahlungen einzurichten."
      />
    );
  }

  if (step === 'signup') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Geld, das sofort auf Ihrer Karte ist"
        body="Sie nehmen Zahlungen in digitalen Euro an. Das Geld liegt auf Ihrem eigenen Konto und ist sofort mit Ihrer Karte ausgebbar."
        actionLabel="Los geht's"
        busy={busy}
        error={error}
        onAction={() =>
          run(async () => {
            if (!token) throw new Error('Nicht angemeldet.');
            const result = await signup(email.trim(), token);
            if (!result.ok && result.code !== 'ALREADY_DONE') {
              throw new Error(result.message);
            }
            const fresh = await refresh(token);
            if (fresh) {
              await upsertMerchantAccount(account, {
                gpUserId: fresh.id,
                status: 'pending_kyc',
              });
            }
          })
        }
        actionDisabled={!email.includes('@')}
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>E-Mail-Adresse</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="wirt@beispiel.de"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
        />
      </OnboardingStep>
    );
  }

  if (step === 'terms') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Bedingungen"
        body="Für Konto und Karte gelten die Bedingungen von Gnosis Pay und dem Kartenherausgeber Monavate."
        actionLabel="Zustimmen und weiter"
        busy={busy}
        error={error}
        onAction={() =>
          run(async () => {
            if (!token) throw new Error('Nicht angemeldet.');
            const list = await getTerms(token);
            if (!list.ok) throw new Error(list.message);
            for (const term of list.data) {
              if (!REQUIRED_TERMS.includes(term.id as (typeof REQUIRED_TERMS)[number])) continue;
              const accepted = await acceptTerm(term.id, term.version, token);
              if (!accepted.ok && accepted.code !== 'ALREADY_DONE') {
                throw new Error(accepted.message);
              }
            }
            setTermsAccepted(true);
            setStep(nextStep(user, true));
          })
        }
      />
    );
  }

  if (step === 'kyc') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Identität prüfen"
        body="Einmal Ausweis und Selfie — dauert etwa fünf Minuten. Danach ist Ihr Konto startklar."
        actionLabel="Prüfung starten"
        busy={busy}
        error={error}
        onAction={() =>
          run(async () => {
            if (!token) throw new Error('Nicht angemeldet.');
            const link = await getKycLink(token, 'de');
            if (!link.ok) throw new Error(link.message);
            await WebBrowser.openBrowserAsync(link.data.url);
            await refresh(token);
          })
        }
      />
    );
  }

  if (step === 'kyc_wait') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Prüfung läuft"
        body="Ihre Angaben werden geprüft. Das dauert meist nur wenige Minuten — Sie können die App währenddessen schließen."
        busy
        error={error}
      />
    );
  }

  if (step === 'kyc_blocked') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Prüfung nicht abgeschlossen"
        body="Die Identitätsprüfung konnte nicht abgeschlossen werden. Bitte wenden Sie sich an den Support von Gnosis Pay."
        error={error}
      />
    );
  }

  if (step === 'source_of_funds') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Zwei kurze Fragen"
        body="Gesetzlich vorgeschrieben: woher stammt das Geld, das über das Konto läuft?"
        actionLabel="Antworten senden"
        busy={busy}
        error={error}
        actionDisabled={
          sofQuestions.length === 0 ||
          sofQuestions.some((q) => !sofAnswers[q.question])
        }
        onAction={() =>
          run(async () => {
            if (!token) throw new Error('Nicht angemeldet.');
            const answers = sofQuestions.map((q) => ({
              question: q.question,
              answer: sofAnswers[q.question],
            }));
            const result = await submitSourceOfFunds(answers, token);
            if (!result.ok) throw new Error(result.message);
            await refresh(token);
          })
        }
      >
        <SourceOfFundsQuestions
          token={token}
          questions={sofQuestions}
          setQuestions={setSofQuestions}
          answers={sofAnswers}
          setAnswers={setSofAnswers}
          onError={setError}
        />
      </OnboardingStep>
    );
  }

  if (step === 'phone') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Telefonnummer bestätigen"
        body={
          otpRequested
            ? 'Wir haben Ihnen einen Code geschickt. Bitte hier eintragen.'
            : 'Für die Kontosicherheit brauchen wir Ihre Mobilnummer.'
        }
        actionLabel={otpRequested ? 'Code bestätigen' : 'Code anfordern'}
        busy={busy}
        error={error}
        actionDisabled={otpRequested ? otp.length < 4 : phone.length < 6}
        onAction={() =>
          run(async () => {
            if (!token) throw new Error('Nicht angemeldet.');
            if (!otpRequested) {
              const result = await requestPhoneOtp(phone.trim(), token);
              if (!result.ok) throw new Error(result.message);
              setOtpRequested(true);
              return;
            }
            const result = await verifyPhoneOtp(otp.trim(), token);
            if (!result.ok) throw new Error(result.message);
            await refresh(token);
          })
        }
      >
        {otpRequested ? (
          <TextInput
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
        ) : (
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+49 151 12345678"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
        )}
      </OnboardingStep>
    );
  }

  if (step === 'deploy') {
    return (
      <OnboardingStep
        stepIndex={progress.index}
        stepTotal={progress.total}
        title="Konto wird eröffnet"
        body="Das dauert etwa eine Minute."
        actionLabel="Konto eröffnen"
        busy={busy}
        error={error}
        onAction={() =>
          run(async () => {
            if (!token) throw new Error('Nicht angemeldet.');
            await upsertMerchantAccount(account, { status: 'deploying' });

            const started = await deploySafe(token, 350);
            if (!started.ok) throw new Error(started.message);

            // Poll for up to two minutes; the endpoint is idempotent.
            for (let attempt = 0; attempt < 24; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 5_000));
              const status = await getSafeDeployStatus(token);
              if (status.ok && status.data.status === 'ok') break;
              if (status.ok && status.data.status === 'failed') {
                throw new Error('Konto konnte nicht eröffnet werden. Bitte erneut versuchen.');
              }
            }

            const config = await getSafeConfig(token);
            if (!config.ok || config.data.accountStatus !== 0) {
              throw new Error('Konto ist noch nicht bereit. Bitte in einer Minute erneut öffnen.');
            }

            await upsertMerchantAccount(account, {
              safeAddress: config.data.address,
              status: 'live',
            });
            if (entityId) {
              await linkEntity(account, { entityType, entityId });
            }
            await refresh(token);
          })
        }
      />
    );
  }

  return (
    <OnboardingStep
      stepIndex={progress.total}
      stepTotal={progress.total}
      title="Sie sind live"
      body="Ihr Geschäft ist ab sofort auf der Karte als Stablecoin-Annahmestelle sichtbar. Ihre Karte und Ihre Kontonummer finden Sie im Konto-Bereich."
      actionLabel="Fertig"
      onAction={() => router.back()}
    />
  );
}

/** Loads the questionnaire once the step is reached. */
function SourceOfFundsQuestions({
  token,
  questions,
  setQuestions,
  answers,
  setAnswers,
  onError,
}: {
  token: string | null;
  questions: GpSourceOfFundsQuestion[];
  setQuestions: (q: GpSourceOfFundsQuestion[]) => void;
  answers: Record<string, string>;
  setAnswers: (a: Record<string, string>) => void;
  onError: (message: string) => void;
}) {
  const { colors } = useTheme();

  useEffect(() => {
    if (!token || questions.length > 0) return;
    (async () => {
      const result = await getSourceOfFundsQuestions(token);
      if (!result.ok) {
        onError(result.message);
        return;
      }
      setQuestions(result.data);
    })();
  }, [token, questions.length, setQuestions, onError]);

  return (
    <ScrollView style={styles.questions}>
      {questions.map((question) => (
        <View key={question.question} style={styles.question}>
          <Text style={[styles.label, { color: colors.text }]}>{question.question}</Text>
          {question.answers.map((option) => {
            const selected = answers[question.question] === option;
            return (
              <Text
                key={option}
                accessibilityRole="button"
                onPress={() => setAnswers({ ...answers, [question.question]: option })}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    color: colors.text,
                  },
                ]}
              >
                {option}
              </Text>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Inter_500Medium', fontSize: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  questions: { flex: 1 },
  question: { marginBottom: 20 },
  option: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
});
```

- [ ] **Step 4: Add the entry point on the business page**

In `apps/expo/app/business/[slug].tsx`, inside the owner-only section (where the existing edit affordance lives — find it with `grep -n "owner_wallet_address" app/business/\[slug\].tsx`), add a gated row. Import at the top:

```typescript
import { isStablecoinPaymentsEnabled } from '@/lib/supabase-app-settings';
import { fetchMerchantAccount } from '@/lib/merchant/registry';
```

and render, for the owner only:

```tsx
{isOwner && paymentsEnabled && !merchantLive ? (
  <Pressable
    accessibilityRole="button"
    onPress={() =>
      router.push(
        `/(payments)/onboarding?entityType=business&entityId=${business.id}`
      )
    }
    style={[styles.paymentsCta, { borderColor: colors.border }]}
  >
    <Text style={[styles.paymentsCtaTitle, { color: colors.text }]}>
      Stablecoin-Zahlungen annehmen
    </Text>
    <Text style={[styles.paymentsCtaBody, { color: colors.textSecondary }]}>
      Digitale Euro annehmen und sofort mit Karte ausgeben.
    </Text>
  </Pressable>
) : null}
```

with the two pieces of state loaded in an effect:

```typescript
const [paymentsEnabled, setPaymentsEnabled] = useState(false);
const [merchantLive, setMerchantLive] = useState(false);

useEffect(() => {
  if (!account) return;
  (async () => {
    setPaymentsEnabled(
      await isStablecoinPaymentsEnabled({ walletAddress: account.address })
    );
    const merchant = await fetchMerchantAccount(account.address);
    setMerchantLive(merchant?.status === 'live');
  })();
}, [account]);
```

Add the two styles to that file's existing `StyleSheet.create` block:

```typescript
paymentsCta: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 4, marginTop: 12 },
paymentsCtaTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16 },
paymentsCtaBody: { fontFamily: 'Inter_400Regular', fontSize: 14 },
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "\(payments\)|gnosispay|merchant" || echo "clean"
```

Expected: `clean`. Pre-existing errors elsewhere under `app/` are the known 30-error baseline — leave them.

- [ ] **Step 6: Run the full unit suite**

```bash
cd apps/expo && npx jest lib/__tests__ --ci
```

Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add "apps/expo/app/(payments)" apps/expo/app/business/\[slug\].tsx
git commit -m "feat(expo): merchant stablecoin onboarding wizard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 11: Device verification

**Files:** none — this task verifies, it does not change code.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified live merchant row, and the answers to two of the spec's open questions.

This is Max's own KYC on the Free tier, which the spec names as the integration fixture. It cannot be automated and it involves a real identity document.

- [ ] **Step 1: Enable the pilot for Max's wallet only**

Call `mcp__supabase__execute_sql`, substituting Max's smart-account address:

```sql
update app_settings
set value = '<max_smart_account_address>'
where key = 'stablecoin_payments_enabled';
```

- [ ] **Step 2: Hand the build to Max**

Report that slice 1a is ready for device verification and that a repack-channel APK is needed (per the standing rule: never `eas update` untested, and Max runs EAS himself). List what to check:

1. The "Stablecoin-Zahlungen annehmen" row appears on a business he owns, and on no one else's.
2. Signup → terms → KYC link opens Sumsub in German.
3. After approval, source-of-funds and phone OTP complete.
4. "Konto wird eröffnet" reaches "Sie sind live" within about two minutes.
5. The business shows the stablecoin badge on the map.
6. Time the whole run — the spec promises ten minutes.

- [ ] **Step 3: Verify the row landed**

Call `mcp__supabase__execute_sql`:

```sql
select a.status, a.token, a.chain_id, e.entity_type, e.entity_id
from merchant_payment_accounts a
left join merchant_entities e on e.account_id = a.id;
```

Expected: one row, `status = 'live'`, `token = 'EURe'`, `chain_id = 100`, with the linked business.

- [ ] **Step 4: Verify the webhook actually fired**

Call `mcp__supabase__get_logs` with `service: "edge-function"`. Expected: at least one 200 from `gnosispay-webhook` during the KYC step. If there are none, the app's polling carried the flow and the webhook needs investigating before slice 1b depends on it.

- [ ] **Step 5: Record the answers in the spec**

Append a short "Verified on device" note to §16 of the spec with: the measured onboarding time, whether the webhook fired, and whether the Safe deployed within two minutes. Then:

```bash
git add docs/superpowers/specs/2026-09-04-stablecoin-acceptance-rail-design.md
git commit -m "docs: record slice 1a device verification results

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Self-Review

**Spec coverage (§ by §):**

| Spec section | Task |
|---|---|
| §5 account model — SIWE, EIP-1271, deployed-account precondition | 4, 10 |
| §6 onboarding steps 1–7 | 3, 5, 10 |
| §9 registry tables, RLS, public view | 1 |
| §9 webhook receiver, Ed25519 | 6 |
| §9 map badge + filter chip | 9 |
| §10 error handling — KYC terminal, deploy retry, 401 | 3, 5, 10 |
| §10 kill switch | 8 |
| §11 no partner secret in app, JWT in secure store | 2, 4 |
| §14 unit + integration + device testing | 2–9, 11 |

Deliberately deferred to slice 1b, as the spec's §15 slicing requires: EIP-681, the Kasse, the EURe indexer, `payment_requests` / `merchant_payments`, the scanner, Aufladen. Slice 1c: PSE, cards, IBAN. Step 0 of §6 (ensure the smart account is deployed) is handled implicitly — SIWE fails with `UNAUTHORIZED` on a counterfactual account and the screen surfaces it; an explicit no-op userOp is only needed if Max's device hits it, which Task 11 step 2 will reveal.

**Placeholder scan:** none. Every step has runnable commands or complete code.

**Type consistency:** `GpResult` / `GpUser` / `GpKycStatus` (Task 2) are used unchanged in Tasks 3, 4, 5, 10. `MerchantEntityType` and `acceptanceKey` (Task 7) are used unchanged in Task 9. `OnboardingStep` (Task 3) is imported as `Step` in Task 10 to avoid colliding with the `OnboardingStep` component — deliberate and consistent.

**One risk worth naming:** Task 7's edge function assumes `accounts` and `restaurants` both use `owner_wallet_address`. Only `businesses` is confirmed from `BusinessRecord`. Step 6 of that task verifies it before deploying rather than after.
