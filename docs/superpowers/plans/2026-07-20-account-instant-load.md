# Account Instant-Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Account identity, verification, and permission state hydrate instantly from disk on cold start — the whole app gates on this state, so it must never sit on spinners/false-negatives while chain/network reads resolve. Also fix a latent bug where citizens can be spuriously tier-downgraded during the verification loading window.

**Architecture:** Extend the established optimistic-cache pattern (`lib/user-cache.ts` / `lib/account-cache.ts`: hydrate at mount with prev-guards, reconcile when authoritative data lands, clear on logout) to the three signals that still start empty every boot: (A1) on-chain verification flags + verification requests, (A2) `roleInActiveAccount`, (A3) posting-permission status. A1 also moves the two NFT reads off the rate-limit-prone hosted thirdweb RPC onto the pinned public Gnosis RPC, and gates the tier auto-DOWNGRADE on a confirmed on-chain read (never on loading/cached state).

**Tech Stack:** AsyncStorage caches (same shape as existing ones), thirdweb v5 readContract, existing `gnosisRead` chain handle (`constants/gnosis.ts`).

## Global Constraints

- pnpm; StyleSheet+useTheme; German UI unchanged; never show raw wallet addresses.
- Pathspec-only commits; user has unrelated dirty files (apps/expo/app.json, scratch-*.json) — never stage them. Push after every commit.
- USER DIRECTIVE (standing): skip typecheck/lint; commit and push immediately when edits are done.
- All paths relative to `apps/expo/`.
- Cache-hydration pattern rules (established in this repo): apply cached values only via prev-guards (`prev ?? cached` / keep prev when non-empty), never overwrite fresher data, clear on genuine logout (`autoConnectFinished && !account`), all AsyncStorage ops try/catch non-fatal.

---

### Task A1: Verification cache + pinned RPC + downgrade guard

**Files:**
- Create: `lib/verification-cache.ts`
- Modify: `context/VerificationContext.tsx`
- Modify: `constants/verification-contracts.ts` (add read-variant contracts on `gnosisRead`) — read it first; if contracts are built with `getContract({ chain: gnosis, ... })`, add parallel exports using `gnosisRead` from `@/constants/gnosis` and use those for the two `hasCitizenNFT`/`hasAttesterNFT` reads only (writes keep the hosted chain handle).
- Modify: `context/UserContext.tsx` (downgrade guard only)

**Interfaces:**
- Produces: `loadCachedVerification(): Promise<CachedVerification | null>`, `saveCachedVerification(v: CachedVerification)`, `clearCachedVerification()` where `CachedVerification = { walletAddress: string; hasCitizenNFT: boolean; hasAttesterNFT: boolean; userRequests: unknown[]; savedAt: number }` (type the requests array with the context's existing request type).
- VerificationContext additionally exposes `chainResolved: boolean` — true only after a real on-chain read for the CURRENT address completed successfully.

- [ ] **Step 1: verification-cache.ts** — mirror `lib/account-cache.ts` exactly (shape validation: `typeof walletAddress === 'string'`, booleans, `Array.isArray(userRequests)`; single key `@cached_verification`; try/catch non-fatal on all three functions).

- [ ] **Step 2: VerificationContext hydration + persistence + clear.**
  - On mount (one-shot effect): `loadCachedVerification()`; if found, apply via functional set with prev-guard (only apply when current state is still the initial "unknown" state), set the flags AND `userRequests`, and set `nftStatus.isLoading` to **false** (the cached value IS the display state; the authoritative refresh continues in background). Do NOT set `chainResolved`.
  - After a successful `refreshNFTStatus` WITH a non-null address: set `chainResolved = true` and `saveCachedVerification({ walletAddress: address, hasCitizenNFT, hasAttesterNFT, userRequests: <current>, savedAt: Date.now() })` (also persist after `refreshRequests` resolves, same bundle).
  - Wallet mismatch safety: when the thirdweb `account.address` RESOLVES and differs from the cached `walletAddress` (case-insensitive), immediately reset flags to false/loading before the real read (prevents cross-wallet leakage on a shared device).
  - Logout: import `useWalletBoot`; when `autoConnectFinished && !account?.address` → reset state to initial AND `clearCachedVerification()`.
- [ ] **Step 3: pinned RPC for the two reads** — the `hasCitizenNFT`/`hasAttesterNFT` `readContract` calls use the new `gnosisRead`-based contract handles (hosted RPC is intermittently rate-limited on preview builds per `constants/thirdweb.ts` comments; the pinned public RPC is what MACI scans already use for reliability).
- [ ] **Step 4: UserContext downgrade guard.** The auto-downgrade effect (`!hasCitizenNFT && tier==='citizen' && is_verified_citizen` → `updateUserTier('tourist')`) currently fires during the loading window on every cold start — a spurious DB write reversed seconds later, and the likely cause of the known `is_verified_citizen` column drift. Gate it: consume `chainResolved` from the verification context and add `if (!chainResolved) return;`-style condition to the DOWNGRADE branch only (the upgrade branch may keep firing on any true signal — upgrading on cached truth is harmless). Add a one-line comment stating downgrades require a confirmed on-chain read.
- [ ] **Step 5:** Commit + push:
```bash
git add apps/expo/lib/verification-cache.ts apps/expo/context/VerificationContext.tsx apps/expo/constants/verification-contracts.ts apps/expo/context/UserContext.tsx
git commit -m "feat(expo): instant verification state — cached NFT flags, pinned RPC reads, chain-confirmed downgrades"
git push
```

---

### Task A2: roleInActiveAccount cache

**Files:**
- Create: `lib/role-cache.ts`
- Modify: `context/AccountContext.tsx`

**Interfaces:** `loadCachedRole(accountId: string, wallet: string): Promise<AccountRole | null>`, `saveCachedRole(accountId: string, wallet: string, role: AccountRole | null)` — key `@cached_role_<accountId>_<lowercased wallet>`; import `AccountRole` type from `@/lib/supabase-account-roles`.

- [ ] **Step 1: role-cache.ts** — store `{ role, savedAt }` JSON; validate role is one of 'owner'|'admin'|'member'|null on load; try/catch non-fatal.
- [ ] **Step 2: AccountContext role effect** (the one calling `getAccountRole` on `[activeAccount?.id, walletAddress]`): before the network call, hydrate: `loadCachedRole(...)` applied via functional set ONLY while the current value is null and the same account is still active (guard with a local cancelled flag + activeAccount id check, mirroring the hydration effects elsewhere in the file). After `getAccountRole` resolves: `setRoleInActiveAccount(role)` (as today) + `void saveCachedRole(...)`. On disconnect (existing reset effect): no per-key sweep needed — stale role keys are inert (wallet in key), but DO clear the active one if trivially accessible; otherwise leave (keys are wallet-scoped, cross-user leak impossible).
- [ ] **Step 3:** Commit + push:
```bash
git add apps/expo/lib/role-cache.ts apps/expo/context/AccountContext.tsx
git commit -m "feat(expo): org role hydrates from cache — no more blocked-state flash on org screens"
git push
```

---

### Task A3: posting-permission cache

**Files:**
- Modify: `hooks/usePostingPermission.ts`
- Create: `lib/posting-permission-cache.ts`

**Interfaces:** `loadCachedPostingStatus(wallet: string)`, `saveCachedPostingStatus(wallet: string, status: <the hook's existing status payload type>)` — key `@cached_posting_status_<lowercased wallet>`.

- [ ] **Step 1:** Read the hook; identify its status payload type (result of the `get_posting_status` RPC) and loading semantics.
- [ ] **Step 2:** Cache module mirroring role-cache (store `{ status, savedAt }`; validate object shape loosely).
- [ ] **Step 3:** Hook: on mount with a wallet, hydrate cached status via prev-guard (only while still loading/undefined) so the composer's `PostingGate` renders instantly for returning tourists; RPC result overwrites + persists. Time-sensitive states (`rate_limited`, `account_too_young` carry unlock timestamps): when the cached status carries an unlock time already in the past, IGNORE the cached value (let the RPC decide) — never show a stale cooldown.
- [ ] **Step 4:** Commit + push:
```bash
git add apps/expo/hooks/usePostingPermission.ts apps/expo/lib/posting-permission-cache.ts
git commit -m "feat(expo): posting-permission status hydrates from cache with stale-cooldown guard"
git push
```

---

### Explicitly out of scope (future candidates)
- RewardsContext / RoebelTalerProvider balance persistence (display data, not permissions).
- GnosisWalletProvider autoConnect parallelization.
- XMTP boot acceleration.
