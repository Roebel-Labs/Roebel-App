# Org Type Feature System — Design Spec

## Context

The Expo app's "Mach's in Röbel" org registration flow lets users create organizations with 5 types (restaurant, unternehmen, verein, partei, fraktion). After registration, the profile page shows feature cards — but currently ALL org types see the same hardcoded restaurant-specific cards (Tische, Verwalten, Speisekarte).

**Problem:** There is no type-based feature system. A Verein sees "Tische" and "Speisekarte" which makes no sense. The database also has a messy model: `account_type` holds 5 values mixing structural categories with functional types, and restaurants are hacked as `account_type = 'unternehmen'` with a mapping in the wizard.

**Goal:** Each org type gets its own unique set of profile feature cards and destination screens. The system should be declarative and easy to extend when new types or features are added.

**Scope:** Expo app only (apps/expo). Web app (apps/web) is out of scope. Citizen seller experience is a follow-up project.

---

## 1. Database Schema Changes

### 1.1 Simplify `accounts.account_type`

**Current:** `account_type IN ('personal', 'unternehmen', 'verein', 'partei', 'fraktion')`
**New:** `account_type IN ('personal', 'organisation')`

### 1.2 Add `sub_type` column

**New column:** `sub_type TEXT CHECK (sub_type IN ('restaurant', 'unternehmen', 'verein', 'partei', 'fraktion'))`
- Nullable (null for personal accounts)
- Indexed for query performance
- This is the single source of truth for feature set determination

### 1.3 Migration (007_account_sub_type.sql)

```sql
-- 1. Add sub_type column
ALTER TABLE accounts ADD COLUMN sub_type TEXT
  CHECK (sub_type IN ('restaurant', 'unternehmen', 'verein', 'partei', 'fraktion'));

-- 2. Backfill sub_type from current account_type
UPDATE accounts SET sub_type = account_type WHERE account_type != 'personal';

-- 3. Backfill restaurants (currently stored as 'unternehmen')
UPDATE accounts a SET sub_type = 'restaurant'
FROM restaurants r WHERE r.account_id = a.id;

-- 4. Collapse all non-personal to 'organisation'
UPDATE accounts SET account_type = 'organisation' WHERE account_type != 'personal';

-- 5. Replace CHECK constraint
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check
  CHECK (account_type IN ('personal', 'organisation'));

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_accounts_sub_type ON accounts USING btree (sub_type);
```

### 1.4 Add `account_id` to `marketplace_listings`

For Produkte/Dienstleistungen to be scoped to an org:

```sql
ALTER TABLE marketplace_listings ADD COLUMN account_id UUID REFERENCES accounts(id);
CREATE INDEX IF NOT EXISTS idx_marketplace_account ON marketplace_listings USING btree (account_id);
```

Existing personal listings keep `account_id = NULL` and continue using `seller_wallet_address`.

---

## 2. TypeScript Type Changes

**File:** `apps/expo/lib/types.ts` (lines 308-322)

```typescript
// Before
export type AccountType = 'personal' | 'unternehmen' | 'verein' | 'partei' | 'fraktion';
export type OrgType = Exclude<AccountType, 'personal'>;

// After
export type AccountType = 'personal' | 'organisation';
export type OrgSubType = 'restaurant' | 'unternehmen' | 'verein' | 'partei' | 'fraktion';

export type Account = {
  id: string;
  account_type: AccountType;
  sub_type: OrgSubType | null;  // null for personal accounts
  name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};
```

The `OrgTypeChoice` in `CreateOrgWizardContext.tsx` already matches `OrgSubType` exactly — no change needed there.

---

## 3. Feature Card Registry

**New file:** `apps/expo/lib/org-features.ts`

A static config map that defines which feature cards appear on the profile for each `sub_type`.

### 3.1 Feature Card Config Shape

```typescript
type FeatureCardConfig = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  route: string;
  highlight?: boolean;
};
```

### 3.2 Feature Sets

**Default features (all org types):**
| Card | Emoji | Route | Description |
|------|-------|-------|-------------|
| Dashboard | 📊 | /org/dashboard | Analytics overview, sub_type-specific content |
| Anzeigen | 📢 | /org/ads | Ad management, profile/listing view tracking, create local ads |

**Restaurant-specific (in addition to defaults):**
| Card | Emoji | Route | Description |
|------|-------|-------|-------------|
| Tische | 🍽️ | /kitchen | Live table session view (existing) |
| Verwalten | ⚙️ | /kitchen/tables | Table management + QR codes (existing) |
| Speisekarte | 📋 | /menu | Menu categories & items (existing) |

**Unternehmen-specific (in addition to defaults):**
| Card | Emoji | Route | Description |
|------|-------|-------|-------------|
| Produkte | 📦 | /org/products | Product catalog (reuses marketplace CRUD, filtered by listing_type=product + account_id) |
| Dienstleistungen | 🛠️ | /org/services | Service catalog (reuses marketplace CRUD, filtered by listing_type=service + account_id) |

**Verein / Partei / Fraktion:** defaults only (Dashboard + Anzeigen). Type-specific features are a future addition.

### 3.3 `getOrgFeatures(subType)` Function

Returns `[...DEFAULT_FEATURES, ...SUB_TYPE_FEATURES[subType]]`. Pure function, easy to test, single place to add new features.

---

## 4. Profile Page Changes

### 4.1 ProfileModeCards.tsx (lines 154-181)

Replace the hardcoded `OrgCards` function with a config-driven renderer:

- Read `activeAccount.sub_type` from `useAccount()`
- Call `getOrgFeatures(subType)` to get the card list
- Chunk into rows of 2, render `ModeCard` components
- No changes to `ModeCard`, `TouristCards`, `CitizenCards`, or `CTABanner`

### 4.2 ProfileContent.tsx

Update org detection logic:

```typescript
// Line 51: isBusinessOwner check
const isBusinessOwner = ownedAccounts.some(a => a.account_type === 'organisation') || !!businessRecord;

// Line 54: accountMode
const accountMode = activeAccount?.account_type === 'organisation' ? 'business' : 'personal';

// Line 57: setAccountMode
const orgAcc = ownedAccounts.find(a => a.account_type === 'organisation');

// Line 130: orgAccount detection
const orgAccount = ownedAccounts.find(a => a.account_type === 'organisation');
```

### 4.3 ProfileModeCards.tsx line 88

```typescript
const isOrg = activeAccount?.account_type === 'organisation';
```

---

## 5. Success Screen Changes

**File:** `apps/expo/app/create-org/success.tsx`

### 5.1 CTA Text
Change "Zurück zum Profil" → "Zum Profil" (line 31)

### 5.2 Navigation
After registration, switch the active account to the newly created org account, then navigate to `/profile`. This requires:
- Reading `state.newAccountId` from wizard context (set in review.tsx after account creation — see Section 6.4)
- Calling `switchAccount(newAccountId)` before `router.replace('/profile')`

This ensures the user lands on the profile page with the org account active, seeing their new type-specific feature cards.

---

## 6. Create-Org Wizard Changes

### 6.1 review.tsx (line 50-51)

Remove the `restaurant → unternehmen` mapping hack:

```typescript
// Before
const accountType: OrgType = state.orgType === 'restaurant' ? 'unternehmen' : state.orgType as OrgType;
const orgAccount = await createOrgAccount(accountType, state.name.trim());

// After
const orgAccount = await createOrgAccount(state.orgType!, state.name.trim());
```

### 6.2 supabase-accounts.ts — `createOrgAccount`

Update to insert `account_type: 'organisation'` with `sub_type`:

```typescript
export async function createOrgAccount(
  walletAddress: string,
  subType: OrgSubType,
  name: string
): Promise<Account | null> {
  const { data: account, error } = await supabase
    .from('accounts')
    .insert({
      account_type: 'organisation',
      sub_type: subType,
      name,
    })
    .select()
    .single();
  // ... link owner, return account
}
```

### 6.3 AccountContext.tsx — `createOrgAccount` signature

```typescript
// Before
createOrgAccount: (type: OrgType, name: string) => Promise<Account>;

// After
createOrgAccount: (subType: OrgSubType, name: string) => Promise<Account>;
```

### 6.4 Store new account ID for success screen

After `createOrgAccount` returns in `review.tsx`, store the new account ID in wizard state so the success screen can switch to it:

```typescript
dispatch({ type: 'SET_NEW_ACCOUNT_ID', payload: orgAccount.id });
```

Add `newAccountId: string | null` to `WizardState` in `CreateOrgWizardContext.tsx`.

---

## 7. New Screens

### 7.1 /org/dashboard.tsx — Org Dashboard

Single screen with sub_type-aware content switching:

```
/org/dashboard
├── RestaurantDashboardContent  (sub_type === 'restaurant')
├── UnternehmenDashboardContent (sub_type === 'unternehmen')
└── GenericDashboardContent     (verein, partei, fraktion)
```

**Restaurant Dashboard Content:**
- Table session stats: total sessions, opened by staff vs citizens vs guests
- Order data: total orders, average per session
- Speisekarte stats: most viewed items
- Time-based trends (daily/weekly)

**Unternehmen Dashboard Content:**
- Product/service listing stats: total, active, views
- Profile views
- Contact interactions (phone taps, website clicks)

**Generic Dashboard Content:**
- Profile views and engagement
- Post/event performance
- Ad performance summary

Each content component lives in `apps/expo/components/dashboard/` and handles its own data fetching.

### 7.2 /org/ads.tsx — Anzeigen Management

Unified screen for all org types:
- Track existing ads performance (views, clicks, reach)
- Track profile views and listing views (e.g. Speisekarte views for restaurants)
- Create a new local ad
- View active/past campaigns

Reuses the existing `AnalyticsCard` component and follows the same layout pattern as `business/dashboard.tsx`.

### 7.3 /org/products.tsx — Product Catalog (Unternehmen only)

- Lists marketplace listings where `listing_type = 'product'` AND `account_id = activeAccount.id`
- "Neues Produkt" CTA to create a listing (reuses `create/marketplace.tsx` flow, pre-filling `listing_type: 'product'` and `account_id`)
- Card grid showing product image, title, price, status
- Edit/delete capabilities

### 7.4 /org/services.tsx — Service Catalog (Unternehmen only)

Same as products but filtered by `listing_type = 'service'`.

---

## 8. Marketplace CRUD Extensions

### 8.1 supabase-marketplace.ts

Add account-scoped query functions:

```typescript
export async function fetchOrgListings(
  accountId: string,
  listingType?: 'product' | 'service'
): Promise<MarketplaceListingRecord[]>

export async function createOrgListing(
  accountId: string,
  listing: { ... }
): Promise<MarketplaceListingRecord | null>
```

### 8.2 MarketplaceListingRecord type

Add optional `account_id` field:

```typescript
export type MarketplaceListingRecord = {
  // ... existing fields
  account_id: string | null;  // NEW — null for personal listings
};
```

---

## 9. Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/007_account_sub_type.sql` | **NEW** — DB migration |
| `apps/expo/lib/types.ts` | Update AccountType, add OrgSubType, update Account, MarketplaceListingRecord |
| `apps/expo/lib/org-features.ts` | **NEW** — Feature card config registry |
| `apps/expo/lib/supabase-accounts.ts` | Update createOrgAccount to use sub_type |
| `apps/expo/lib/supabase-marketplace.ts` | Add fetchOrgListings, createOrgListing |
| `apps/expo/context/AccountContext.tsx` | Update createOrgAccount signature |
| `apps/expo/context/CreateOrgWizardContext.tsx` | Add newAccountId to state |
| `apps/expo/components/profile/ProfileModeCards.tsx` | Replace hardcoded OrgCards with config-driven renderer |
| `apps/expo/components/profile/ProfileContent.tsx` | Update isOrg detection to use 'organisation' |
| `apps/expo/app/create-org/review.tsx` | Remove restaurant→unternehmen hack, store new account ID |
| `apps/expo/app/create-org/success.tsx` | Change CTA to "Zum Profil", switch to org account before navigating |
| `apps/expo/app/org/dashboard.tsx` | **NEW** — Sub-type-aware dashboard |
| `apps/expo/app/org/ads.tsx` | **NEW** — Anzeigen management |
| `apps/expo/app/org/products.tsx` | **NEW** — Product catalog for Unternehmen |
| `apps/expo/app/org/services.tsx` | **NEW** — Service catalog for Unternehmen |
| `apps/expo/components/dashboard/RestaurantDashboardContent.tsx` | **NEW** — Restaurant stats |
| `apps/expo/components/dashboard/UnternehmenDashboardContent.tsx` | **NEW** — Unternehmen stats |
| `apps/expo/components/dashboard/GenericDashboardContent.tsx` | **NEW** — Default stats |

---

## 10. Verification Plan

1. **Schema:** Run migration against Supabase, verify `sub_type` column exists and backfill is correct
2. **Registration flow:** Create a new restaurant org → verify `account_type = 'organisation'`, `sub_type = 'restaurant'` in DB
3. **Success screen:** After registration, verify CTA says "Zum Profil" and navigates to profile with org account active
4. **Restaurant profile:** Switch to restaurant account → verify feature cards show Dashboard, Anzeigen, Tische, Verwalten, Speisekarte
5. **Unternehmen profile:** Create/switch to unternehmen account → verify feature cards show Dashboard, Anzeigen, Produkte, Dienstleistungen
6. **Verein profile:** Create/switch to verein account → verify only Dashboard + Anzeigen cards appear
7. **Personal profile:** Switch to personal account → verify TouristCards or CitizenCards appear (no org cards)
8. **Dashboard:** Tap Dashboard card for each type → verify correct content renders
9. **Produkte/Dienstleistungen:** Create a product listing from Unternehmen profile → verify it appears in the org's product list and in the general marketplace
10. **Account switcher:** Switch between personal and org accounts → verify feature cards update correctly
