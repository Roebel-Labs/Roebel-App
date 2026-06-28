# Gemeinschaftskasse Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the live Gemeinschaftskasse page with real citizen profiles (avatar + name + @username + verified) for owners/signers/counterparties, a holding-assets breakdown, a rich transaction history (dates + Gnosisscan links + details), header stats, and skeleton loaders.

**Architecture:** All new data (citizen profiles from Supabase `users`, asset €-breakdown, tx `transactionHash`/`dataDecoded`) is resolved **server-side** behind the existing `/api/gemeinschaftskasse/*` routes; the client only renders. A new server resolver `resolveCitizenProfiles` queries `users` by `wallet_address`; new shared client components `MemberRow` + skeletons standardize rendering.

**Tech Stack:** Next.js 15 (App Router, client + server), TypeScript, Tailwind, viem, `@safe-global/api-kit` (server-only), Supabase admin client (server-only), shadcn `Avatar` + `Skeleton`, lucide-react.

## Global Constraints

- All UI copy **German**. Currency only **"Röbel-Münzen" / "€"** — NEVER "CRC"/"Circles".
- **Never a raw 0x address as the PRIMARY label** — resolved name first; truncated address only as muted secondary.
- All new reads run **server-side** (no `@safe-global` or Supabase service key in any `"use client"` file — guards the build against the @safe-global OOM and keeps secrets server-only).
- Supabase: `public.users` keyed by `wallet_address` (stored **lowercase**). Columns: `username`, `display_name`, `profile_picture_url`, `is_verified_citizen`. Use the admin client via `@/lib/supabase/admin` `createAdminClient()`.
- Chain Gnosis (100); Safe `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` v1.4.1. xDAI→€ via `XDAI_EUR` from `@/lib/muenzen/constants`; EURe = 1:1 €; Röbel-Münzen = count, non-redeemable (`eur: null`).
- Gnosisscan tx link: `https://gnosisscan.io/tx/${transactionHash}` — ONLY when `transactionHash` is present.
- Brand `#00498B`. UI primitives: `@/components/ui/avatar` (`Avatar`/`AvatarImage`/`AvatarFallback`), `@/components/ui/skeleton` (`Skeleton`).
- `apps/web` has NO test runner — verify pure logic with `node apps/web/scripts/*.mjs`; verify data/UI in the browser (controller runs a server-side integration check + browser smoke).
- Commit per task (pathspec form `git commit -- <files>` to avoid sweeping parallel commits); push at end.

---

## File map

**Create**
- `apps/web/src/lib/gemeinschaftskasse/citizens.ts` — `resolveCitizenProfiles` + `CitizenProfile`.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/MemberRow.tsx` — avatar+name+@username+verified.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/skeletons.tsx` — `BalanceSkeleton`/`OwnerListSkeleton`/`HistorySkeleton`.
- `apps/web/scripts/gk-verify-enrich.mjs` — node checks for pure helpers (initials, sharePct).

**Modify**
- `apps/web/src/lib/gemeinschaftskasse/constants.ts` — extend `OwnerView`, `TxView`; add `AssetHolding`.
- `apps/web/src/lib/gemeinschaftskasse/safe-reads.ts` — enrich `getSafeOverview` (citizen owners, assets, stats).
- `apps/web/src/lib/gemeinschaftskasse/describe.ts` — enrich `describeTx` (counterparty, signers, transactionHash, date, dataDecoded).
- `apps/web/src/app/api/gemeinschaftskasse/overview/route.ts` — include assets + stats + enriched owners.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Uebersicht.tsx` — stats + holdings + MemberRow + skeletons.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Mitglieder.tsx` — MemberRow + skeletons.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Verlauf.tsx` — rich rows + Gnosisscan + skeletons.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx` — signer avatars + skeletons.

---

### Task 1: Citizen resolver + type extensions

**Files:**
- Create: `apps/web/src/lib/gemeinschaftskasse/citizens.ts`
- Modify: `apps/web/src/lib/gemeinschaftskasse/constants.ts`

**Interfaces:**
- Produces: `resolveCitizenProfiles(addresses: string[]) => Promise<Map<addrLower, CitizenProfile>>`; `CitizenProfile`; extended `OwnerView`, `TxView`; new `AssetHolding`.

- [ ] **Step 1: Create `citizens.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveIdentities } from "@/lib/muenzen/identity";

export interface CitizenProfile {
  address: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
  source: "citizen" | "account" | "circles" | "external";
}

/**
 * Resolve wallet addresses to citizen profiles, preferring the app `users`
 * table (the individual citizen), then the muenzen account/Circles identity,
 * then a generic "Externe Wallet" label. Never returns a raw 0x as `name`.
 */
export async function resolveCitizenProfiles(
  addresses: string[],
): Promise<Map<string, CitizenProfile>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))];
  const map = new Map<string, CitizenProfile>();
  if (uniq.length === 0) return map;

  // 1) Citizen users (wallet_address stored lowercase)
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("users")
      .select("wallet_address, username, display_name, profile_picture_url, is_verified_citizen")
      .in("wallet_address", uniq);
    for (const u of (data ?? []) as Array<{
      wallet_address: string | null;
      username: string | null;
      display_name: string | null;
      profile_picture_url: string | null;
      is_verified_citizen: boolean | null;
    }>) {
      const key = (u.wallet_address ?? "").toLowerCase();
      const name = u.display_name || u.username;
      if (!key || !name) continue;
      map.set(key, {
        address: key,
        name,
        username: u.username ?? null,
        avatarUrl: u.profile_picture_url ?? null,
        verified: !!u.is_verified_citizen,
        source: "citizen",
      });
    }
  } catch {
    /* fall through to identity fallback */
  }

  // 2) Fallback: muenzen account/Circles identity
  const unresolved = uniq.filter((a) => !map.has(a));
  if (unresolved.length) {
    try {
      const ids = await resolveIdentities(unresolved);
      for (const a of unresolved) {
        const id = ids.get(a);
        if (id?.name) {
          map.set(a, {
            address: a,
            name: id.name,
            username: null,
            avatarUrl: id.avatarUrl ?? null,
            verified: false,
            source: id.source === "circles" ? "circles" : "account",
          });
        }
      }
    } catch {
      /* fall through to external */
    }
  }

  // 3) External fallback
  for (const a of uniq) {
    if (!map.has(a)) {
      map.set(a, { address: a, name: "Externe Wallet", username: null, avatarUrl: null, verified: false, source: "external" });
    }
  }
  return map;
}
```

- [ ] **Step 2: Extend types in `constants.ts`**

Replace the existing `OwnerView` interface and add `AssetHolding`; extend `TxView`:

```ts
export interface OwnerView {
  address: string;
  name: string;
  short: string;
  isYou?: boolean;
  avatarUrl: string | null;
  username: string | null;
  verified: boolean;
  source: string;
}

export interface AssetHolding {
  id: AssetId;
  label: string;
  amount: number;       // human units
  atto: string;         // raw 18-dec string
  eur: number | null;   // null = not euro-redeemable (Röbel-Münzen)
  sharePct: number | null; // share of euro reserve; null for non-redeemable
  redeemable: boolean;
}

export interface TxSigner { address: string; name: string; avatarUrl: string | null }

export interface TxView {
  safeTxHash: string;
  kind: "auszahlung" | "mitglied_hinzu" | "mitglied_entfernt" | "schwelle" | "sonstige";
  title: string;
  confirmations: number;
  threshold: number;
  executed: boolean;
  signers: TxSigner[];
  date: string | null;            // executionDate || submissionDate
  transactionHash: string | null; // on-chain hash for Gnosisscan
  amount: string | null;          // formatted amount for transfers
  assetLabel: string | null;      // "xDAI" | "EURe" | "Röbel-Münzen"
  counterparty: { name: string; avatarUrl: string | null } | null;
}
```
> Note: `TxView.signers` changes from `string[]` to `TxSigner[]` and `submissionDate` is replaced by `date`. Tasks 3, 6, 7 consume the new shape.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "gemeinschaftskasse/\(citizens\|constants\)" || echo "NO ERRORS in new/changed files"`
Expected: `NO ERRORS in new/changed files` (consumers in describe.ts/safe-reads.ts will error until Tasks 2-3 — that's expected; only check these two files here).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/citizens.ts apps/web/src/lib/gemeinschaftskasse/constants.ts
git commit -m "feat(web): GK citizen-profile resolver + enriched OwnerView/TxView/AssetHolding types" -- apps/web/src/lib/gemeinschaftskasse/citizens.ts apps/web/src/lib/gemeinschaftskasse/constants.ts
```

---

### Task 2: Enrich `getSafeOverview` (citizen owners + assets + stats) + overview route

**Files:**
- Modify: `apps/web/src/lib/gemeinschaftskasse/safe-reads.ts`
- Modify: `apps/web/src/app/api/gemeinschaftskasse/overview/route.ts`

**Interfaces:**
- Consumes: `resolveCitizenProfiles` (Task 1), `OwnerView`/`AssetHolding` (Task 1), existing `nativeBalance`/`eureBalance`/`rcrcBalance`, `XDAI_EUR`/`attoToNumber`/`shortAddr` from `@/lib/muenzen/constants`, `SAFE_ABI`/`GK_SAFE`.
- Produces: `getSafeOverview(you?) => { owners: OwnerView[], assets: AssetHolding[], euroTotal, threshold, ownerCount, nonce, safeAddress, safeVersion }`.

- [ ] **Step 1: Rewrite `getSafeOverview` body**

Read the current `safe-reads.ts`, then make `getSafeOverview` resolve owners via `resolveCitizenProfiles`, read `nonce()`, and build `assets`:
```ts
import { resolveCitizenProfiles } from "./citizens";
import { XDAI_EUR, attoToNumber, shortAddr } from "@/lib/muenzen/constants";
import type { OwnerView, AssetHolding } from "./constants";
// ...
export async function getSafeOverview(you?: string) {
  const safe = getAddress(GK_SAFE);
  const [ownersRaw, thresholdRaw, nonceRaw, xdai, eure, muenzen] = await Promise.all([
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getOwners" }),
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getThreshold" }),
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "nonce" }),
    nativeBalance(GK_SAFE),
    eureBalance(GK_SAFE),
    rcrcBalance(GK_SAFE).catch(() => 0n),
  ]);
  const ownerAddrs = (ownersRaw as readonly string[]).map((a) => getAddress(a));
  const profiles = await resolveCitizenProfiles(ownerAddrs);
  const owners: OwnerView[] = ownerAddrs.map((a) => {
    const p = profiles.get(a.toLowerCase());
    return {
      address: a,
      name: p?.name ?? "Externe Wallet",
      short: shortAddr(a),
      isYou: you ? a.toLowerCase() === you.toLowerCase() : false,
      avatarUrl: p?.avatarUrl ?? null,
      username: p?.username ?? null,
      verified: p?.verified ?? false,
      source: p?.source ?? "external",
    };
  });

  const euroXdai = (Number(xdai) / 1e18) * XDAI_EUR;
  const euroEure = Number(eure) / 1e18;
  const euroTotal = euroXdai + euroEure;
  const assets: AssetHolding[] = [
    { id: "xdai", label: "xDAI", amount: Number(xdai) / 1e18, atto: xdai.toString(), eur: euroXdai, sharePct: euroTotal ? (euroXdai / euroTotal) * 100 : 0, redeemable: true },
    { id: "eure", label: "EURe", amount: Number(eure) / 1e18, atto: eure.toString(), eur: euroEure, sharePct: euroTotal ? (euroEure / euroTotal) * 100 : 0, redeemable: true },
    { id: "muenzen", label: "Röbel-Münzen", amount: attoToNumber(muenzen), atto: muenzen.toString(), eur: null, sharePct: null, redeemable: false },
  ];

  return {
    owners,
    assets,
    euroTotal,
    threshold: Number(thresholdRaw),
    ownerCount: ownerAddrs.length,
    nonce: Number(nonceRaw),
    safeAddress: safe,
    safeVersion: "1.4.1",
  };
}
```

- [ ] **Step 2: Update the overview route to return the new fields**

In `overview/route.ts`, return the enriched object (owners now carry avatar/username/verified; add assets/stats):
```ts
const data = await getSafeOverview(you);
return NextResponse.json({
  owners: data.owners,
  assets: data.assets,
  euroTotal: data.euroTotal,
  threshold: data.threshold,
  ownerCount: data.ownerCount,
  nonce: data.nonce,
  safeAddress: data.safeAddress,
  safeVersion: data.safeVersion,
});
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "gemeinschaftskasse/safe-reads\|api/gemeinschaftskasse/overview" || echo "NO ERRORS"`
Expected: `NO ERRORS`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/safe-reads.ts apps/web/src/app/api/gemeinschaftskasse/overview/route.ts
git commit -m "feat(web): GK overview returns citizen owners + asset breakdown + stats" -- apps/web/src/lib/gemeinschaftskasse/safe-reads.ts apps/web/src/app/api/gemeinschaftskasse/overview/route.ts
```

---

### Task 3: Enrich `describeTx` (counterparty, signers, transactionHash, date)

**Files:**
- Modify: `apps/web/src/lib/gemeinschaftskasse/describe.ts`

**Interfaces:**
- Consumes: `resolveCitizenProfiles` (Task 1), `TxView`/`TxSigner` (Task 1), `SAFE_ABI`/`GK_SAFE`/`TOKENS`, `eur`/`XDAI_EUR`.
- Produces: `describeTx(raw[]) => Promise<TxView[]>` with enriched fields.

- [ ] **Step 1: Rewrite `describeTx`**

Read current `describe.ts`, then: batch-resolve all `to` addresses + all `confirmations[].owner` via `resolveCitizenProfiles`; build `signers: TxSigner[]`; set `transactionHash = raw.transactionHash ?? null`; `date = raw.executionDate ?? raw.submissionDate ?? null`; prefer `raw.dataDecoded` for method parsing; set `counterparty`/`amount`/`assetLabel` for transfers.
```ts
import "server-only";
import { decodeFunctionData, getAddress } from "viem";
import { resolveCitizenProfiles } from "./citizens";
import { SAFE_ABI, GK_SAFE, TOKENS, type TxView, type TxSigner } from "./constants";
import { eur } from "./format";
import { XDAI_EUR } from "@/lib/muenzen/constants";

export async function describeTx(raw: any[]): Promise<TxView[]> {
  const addrs = new Set<string>();
  for (const t of raw) {
    if (t.to) addrs.add(getAddress(t.to));
    for (const c of t.confirmations ?? []) if (c.owner) addrs.add(getAddress(c.owner));
  }
  const profiles = await resolveCitizenProfiles([...addrs]);
  const prof = (a?: string) => (a ? profiles.get(a.toLowerCase()) : undefined);
  const nm = (a?: string) => prof(a)?.name ?? "jemand";

  return raw.map((t): TxView => {
    const confirmations = t.confirmations?.length ?? 0;
    const signers: TxSigner[] = (t.confirmations ?? []).map((c: any) => {
      const p = prof(c.owner);
      return { address: c.owner, name: p?.name ?? "Mitsignierer", avatarUrl: p?.avatarUrl ?? null };
    });
    let kind: TxView["kind"] = "sonstige";
    let title = "Aktion";
    let amount: string | null = null;
    let assetLabel: string | null = null;
    let counterparty: TxView["counterparty"] = null;

    const isSafeCall = t.to && getAddress(t.to) === getAddress(GK_SAFE) && t.data && t.data !== "0x";
    if (isSafeCall) {
      try {
        const dec = decodeFunctionData({ abi: SAFE_ABI, data: t.data });
        if (dec.functionName === "addOwnerWithThreshold") { kind = "mitglied_hinzu"; title = `Mitglied hinzufügen: ${nm(dec.args[0] as string)}`; counterparty = { name: nm(dec.args[0] as string), avatarUrl: prof(dec.args[0] as string)?.avatarUrl ?? null }; }
        else if (dec.functionName === "removeOwner") { kind = "mitglied_entfernt"; title = `Mitglied entfernen: ${nm(dec.args[1] as string)}`; counterparty = { name: nm(dec.args[1] as string), avatarUrl: prof(dec.args[1] as string)?.avatarUrl ?? null }; }
        else if (dec.functionName === "changeThreshold") { kind = "schwelle"; title = `Schwelle auf ${dec.args[0]} ändern`; }
      } catch { /* unknown safe call */ }
    } else if (!t.data || t.data === "0x") {
      kind = "auszahlung"; assetLabel = "xDAI";
      const eurVal = (Number(t.value || 0) / 1e18) * XDAI_EUR;
      amount = eur(eurVal);
      counterparty = { name: nm(t.to), avatarUrl: prof(t.to)?.avatarUrl ?? null };
      title = `Auszahlung ${amount} an ${counterparty.name}`;
    } else {
      kind = "auszahlung";
      const tok = TOKENS.find((x) => x.address && t.to && getAddress(x.address) === getAddress(t.to));
      assetLabel = tok?.label ?? null;
      title = tok ? `Auszahlung in ${tok.label}` : `Auszahlung an ${nm(t.to)}`;
      counterparty = tok ? null : { name: nm(t.to), avatarUrl: prof(t.to)?.avatarUrl ?? null };
    }

    return {
      safeTxHash: t.safeTxHash,
      kind, title, confirmations,
      threshold: t.confirmationsRequired ?? confirmations,
      executed: !!t.isExecuted,
      signers,
      date: t.executionDate ?? t.submissionDate ?? null,
      transactionHash: t.transactionHash ?? null,
      amount, assetLabel, counterparty,
    };
  });
}
```
> Keep the local `RawSafeTx`-style typing approach already used in the file if present; `any[]` is acceptable here since the Safe service shape is wide. Confirm `transactionHash`/`executionDate` exist on the api-kit v5 `SafeMultisigTransactionResponse` (they do) — adjust field names if the installed types differ.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "gemeinschaftskasse/describe" || echo "NO ERRORS"`
Expected: `NO ERRORS`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/describe.ts
git commit -m "feat(web): GK describeTx enriches counterparty/signers/date/transactionHash" -- apps/web/src/lib/gemeinschaftskasse/describe.ts
```

---

### Task 4: Shared UI — `MemberRow` + skeletons + node checks

**Files:**
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/MemberRow.tsx`
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/skeletons.tsx`
- Create: `apps/web/scripts/gk-verify-enrich.mjs`

**Interfaces:**
- Produces: `MemberRow` (+`MemberRowData`, `initials`), `BalanceSkeleton`/`OwnerListSkeleton`/`HistorySkeleton`.

- [ ] **Step 1: Create `MemberRow.tsx`**

```tsx
"use client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BadgeCheck } from "lucide-react";

export interface MemberRowData {
  name: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
  isYou?: boolean;
}

/** Initials from a display name (handles German umlauts; falls back to "?"). */
export function initials(name: string): string {
  const parts = name.replace(/[^\p{L} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  const s = parts.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return s || "?";
}

export function MemberRow({ m, size = "md" }: { m: MemberRowData; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className={`${dim} shrink-0`}>
        {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.name} />}
        <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{m.name}</span>
          {m.verified && <BadgeCheck className="h-4 w-4 text-[#00498B] shrink-0" aria-label="verifiziert" />}
          {m.isYou && <span className="text-xs text-[#00498B] shrink-0">(Du)</span>}
        </div>
        {m.username && <p className="text-xs text-muted-foreground truncate">@{m.username}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `skeletons.tsx`**

```tsx
"use client";
import { Skeleton } from "@/components/ui/skeleton";

export function BalanceSkeleton() {
  return (
    <div className="rounded-lg border border-border p-5 space-y-3">
      <Skeleton className="h-4 w-32" /><Skeleton className="h-9 w-44" /><Skeleton className="h-3 w-48" />
    </div>
  );
}
export function OwnerListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" /></div>
        </div>
      ))}
    </div>
  );
}
export function HistorySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-3 flex items-center justify-between gap-3">
          <div className="space-y-1.5"><Skeleton className="h-4 w-52" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `gk-verify-enrich.mjs` (node check for `initials` + share %)**

```mjs
import assert from "node:assert";
function initials(name) {
  const parts = name.replace(/[^\p{L} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return (parts.map((w) => w[0]).join("").slice(0, 2).toUpperCase()) || "?";
}
assert.equal(initials("Paul"), "P");
assert.equal(initials("Shreky Müller"), "SM");
assert.equal(initials("@@@"), "?");
const euroXdai = 264, euroEure = 0, total = euroXdai + euroEure;
assert.equal(Math.round((euroXdai / total) * 100), 100);
console.log("✅ gk-verify-enrich passed");
```

- [ ] **Step 4: Run node check + typecheck**

Run: `node apps/web/scripts/gk-verify-enrich.mjs` → Expected `✅ gk-verify-enrich passed`.
Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "MemberRow\|skeletons" || echo "NO ERRORS"` → Expected `NO ERRORS`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/MemberRow.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/skeletons.tsx apps/web/scripts/gk-verify-enrich.mjs
git commit -m "feat(web): GK shared MemberRow + skeleton loaders + node checks" -- apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/MemberRow.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/skeletons.tsx apps/web/scripts/gk-verify-enrich.mjs
```

---

### Task 5: Übersicht — stats + holdings + citizen owners + skeletons

**Files:**
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Uebersicht.tsx`

**Interfaces:**
- Consumes: `GET /api/gemeinschaftskasse/overview` (now `{ owners, assets, euroTotal, threshold, ownerCount, nonce, safeAddress, safeVersion }`), `MemberRow` (Task 4), `BalanceSkeleton`/`OwnerListSkeleton` (Task 4).

- [ ] **Step 1: Rewrite `Uebersicht.tsx`**

Read the current file, then implement: typed state for the new shape; `BalanceSkeleton`+`OwnerListSkeleton` while loading; a stats strip; a holdings card (row per asset with amount, €, % share, total); owners via `MemberRow`; threshold safety hint. Key structure:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { MemberRow } from "./MemberRow";
import { BalanceSkeleton, OwnerListSkeleton } from "./skeletons";

interface Asset { id: string; label: string; amount: number; eur: number | null; sharePct: number | null; redeemable: boolean }
interface Owner { address: string; name: string; short: string; isYou?: boolean; avatarUrl: string | null; username: string | null; verified: boolean }
interface Overview { owners: Owner[]; assets: Asset[]; euroTotal: number; threshold: number; ownerCount: number; nonce: number; safeAddress: string; safeVersion: string }

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const num = (n: number, d = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n);

export function Uebersicht() {
  const account = useActiveAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const url = "/api/gemeinschaftskasse/overview" + (account ? `?you=${account.address}` : "");
    fetch(url).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(String(e)));
  }, [account]);

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!data) return (
    <div className="space-y-6"><BalanceSkeleton /><div className="rounded-lg border border-border p-5"><OwnerListSkeleton /></div></div>
  );

  const youAreOwner = data.owners.some((o) => o.isYou);
  return (
    <div className="space-y-6">
      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Reserve" value={eur(data.euroTotal)} />
        <Stat label="Mitsignierer" value={String(data.ownerCount)} />
        <Stat label="Freigaben nötig" value={`${data.threshold} von ${data.ownerCount}`} />
        <Stat label="Transaktionen" value={String(data.nonce)} />
      </div>

      {/* Holdings */}
      <div className="rounded-lg border border-border p-5">
        <p className="text-sm font-medium mb-3">Guthaben</p>
        <ul className="space-y-2">
          {data.assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span>{a.label}{!a.redeemable && <span className="ml-2 text-xs text-muted-foreground">(nicht in € einlösbar)</span>}</span>
              <span className="text-right">
                <span className="font-medium">{num(a.amount)}</span>
                {a.eur != null && <span className="text-muted-foreground"> · {eur(a.eur)}{a.sharePct != null ? ` · ${num(a.sharePct, 0)}%` : ""}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-medium">
          <span>€-Reserve gesamt</span><span>{eur(data.euroTotal)}</span>
        </div>
      </div>

      {/* Owners */}
      <div className="rounded-lg border border-border p-5">
        <p className="text-sm font-medium mb-3">Mitsignierer ({data.owners.length})</p>
        <ul className="space-y-3">
          {data.owners.map((o) => (
            <li key={o.address} className="flex items-center justify-between gap-3">
              <MemberRow m={o} />
              <span className="text-xs text-muted-foreground font-mono shrink-0">{o.short}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground mt-4">Aktuell genügen <strong>{data.threshold}</strong> von {data.ownerCount} Freigaben für eine Auszahlung.</p>
        {data.threshold < 2 && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">Sicherheitshinweis: Aktuell kann eine einzelne Person allein Geld bewegen. Erhöhe die Freigabe-Schwelle unter „Mitglieder" auf mindestens 2.</div>
        )}
        {youAreOwner && <p className="mt-2 text-xs text-[#00498B]">Du bist Mitsignierer.</p>}
      </div>

      {/* Safe meta */}
      <p className="text-xs text-muted-foreground">
        Safe {data.safeVersion} ·{" "}
        <a className="hover:underline" href={`https://gnosisscan.io/address/${data.safeAddress}`} target="_blank" rel="noreferrer">auf Gnosisscan ansehen</a>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "Uebersicht" || echo "NO ERRORS"` → Expected `NO ERRORS`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Uebersicht.tsx
git commit -m "feat(web): GK Übersicht — stats, holdings breakdown, citizen owners, skeletons" -- apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Uebersicht.tsx
```

---

### Task 6: Mitglieder — citizen MemberRow + skeletons

**Files:**
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Mitglieder.tsx`

**Interfaces:**
- Consumes: `GET /api/gemeinschaftskasse/overview` (owners carry avatar/username/verified), `MemberRow` (Task 4), `OwnerListSkeleton` (Task 4). Keep existing add/remove/threshold actions + `useIsOwner` gating + `buildAddOwner`/`buildRemoveOwner`/`buildChangeThreshold` + `useProposeMetaTx`.

- [ ] **Step 1: Update the owner list rendering + loading state**

Read the current file. Replace the owner-row name/address rendering with `<MemberRow m={owner} />` (owner objects now have `avatarUrl`/`username`/`verified`). Replace the "Lädt…" loading text with `<OwnerListSkeleton />`. Keep all action handlers, the `ownerAddresses` list passed to `buildRemoveOwner`, the threshold input, and the non-owner gating unchanged. The per-owner "Entfernen" button stays beside each `MemberRow`.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "Mitglieder" || echo "NO ERRORS"` → Expected `NO ERRORS`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Mitglieder.tsx
git commit -m "feat(web): GK Mitglieder — citizen avatars/usernames + skeletons" -- apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Mitglieder.tsx
```

---

### Task 7: Verlauf + PendingQueue — rich rows, Gnosisscan, signer avatars, skeletons

**Files:**
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Verlauf.tsx`
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx`

**Interfaces:**
- Consumes: `GET /api/gemeinschaftskasse/history` + `/pending` → `{ items: TxView[] }` with `date`, `transactionHash`, `amount`, `assetLabel`, `counterparty`, `signers: TxSigner[]`; `HistorySkeleton` (Task 4); `Avatar` for signer stacks.

- [ ] **Step 1: Rewrite `Verlauf.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink } from "lucide-react";
import { HistorySkeleton } from "./skeletons";
import { initials } from "./MemberRow";

interface Signer { address: string; name: string; avatarUrl: string | null }
interface Tx { safeTxHash: string; title: string; date: string | null; transactionHash: string | null; signers: Signer[]; counterparty: { name: string; avatarUrl: string | null } | null }

export function Verlauf() {
  const [items, setItems] = useState<Tx[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/gemeinschaftskasse/history").then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items))).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!items) return <HistorySkeleton />;
  if (!items.length) return <p className="text-sm text-muted-foreground">Noch keine Vorgänge.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((t) => (
        <li key={t.safeTxHash} className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm truncate">{t.title}</p>
            <div className="flex items-center gap-2 mt-1">
              {t.date && <span className="text-xs text-muted-foreground">{new Date(t.date).toLocaleString("de-DE")}</span>}
              {t.signers.length > 0 && (
                <span className="flex -space-x-1.5">
                  {t.signers.slice(0, 4).map((s) => (
                    <Avatar key={s.address} className="h-5 w-5 border border-background">
                      {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                      <AvatarFallback className="text-[9px]">{initials(s.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                </span>
              )}
            </div>
          </div>
          {t.transactionHash && (
            <a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0" href={`https://gnosisscan.io/tx/${t.transactionHash}`} target="_blank" rel="noreferrer">
              Gnosisscan <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Update `PendingQueue.tsx` rendering + loading**

Read the current file. Replace the loading text with `<HistorySkeleton />`. For each pending item, render `t.title`, `approvalLabel(t.confirmations, t.threshold)`, and a signer avatar stack (same pattern as Verlauf, using `t.signers` which is now `TxSigner[]` — update any code that treated `signers` as `string[]`). Keep the Freigeben/Ausführen buttons, `isOwner` gating, and per-item error handling unchanged.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "Verlauf\|PendingQueue" || echo "NO ERRORS"` → Expected `NO ERRORS`.

- [ ] **Step 4: Commit + push**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Verlauf.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx
git commit -m "feat(web): GK Verlauf + PendingQueue — dates, Gnosisscan links, signer avatars, skeletons" -- apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Verlauf.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx
git push
```

---

## Self-review against the spec

- **Citizen profiles (users table) for owners/signers/counterparties** → Tasks 1, 2, 3 (+ rendered in 5, 6, 7). ✓
- **Compact member row (avatar+name+@username+verified)** → Task 4 `MemberRow`, used in 5/6. ✓
- **Holding assets (xDAI/EURe/Röbel-Münzen, € + share + total)** → Tasks 2 (data) + 5 (UI). ✓
- **Rich history (date, Gnosisscan via transactionHash, signers, type, amount, counterparty)** → Tasks 3 + 7. ✓
- **Header stats (reserve, owners, threshold, tx count, Safe addr→Gnosisscan, version)** → Tasks 2 + 5. ✓
- **Skeleton loaders everywhere** → Task 4 + applied in 5/6/7. ✓
- **All new reads server-side; no @safe-global/Supabase key in client** → citizens/safe-reads/describe are server-only; client components only fetch routes. ✓
- **German, no CRC, never raw 0x primary** → enforced in resolver (name fallback) + every UI task. ✓

**External contracts to confirm during implementation (record in commits):**
1. `resolveIdentities` return shape (`{name, avatarUrl, source}`) — confirmed in identity.ts (Task 1 fallback).
2. api-kit v5 `SafeMultisigTransactionResponse` has `transactionHash` + `executionDate` (Task 3).
3. `users.wallet_address` lowercase storage — confirmed live; `.in("wallet_address", uniq)` with lowercase `uniq` (Task 1).

## Controller verification (after build, before merge)

- Server-side integration check (like the Phase-1 check) against the live Safe + Supabase: confirm overview returns owners with avatarUrl/username/verified + assets; confirm history items carry `transactionHash` + `date` + resolved signer names.
- Browser smoke: owners show real avatars/names/verified; holdings card renders; Verlauf shows dates + working Gnosisscan links; skeletons appear on load.
