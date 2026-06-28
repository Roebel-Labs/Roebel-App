# Gemeinschaftskasse — Enrichment & Polish

- **Date:** 2026-06-28
- **Status:** Approved design — ready for implementation plan
- **Builds on:** [2026-06-28-gemeinschaftskasse-dashboard-design.md](2026-06-28-gemeinschaftskasse-dashboard-design.md) (the feature is LIVE on main)
- **Scope app:** `apps/web` (Next.js 15 admin dashboard)

## Goal

Enrich the existing `/admin/dashboard/gemeinschaftskasse` page: show real **citizen** profiles (username + profile picture) for Safe owners/signers instead of org-account names, a proper **holding-assets** breakdown, a **real transaction history** (dates + Gnosisscan links + details), more treasury info, and **skeleton loaders** throughout.

## Decisions (from brainstorming)

- **Member detail = Compact:** avatar + name + @username + verified badge. (No neighborhood/tier/stats.)
- **Assets scope = Known only:** xDAI, EURe, Röbel-Münzen. No arbitrary-token auto-discovery.
- All new reads stay **server-side** behind `/api/gemeinschaftskasse/*` (keeps the client bundle lean — no protocol-kit/OOM regression — and the Supabase service key server-only).

## Confirmed data sources (verified live)

- **Citizen profiles:** `public.users` table, keyed by `wallet_address` (stored lowercase). Columns used: `username`, `display_name`, `profile_picture_url`, `is_verified_citizen`. Confirmed 2/3 current owners resolve (Guido; Paul/"Shreky" — verified, with pictures); the 3rd (EOA anchor) has no row → fallback.
- **Holdings:** existing `nativeBalance` (xDAI), `eureBalance` (EURe), `rcrcBalance` (Röbel-Münzen) from `@/lib/muenzen/gnosis`. €: `XDAI_EUR` for xDAI, EURe = 1:1 €, Röbel-Münzen shown as count (non-redeemable).
- **Tx history:** Safe Transaction Service (`@safe-global/api-kit` `getMultisigTransactions`/`getPendingTransactions`) provides per-tx `transactionHash` (on-chain exec hash — for the Gnosisscan link), `executionDate`, `submissionDate`, `nonce`, `to`, `value`, `data`, `dataDecoded` (decoded method+params), `confirmations[].owner`, `confirmationsRequired`, `isExecuted`.
- **UI primitives:** `@/components/ui/avatar` (shadcn `Avatar`/`AvatarImage`/`AvatarFallback`), `@/components/ui/skeleton` (`Skeleton`).

## New / changed units

### `lib/gemeinschaftskasse/citizens.ts` (NEW, server-only)
- `interface CitizenProfile { address: string; name: string; username: string | null; avatarUrl: string | null; verified: boolean; source: "citizen" | "account" | "circles" | "external" }`
- `resolveCitizenProfiles(addresses: string[]): Promise<Map<addrLower, CitizenProfile>>`:
  1. Query `users` (admin client) `select wallet_address, username, display_name, profile_picture_url, is_verified_citizen` where `lower(wallet_address)` ∈ addresses → `name = display_name || username`, `avatarUrl = profile_picture_url`, `verified = is_verified_citizen`, `source: "citizen"`.
  2. For unresolved, fall back to `resolveIdentities` (muenzen) → `name`/`avatarUrl`, `source: "account"|"circles"`, `verified: false`.
  3. Still unresolved → `name: "Externe Wallet"`, `username: null`, `avatarUrl: null`, `source: "external"`.
- Never returns a raw 0x as `name`.

### `lib/gemeinschaftskasse/constants.ts` (extend types)
- `OwnerView` gains `avatarUrl: string | null; username: string | null; verified: boolean; source: string`.
- New `AssetHolding { id: AssetId; label: string; amount: number; atto: string; eur: number | null; sharePct: number | null; redeemable: boolean }`.
- `TxView` gains `transactionHash: string | null; date: string | null; amount: string | null; assetLabel: string | null; counterparty: { name: string; avatarUrl: string | null } | null; signers: { address: string; name: string; avatarUrl: string | null }[]`.

### `lib/gemeinschaftskasse/safe-reads.ts` (extend)
- `getSafeOverview(you?)` now:
  - resolves owners via `resolveCitizenProfiles` → `OwnerView` with avatar/username/verified/isYou.
  - returns `assets: AssetHolding[]` (xDAI, EURe, Röbel-Münzen; € + sharePct computed against total € reserve; Röbel-Münzen `redeemable:false`, `eur:null`, excluded from share), `euroTotal`, `threshold`, `ownerCount`, `nonce` (read `nonce()`), `executedCount` (from history count — or omit if extra call too costly; include via api-kit count), `safeAddress`, `safeVersion` ("1.4.1" const).

### `lib/gemeinschaftskasse/describe.ts` (extend)
- `describeTx(raw[])` resolves counterparties + signers via `resolveCitizenProfiles` (batch all `to` + all `confirmations[].owner`), uses `dataDecoded` for owner/threshold method parsing and recipient/amount for transfers, and passes through `transactionHash` + `executionDate || submissionDate` as `date`. Currency copy stays "Röbel-Münzen"/"€", never CRC; counterparty rendered by name (never raw 0x primary).

### API routes (extend response shape only; no new routes)
- `overview` → `{ owners: OwnerView[], assets, euroTotal, threshold, ownerCount, nonce, safeAddress, safeVersion, you }`.
- `history`, `pending` → `{ items: TxView[] }` with the enriched fields.

### Components — `app/admin/dashboard/gemeinschaftskasse/_components/`
- **NEW `MemberRow.tsx`** (client): renders an owner/signer — `Avatar` (AvatarImage=avatarUrl, fallback = initials of name), name (primary), `@username` (muted), verified badge (lucide `BadgeCheck`/`ShieldCheck`), optional "(Du)". Reused by Übersicht owners, Mitglieder, and signer stacks.
- **NEW `skeletons.tsx`** (client): `BalanceSkeleton`, `OwnerListSkeleton`, `HistorySkeleton` using `Skeleton` matching each layout.
- **Übersicht.tsx**: header stat strip (total € reserve, owner count, "n von m Freigaben", executed-tx count, Safe address → Gnosisscan, version) + **Holding-assets card** (row per asset: label, amount, € value, % share; total) + owners via `MemberRow` + threshold safety hint. Skeletons while loading.
- **Mitglieder.tsx**: owner list via `MemberRow` (avatar + name + @username + verified); keep add/remove/threshold actions + non-owner gating. Skeletons.
- **Verlauf.tsx**: rich rows — type label + icon, amount + asset, counterparty (name+avatar), date+time (`toLocaleString("de-DE")`), signer avatar stack, **Gnosisscan link** (`https://gnosisscan.io/tx/${transactionHash}`, only when present). Empty state. Skeletons.
- **PendingQueue.tsx**: reuse the richer row rendering (type, amount, counterparty, signer avatars, approvalLabel) + existing Freigeben/Ausführen + isOwner gating. Skeletons.

## Error handling

- Citizen/identity resolution failures degrade to `resolveIdentities` then "Externe Wallet" — never crash, never show raw 0x as the primary label.
- Missing avatar → `AvatarFallback` initials.
- Missing `transactionHash` (e.g. not-yet-executed) → no link (plain date).
- All fetches keep the existing `{error}` guard + now render a Skeleton (not "Lädt…") while pending.

## Out of scope

Neighborhood/tier/civic-stats on members; arbitrary-token discovery; charts; CSV export; editing profiles. (YAGNI for this pass.)

## Verification

- Node: extend `gk-verify-format.mjs` only if new pure formatters are added (e.g. share %). Citizen resolution + tx enrichment verified by a controller server-side integration check against the live Safe + Supabase (same pattern used for Phase 1), and by browser smoke-test (owners show real avatars/names; Verlauf shows dates + working Gnosisscan links; skeletons appear on load).
