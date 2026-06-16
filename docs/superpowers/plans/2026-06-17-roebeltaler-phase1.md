# Röbeltaler Phase 1 + Spikes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a thin, end-to-end, collateral-backed Röbeltaler (Circles v2 group currency) for a pilot cohort on Gnosis Chain — verified citizen → register human → accrue personal CRC → mint Röbeltaler → send to a neighbour — with seedless/gasless UX preserved.

**Architecture:** Single chain (Gnosis, chain 100). Identity (`CitizenNFT`) is assumed already migrated to Gnosis (Phase 0, separate plan) — this plan treats "Phase 0 complete" as a precondition but its spikes/data tasks run now against throwaway Gnosis accounts. Citizenship gating is **on-chain** in the group's membership condition; there is **no backend bridge**. The Circles protocol (Hub v2, Base Mint Policy, Standard Treasury) is consumed via the `@circles-sdk/sdk` package — never deployed by us. App code lives in `apps/expo`; one-time on-chain setup lives in runnable scripts + a runbook.

**Tech Stack:** Expo/React Native (StyleSheet + `useTheme()`), thirdweb v5 (login + AA, now also chain 100), Safe smart accounts (Circles convention), `@circles-sdk/sdk` + `@circles-sdk/data`, Supabase (Postgres), Gnosis Chain.

**Spec:** [`docs/superpowers/specs/2026-06-17-roebeltaler-circles-group-currency-design.md`](../specs/2026-06-17-roebeltaler-circles-group-currency-design.md)

> **⚠️ Phase A (Tasks 1–6) is a hard gate.** The Circles SDK call surface, the Safe-vs-4337 avatar question, the fee/fungibility tradeoff, and the immutable mint-policy choice are genuine unknowns. Phase A resolves them and **records validated reference snippets** in `docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md`. Phase B tasks consume those recorded snippets by name. Do **not** start Phase B until the Phase A decision gate (end of Task 6) passes.

---

## File Structure

**New — scripts & docs (run-once / discovery):**
- `scripts/circles/` — standalone TS scripts (run with `tsx`), throwaway-account spikes + the one-time group-setup runbook script.
  - `scripts/circles/spike-avatar-type.ts` — Task 1
  - `scripts/circles/spike-invite.ts` — Task 2
  - `scripts/circles/spike-paymaster.ts` — Task 3
  - `scripts/circles/spike-sdk-e2e.ts` — Task 4 (register → mint → transfer)
  - `scripts/circles/setup-roebeltaler-group.ts` — Task 9 (one-time, gated by Tasks 5+6 answers)
- `docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md` — the recorded findings + validated snippets (created Task 1, appended through Task 6).
- `docs/superpowers/runbooks/2026-06-17-roebeltaler-group-setup.md` — Task 9 operator runbook.

**New — app code (`apps/expo`):**
- `apps/expo/constants/gnosis.ts` — Gnosis chain + Circles/CitizenNFT-on-Gnosis addresses + contract handles (mirrors `constants/thirdweb.ts`).
- `apps/expo/lib/circles/client.ts` — thin wrapper that builds a configured `@circles-sdk/sdk` instance from the active Safe account.
- `apps/expo/lib/circles/roebeltaler.ts` — pure helpers (amount formatting, demurrage-aware display, group address constant, validation) — the unit-tested core.
- `apps/expo/context/GnosisWalletContext.tsx` — provisions/loads the user's Gnosis Safe smart account; exposes address + ready flag.
- `apps/expo/context/RoebeltalerContext.tsx` — registration status, balances (live), join/mint/send actions.
- `apps/expo/lib/supabase-roebeltaler.ts` — read/write the new Supabase state.
- `apps/expo/app/roebeltaler/index.tsx` — the screen (reskins `app/roebel-card/index.tsx` patterns).
- `apps/expo/app/roebeltaler/_components/` — Join / Mint / Send / Balance UI pieces.

**Modify:**
- `apps/expo/constants/thirdweb.ts` — export a shared `client` already done; add nothing here unless Task 7 needs it.
- `apps/expo/app/_layout.tsx` — mount `GnosisWalletProvider` + `RoebeltalerProvider` (after `WalletBootProvider`, near `VerificationProvider`).
- `apps/expo/package.json` — add `@circles-sdk/sdk`, `@circles-sdk/data`; dev: `tsx`.
- New Supabase migration: `apps/expo/supabase/migrations/roebeltaler_pilot_state.sql`.

---

# PHASE A — Spikes (resolve unknowns, record snippets)

Each spike task: run a script against **real Gnosis with throwaway accounts**, then **write the finding** (answer + the exact, working snippet) into the spikes doc. The "test" for a spike is: the script runs and the finding is recorded with a definitive answer.

### Task 1: Spike — Safe vs thirdweb-4337 as a Circles human avatar (GATING)

**Files:**
- Create: `docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md`
- Create: `scripts/circles/spike-avatar-type.ts`
- Modify: `package.json` (add `@circles-sdk/sdk`, `@circles-sdk/data`, dev `tsx`)

- [ ] **Step 1: Add dependencies**

Run:
```bash
pnpm add -w @circles-sdk/sdk @circles-sdk/data
pnpm add -wD tsx
```
Expected: both resolve and install; lockfile updates.

- [ ] **Step 2: Create the spikes doc with a results table**

Create `docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md`:
```markdown
# Röbeltaler Spikes — Findings (2026-06-17)

Run against real Gnosis (chain 100) with throwaway accounts. Each section records
the ANSWER and the exact validated snippet the build phase will consume.

| # | Question | Answer | Snippet anchor |
|---|----------|--------|----------------|
| 1 | Safe vs 4337 as Circles human avatar | _pending_ | — |
| 2 | Invite mechanics & per-invite CRC cost | _pending_ | — |
| 3 | thirdweb paymaster on Gnosis (chain 100) | _pending_ | — |
| 4 | SDK register→mint→transfer; pathfinder needed? | _pending_ | — |
| 5 | Mint-policy fee + inter-group fungibility | _pending_ | — |
| 6 | Phase 0 migration dry-run sizing | _pending_ | — |

## Spike 1 — avatar type
_pending_
```

- [ ] **Step 3: Write the avatar-type probe script**

Create `scripts/circles/spike-avatar-type.ts`. Attempt human registration from (a) a Safe smart account and (b) a plain thirdweb-style EOA-controlled 4337 account, and record which the Circles Hub accepts. Use a funded throwaway private key from env `SPIKE_PRIVKEY` and a Gnosis RPC from `GNOSIS_RPC_URL`.
```ts
// scripts/circles/spike-avatar-type.ts
// Goal: determine which smart-account type the Circles v2 Hub accepts as a HUMAN avatar.
// Record the working path (constructor args, registration call) in the spikes doc.
import { Sdk } from "@circles-sdk/sdk";

async function main() {
  const rpc = process.env.GNOSIS_RPC_URL!;
  const pk = process.env.SPIKE_PRIVKEY!;
  if (!rpc || !pk) throw new Error("Set GNOSIS_RPC_URL and SPIKE_PRIVKEY");

  // NOTE: the exact Sdk construction (signer/runner, contract config) is what we are
  // pinning here. Try the documented Gnosis chain config first, then a Safe-backed signer.
  // Print every step so we can copy the working sequence verbatim into the spikes doc.
  console.log("RPC:", rpc.replace(/\/\/.*@/, "//***@"));
  // ... attempt 1: register human from a Safe-controlled signer
  // ... attempt 2: register human from an EOA/4337-style signer
  // Log success/failure + revert reasons for each.
}

main().catch((e) => { console.error("SPIKE FAILED:", e); process.exit(1); });
```

- [ ] **Step 4: Run the probe**

Run:
```bash
GNOSIS_RPC_URL=... SPIKE_PRIVKEY=... pnpm tsx scripts/circles/spike-avatar-type.ts
```
Expected: one path registers a human avatar successfully; the other's failure reason is captured.

- [ ] **Step 5: Record the finding**

Update the spikes doc Spike 1 section + table row with: the accepted account type (hypothesis: **Safe**), the exact `Sdk` construction that worked, and the registration call. This snippet becomes **`SNIPPET:avatar-init`**, consumed by Task 8/10.

- [ ] **Step 6: Commit**
```bash
git add package.json pnpm-lock.yaml scripts/circles/spike-avatar-type.ts docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md
git commit -m "spike(circles): determine Safe vs 4337 human-avatar type on Gnosis"
```

### Task 2: Spike — invite mechanics & cost

**Files:** Create `scripts/circles/spike-invite.ts`; Modify the spikes doc.

- [ ] **Step 1: Write the invite probe**

Create `scripts/circles/spike-invite.ts`: from an already-registered human (the Task 1 account), invite a fresh throwaway address; measure CRC burned and whether the invitee can then register. Also test whether any bootstrap "no-invite" path still applies.
```ts
// scripts/circles/spike-invite.ts
// Goal: confirm the invite flow, per-invite CRC cost, and whether a no-invite
// registration path exists. Record numbers for sizing the operator avatar.
import { Sdk } from "@circles-sdk/sdk";
async function main() {
  // reuse SNIPPET:avatar-init from spike 1 to load the inviter avatar
  // 1. read inviter CRC balance
  // 2. invite a fresh address; read balance delta -> per-invite cost
  // 3. register the invited human; confirm success
  // 4. separately, attempt register WITHOUT invite; record whether it reverts
}
main().catch((e) => { console.error("SPIKE FAILED:", e); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run: `GNOSIS_RPC_URL=... SPIKE_PRIVKEY=... pnpm tsx scripts/circles/spike-invite.ts`
Expected: prints per-invite CRC cost and invite-vs-no-invite outcome.

- [ ] **Step 3: Record finding** — spikes doc Spike 2 + table: invite required? cost per invite? → sizes operator-avatar CRC funding (spec §5.4 / §11). Snippet **`SNIPPET:invite`**.

- [ ] **Step 4: Commit**
```bash
git add scripts/circles/spike-invite.ts docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md
git commit -m "spike(circles): invite mechanics + per-invite CRC cost"
```

### Task 3: Spike — thirdweb paymaster on Gnosis (chain 100)

**Files:** Create `scripts/circles/spike-paymaster.ts`; Modify the spikes doc.

- [ ] **Step 1: Probe sponsorship.** Create `scripts/circles/spike-paymaster.ts` that builds a thirdweb smart account on `defineChain(100)` and attempts one sponsored (gasless) transaction; on failure, attempt the same tx with self-funded gas.
```ts
// scripts/circles/spike-paymaster.ts
// Goal: confirm thirdweb paymaster sponsors txs on Gnosis chain 100.
// Fallback decision: if unsupported, record "fund accounts directly" path.
import { createThirdwebClient, getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { defineChain } from "thirdweb/chains";
// build smart account on chain 100, send a trivial tx (e.g. self-call), observe sponsorship.
```

- [ ] **Step 2: Run** — `THIRDWEB_SECRET_KEY=... pnpm tsx scripts/circles/spike-paymaster.ts`. Expected: tx mined; logs whether gas was sponsored.

- [ ] **Step 3: Record** — spikes doc Spike 3 + table: sponsored yes/no; if no, the funded-accounts fallback (spec §9). Snippet **`SNIPPET:gnosis-aa`** (the chain-100 smart-account construction).

- [ ] **Step 4: Commit**
```bash
git add scripts/circles/spike-paymaster.ts docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md
git commit -m "spike(aa): thirdweb paymaster support on Gnosis chain 100"
```

### Task 4: Spike — Circles SDK end-to-end (register → mint → transfer); pathfinder?

**Files:** Create `scripts/circles/spike-sdk-e2e.ts`; Modify the spikes doc.

- [ ] **Step 1: Write the e2e probe.** Register a throwaway group (temporary, for testing only), make two human avatars members, mint group tokens from deposited pCRC, transfer between the two members, and record **whether an intra-group send is a plain ERC-20 transfer or must route through the Circles flow-matrix/pathfinder** (spec §5.7).
```ts
// scripts/circles/spike-sdk-e2e.ts
// Goal: lock the exact SDK calls for registerGroup, group membership/trust,
// groupMint (deposit pCRC -> gCRC), and member->member transfer.
// CRITICAL: determine if member->member needs pathfinder or plain transfer.
import { Sdk } from "@circles-sdk/sdk";
async function main() {
  // A. register throwaway group (record call) -> SNIPPET:group-register
  // B. two members trust group / group trusts members -> SNIPPET:trust
  // C. each member personalMint, then groupMint deposit -> SNIPPET:mint
  // D. member1 -> member2 transfer; try plain transfer first, pathfinder if it fails -> SNIPPET:transfer
  // E. read balances before/after; confirm arrival -> SNIPPET:balance
}
main().catch((e) => { console.error("SPIKE FAILED:", e); process.exit(1); });
```

- [ ] **Step 2: Run** — `GNOSIS_RPC_URL=... SPIKE_PRIVKEY=... pnpm tsx scripts/circles/spike-sdk-e2e.ts`. Expected: balances confirm a successful member→member transfer.

- [ ] **Step 3: Record** — spikes doc Spike 4 + table: the five snippets above + the pathfinder yes/no answer. These are the **core build-phase reference snippets**.

- [ ] **Step 4: Commit**
```bash
git add scripts/circles/spike-sdk-e2e.ts docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md
git commit -m "spike(circles): SDK e2e register/mint/transfer + pathfinder decision"
```

### Task 5: Spike — mint-policy fee & inter-group fungibility (Circles-team questions)

**Files:** Modify the spikes doc only (this is a research/Q&A task; you are at the conference).

- [ ] **Step 1: Get authoritative answers** to spec §10.5 from the Circles/Gnosis team or docs:
  - Does a custom or fee-bearing mint policy lose transitive fungibility with other Circles groups? Is there a fungibility-preserving path (e.g. BaseTreasury-as-vertex)?
  - Does the **standard** Base Mint Policy expose a configurable fee, or is a thin custom policy needed — and does that stay "standard enough"?
  - Demurrage: pure decay vs any capture/redistribution (confirms spec §6).

- [ ] **Step 2: Record the decision** in spikes doc Spike 5 + table: **which mint policy the group will register with** (standard, configured-fee-0, vs thin custom), and the fungibility consequence. This is the input to the **immutable** Task 9 registration.

- [ ] **Step 3: Commit**
```bash
git add docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md
git commit -m "spike(circles): mint-policy fee + inter-group fungibility decision"
```

### Task 6: Spike — Phase 0 migration dry-run sizing + DECISION GATE

**Files:** Modify the spikes doc.

- [ ] **Step 1: Dry-run** re-issuing one soulbound `CitizenNFT` on Gnosis to a test account, and confirm the `hasCitizenNFT(addr)` read works from a Gnosis RPC (this is exactly what the on-chain membership condition will call, spec §5.2). Note: the full MACI redeploy + Shamir re-ceremony is the **separate Phase 0 plan** — here we only size it and validate the CitizenNFT read path the Röbeltaler depends on.

- [ ] **Step 2: Record** spikes doc Spike 6 + table: the Gnosis `CitizenNFT` address (test), the working `hasCitizenNFT` read snippet **`SNIPPET:citizen-read`**, and a rough Phase 0 effort estimate.

- [ ] **Step 3: DECISION GATE — fill the gate block and stop if any blocker is open:**
```markdown
## DECISION GATE (end of Phase A)
- [ ] Avatar type chosen (Task 1): ______
- [ ] Invite cost known + operator funding sized (Task 2): ______
- [ ] Gas path chosen (Task 3): sponsored | funded-accounts
- [ ] SDK snippets locked + pathfinder decision (Task 4): plain | pathfinder
- [ ] Mint policy chosen — IMMUTABLE once Task 9 runs (Task 5): ______
- [ ] CitizenNFT-on-Gnosis read validated (Task 6): ______
GATE PASSED? (yes/no)
```

- [ ] **Step 4: Commit**
```bash
git add docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md
git commit -m "spike: Phase 0 dry-run sizing + Phase A decision gate"
```

---

# PHASE B — Build the vertical slice (gated on Phase A)

Phase B consumes the recorded `SNIPPET:*` anchors from the spikes doc. Where a step says "use `SNIPPET:x`", paste the exact validated code from the spikes doc — it is a real, defined artifact, not a placeholder.

### Task 7: Supabase pilot state

**Files:**
- Create: `apps/expo/supabase/migrations/roebeltaler_pilot_state.sql`
- Create: `apps/expo/lib/supabase-roebeltaler.ts`
- Test: `apps/expo/lib/__tests__/supabase-roebeltaler.test.ts`

- [ ] **Step 1: Write the migration**

Create `apps/expo/supabase/migrations/roebeltaler_pilot_state.sql`:
```sql
-- Röbeltaler pilot state. Does NOT touch roebel_points_card / roebel_points_ledger.
create table if not exists roebeltaler_members (
  wallet_address    text primary key,              -- the user's Base/login wallet (existing id)
  gnosis_address    text not null,                 -- derived Gnosis Safe smart-account address
  circles_status    text not null default 'none',  -- none | invited | registered
  group_member      boolean not null default false,
  pilot_cohort      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists roebeltaler_members_gnosis_uidx
  on roebeltaler_members (gnosis_address);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the Supabase MCP `apply_migration` tool (name `roebeltaler_pilot_state`) with the SQL above. (Per repo policy, use the Supabase MCP, not raw CLI.)
Expected: migration applies; `list_tables` shows `roebeltaler_members`.

- [ ] **Step 3: Write the failing test for the data helper**

Create `apps/expo/lib/__tests__/supabase-roebeltaler.test.ts`:
```ts
import { upsertMemberPatch } from "../supabase-roebeltaler";

test("upsertMemberPatch builds a patch with updated_at and required keys", () => {
  const patch = upsertMemberPatch("0xUser", { gnosis_address: "0xGnosis", circles_status: "invited" });
  expect(patch.wallet_address).toBe("0xUser");
  expect(patch.gnosis_address).toBe("0xGnosis");
  expect(patch.circles_status).toBe("invited");
  expect(typeof patch.updated_at).toBe("string");
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm --filter expo test supabase-roebeltaler`
Expected: FAIL — `upsertMemberPatch` not defined.

- [ ] **Step 5: Implement the helper**

Create `apps/expo/lib/supabase-roebeltaler.ts`:
```ts
import { supabase } from "@/lib/supabase"; // existing client export

export type CirclesStatus = "none" | "invited" | "registered";
export interface MemberPatch {
  wallet_address: string;
  gnosis_address?: string;
  circles_status?: CirclesStatus;
  group_member?: boolean;
  pilot_cohort?: boolean;
  updated_at: string;
}

export function upsertMemberPatch(
  walletAddress: string,
  fields: Partial<Omit<MemberPatch, "wallet_address" | "updated_at">>,
): MemberPatch {
  return { wallet_address: walletAddress, ...fields, updated_at: new Date().toISOString() };
}

export async function saveMember(patch: MemberPatch) {
  return supabase.from("roebeltaler_members").upsert(patch, { onConflict: "wallet_address" });
}

export async function getMember(walletAddress: string) {
  return supabase.from("roebeltaler_members").select("*").eq("wallet_address", walletAddress).maybeSingle();
}
```

- [ ] **Step 6: Run it, verify it passes**

Run: `pnpm --filter expo test supabase-roebeltaler`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add apps/expo/supabase/migrations/roebeltaler_pilot_state.sql apps/expo/lib/supabase-roebeltaler.ts apps/expo/lib/__tests__/supabase-roebeltaler.test.ts
git commit -m "feat(roebeltaler): pilot-state table + data helpers"
```

### Task 8: Gnosis constants + pure Röbeltaler helpers

**Files:**
- Create: `apps/expo/constants/gnosis.ts`
- Create: `apps/expo/lib/circles/roebeltaler.ts`
- Test: `apps/expo/lib/circles/__tests__/roebeltaler.test.ts`

- [ ] **Step 1: Add Gnosis constants**

Create `apps/expo/constants/gnosis.ts` (mirrors `constants/thirdweb.ts`; fill the two addresses from `SNIPPET:citizen-read` and Spike 4/5 group address once Task 9 runs — until then use env with a clearly-named placeholder env var, NOT a hardcoded fake):
```ts
import { getContract } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { client } from "@/constants/thirdweb";

export const gnosis = defineChain(100);
const GNOSIS_READ_RPC = process.env.EXPO_PUBLIC_GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
export const gnosisRead = defineChain({ ...gnosis, rpc: GNOSIS_READ_RPC });

// CitizenNFT re-deployed on Gnosis in Phase 0 (see spikes SNIPPET:citizen-read).
export const citizenNFTGnosisAddress = process.env.EXPO_PUBLIC_CITIZEN_NFT_GNOSIS || "";
// Röbeltaler group address, set after the one-time Task 9 registration.
export const roebeltalerGroupAddress = process.env.EXPO_PUBLIC_ROEBELTALER_GROUP || "";

export const citizenNFTGnosisContract = () =>
  getContract({ client, address: citizenNFTGnosisAddress, chain: gnosisRead });
```

- [ ] **Step 2: Failing test for pure helpers**

Create `apps/expo/lib/circles/__tests__/roebeltaler.test.ts`:
```ts
import { canMint, formatRoebeltaler } from "../roebeltaler";

test("canMint requires positive amount within available pCRC", () => {
  expect(canMint(0, 10)).toBe(false);
  expect(canMint(5, 10)).toBe(true);
  expect(canMint(11, 10)).toBe(false);
});

test("formatRoebeltaler renders 2 decimals with suffix", () => {
  expect(formatRoebeltaler(12.3456)).toBe("12.35 Röbeltaler");
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter expo test roebeltaler`
Expected: FAIL — not defined.

- [ ] **Step 4: Implement pure helpers**

Create `apps/expo/lib/circles/roebeltaler.ts`:
```ts
/** Pure, unit-tested core. No SDK/network here. */
export function canMint(amount: number, availablePersonalCrc: number): boolean {
  return amount > 0 && amount <= availablePersonalCrc;
}

export function formatRoebeltaler(amount: number): string {
  return `${amount.toFixed(2)} Röbeltaler`;
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter expo test roebeltaler`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add apps/expo/constants/gnosis.ts apps/expo/lib/circles/roebeltaler.ts apps/expo/lib/circles/__tests__/roebeltaler.test.ts
git commit -m "feat(roebeltaler): gnosis constants + pure helpers"
```

### Task 9: One-time Röbeltaler group setup (runbook + script)

**Files:**
- Create: `scripts/circles/setup-roebeltaler-group.ts`
- Create: `docs/superpowers/runbooks/2026-06-17-roebeltaler-group-setup.md`

> Gated by Task 5 (mint-policy choice — IMMUTABLE) and Task 6 gate. Run by an operator with the burner wallet, then ownership handed to the 3-of-5 Attester Safe.

- [ ] **Step 1: Write the setup script** using `SNIPPET:group-register` from Spike 4 and the policy decision from Spike 5. Sets name "Röbeltaler" / on-chain symbol `ROBELTALER` (base58/ASCII, ≤12 chars — "ö" is invalid), and `fee-collection-address = Stadt-Safe` with pilot rate 0.
```ts
// scripts/circles/setup-roebeltaler-group.ts
// ONE-TIME. Registers the Röbeltaler group with the policy chosen in Spike 5.
// Inputs (env): BURNER_PRIVKEY, GNOSIS_RPC_URL, STADT_SAFE_ADDR, ATTESTER_SAFE_ADDR.
// 1. register group (SNIPPET:group-register) with membership condition reading
//    citizenNFTGnosisAddress (SNIPPET:citizen-read).
// 2. set fee-collection-address = STADT_SAFE_ADDR, fee = 0.
// 3. transfer group ownership/admin to ATTESTER_SAFE_ADDR (3-of-5).
// 4. print the new group address -> set EXPO_PUBLIC_ROEBELTALER_GROUP.
```

- [ ] **Step 2: Write the runbook** `docs/superpowers/runbooks/2026-06-17-roebeltaler-group-setup.md` documenting: prerequisites (gate passed, Safe deployed), the exact env vars, the command, the verification reads, and the post-run config update (`EXPO_PUBLIC_ROEBELTALER_GROUP`, `EXPO_PUBLIC_CITIZEN_NFT_GNOSIS`).

- [ ] **Step 3: Execute (operator)** on real Gnosis. Run:
```bash
BURNER_PRIVKEY=... GNOSIS_RPC_URL=... STADT_SAFE_ADDR=... ATTESTER_SAFE_ADDR=... \
  pnpm tsx scripts/circles/setup-roebeltaler-group.ts
```
Expected: prints the group address; ownership now the Attester Safe.

- [ ] **Step 4: Record + commit** the group address into the runbook and the env example.
```bash
git add scripts/circles/setup-roebeltaler-group.ts docs/superpowers/runbooks/2026-06-17-roebeltaler-group-setup.md
git commit -m "feat(roebeltaler): one-time group setup script + runbook"
```

### Task 10: Gnosis wallet provider (Safe smart account)

**Files:**
- Create: `apps/expo/context/GnosisWalletContext.tsx`
- Create: `apps/expo/lib/circles/client.ts`
- Modify: `apps/expo/app/_layout.tsx`
- Test: `apps/expo/context/__tests__/gnosis-wallet.test.ts`

- [ ] **Step 1: Failing test for address derivation/persistence logic**

Create `apps/expo/context/__tests__/gnosis-wallet.test.ts` testing a pure `deriveGnosisPatch` that produces the Supabase patch when a Gnosis address becomes available:
```ts
import { deriveGnosisPatch } from "../GnosisWalletContext";
test("deriveGnosisPatch records gnosis_address against the login wallet", () => {
  const p = deriveGnosisPatch("0xLogin", "0xGnosisSafe");
  expect(p.wallet_address).toBe("0xLogin");
  expect(p.gnosis_address).toBe("0xGnosisSafe");
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter expo test gnosis-wallet` → FAIL.

- [ ] **Step 3: Implement the provider** using `SNIPPET:gnosis-aa` (Spike 3) for the chain-100 Safe smart-account construction and `SNIPPET:avatar-init` (Spike 1) for the account type. Provider provisions/loads the Safe account from the same login, exposes `{ gnosisAddress, ready }`, and persists via `saveMember(deriveGnosisPatch(...))`.
```tsx
// apps/expo/context/GnosisWalletContext.tsx (skeleton; AA construction = SNIPPET:gnosis-aa)
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { saveMember, upsertMemberPatch } from "@/lib/supabase-roebeltaler";

export function deriveGnosisPatch(loginWallet: string, gnosisAddress: string) {
  return upsertMemberPatch(loginWallet, { gnosis_address: gnosisAddress });
}

interface Ctx { gnosisAddress: string | null; ready: boolean; }
const GnosisWalletContext = createContext<Ctx | undefined>(undefined);

export function GnosisWalletProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const [gnosisAddress, setGnosisAddress] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!account?.address) return;
        // SNIPPET:gnosis-aa -> provision/load Safe smart account on chain 100 from this login
        const addr = await loadGnosisSafe(account); // implemented from SNIPPET:gnosis-aa
        if (cancelled) return;
        setGnosisAddress(addr);
        await saveMember(deriveGnosisPatch(account.address, addr));
      } finally { if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [account?.address]);
  const value = useMemo(() => ({ gnosisAddress, ready }), [gnosisAddress, ready]);
  return <GnosisWalletContext.Provider value={value}>{children}</GnosisWalletContext.Provider>;
}
export function useGnosisWallet() {
  const c = useContext(GnosisWalletContext);
  if (!c) throw new Error("useGnosisWallet must be used within GnosisWalletProvider");
  return c;
}
```
Create `apps/expo/lib/circles/client.ts` exporting `loadGnosisSafe(account)` and `makeCirclesSdk(account)` built from `SNIPPET:avatar-init`.

- [ ] **Step 4: Mount the provider** in `apps/expo/app/_layout.tsx` directly after `WalletBootProvider` (so auto-connect has run) and before `RoebeltalerProvider`. Match the existing provider-nesting style.

- [ ] **Step 5: Run, verify pass** — `pnpm --filter expo test gnosis-wallet` → PASS. Then `pnpm --filter expo tsc --noEmit` → no new type errors.

- [ ] **Step 6: Commit**
```bash
git add apps/expo/context/GnosisWalletContext.tsx apps/expo/lib/circles/client.ts apps/expo/app/_layout.tsx apps/expo/context/__tests__/gnosis-wallet.test.ts
git commit -m "feat(roebeltaler): Gnosis Safe smart-account provider"
```

### Task 11: Röbeltaler context — join, balances, mint, send

**Files:**
- Create: `apps/expo/context/RoebeltalerContext.tsx`
- Modify: `apps/expo/app/_layout.tsx` (mount provider after GnosisWalletProvider)
- Test: `apps/expo/context/__tests__/roebeltaler-context.test.ts`

- [ ] **Step 1: Failing test for join-eligibility gating logic** (pure):
```ts
import { joinEligibility } from "../RoebeltalerContext";
test("joinEligibility blocks non-citizens and requires a gnosis address", () => {
  expect(joinEligibility({ hasCitizenNFT: false, gnosisAddress: "0x1" }).canJoin).toBe(false);
  expect(joinEligibility({ hasCitizenNFT: true, gnosisAddress: null }).canJoin).toBe(false);
  expect(joinEligibility({ hasCitizenNFT: true, gnosisAddress: "0x1" }).canJoin).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter expo test roebeltaler-context` → FAIL.

- [ ] **Step 3: Implement the context.** Pure `joinEligibility` plus actions wired to the SDK: `join()` (reads `hasCitizenNFT` via `citizenNFTGnosisContract`, then operator invite `SNIPPET:invite` + register `SNIPPET:avatar-init`/personalMint `SNIPPET:mint`), `mint(amount)` (`SNIPPET:mint`, guarded by `canMint`), `send(to, amount)` (`SNIPPET:transfer` — plain or pathfinder per Spike 4), and `balances` read **live** every focus (`SNIPPET:balance`; never cache, per spec §11 demurrage).
```ts
export function joinEligibility(s: { hasCitizenNFT: boolean; gnosisAddress: string | null }) {
  return { canJoin: !!(s.hasCitizenNFT && s.gnosisAddress) };
}
```

- [ ] **Step 4: Mount provider** after `GnosisWalletProvider` in `_layout.tsx`.

- [ ] **Step 5: Run, verify pass** — `pnpm --filter expo test roebeltaler-context` → PASS; `pnpm --filter expo tsc --noEmit` clean.

- [ ] **Step 6: Commit**
```bash
git add apps/expo/context/RoebeltalerContext.tsx apps/expo/app/_layout.tsx apps/expo/context/__tests__/roebeltaler-context.test.ts
git commit -m "feat(roebeltaler): context with join/mint/send + live balances"
```

### Task 12: Röbeltaler screen + components (reskin roebel-card)

**Files:**
- Create: `apps/expo/app/roebeltaler/index.tsx`, `apps/expo/app/roebeltaler/_layout.tsx`
- Create: `apps/expo/app/roebeltaler/_components/JoinCard.tsx`, `BalanceCard.tsx`, `MintSheet.tsx`, `SendSheet.tsx`
- Reference: `apps/expo/app/roebel-card/index.tsx`, `apps/expo/app/roebel-card/_components/` (patterns to mirror)

- [ ] **Step 1: Build the screen** using `StyleSheet.create()` + `useTheme()` (NO NativeWind — see `apps/expo/CLAUDE.md`). Compose: `BalanceCard` (live Röbeltaler balance via context), `JoinCard` (shown when `!registered`, disabled with reason when `!canJoin`), `MintSheet` ("X Guthaben → X Röbeltaler", guarded by `canMint`), `SendSheet` (recipient = pilot member, amount). Resolve recipient names to display name (never show addresses — existing rule).

- [ ] **Step 2: Add the demurrage explainer** — a one-line note + a "Warum schrumpft mein Guthaben?" link that opens Mecky with a preset question (spec §5.7). Add a plain "Röbeltaler ist öffentlich" privacy note (spec §8 — UI must not imply anonymity).

- [ ] **Step 3: Manual smoke** on a simulator with a pilot account: screen renders, Join disabled for non-citizen, balance reads live. Run: `pnpm --filter expo ios` (or `start`).
Expected: screen loads without runtime errors.

- [ ] **Step 4: Typecheck + commit**
```bash
pnpm --filter expo tsc --noEmit
git add apps/expo/app/roebeltaler
git commit -m "feat(roebeltaler): pilot screen (join, balance, mint, send) + demurrage/privacy notes"
```

### Task 13: End-to-end acceptance script + pilot checklist

**Files:**
- Create: `scripts/circles/e2e-roebeltaler.ts`
- Create: `docs/superpowers/runbooks/2026-06-17-roebeltaler-pilot-acceptance.md`

- [ ] **Step 1: Write the e2e script** (productionized from Spike 4) against the **real** Röbeltaler group: two pilot accounts → join → personalMint → mint Röbeltaler → member1 sends to member2 → assert member2 balance increased. Uses `SNIPPET:*` from the spikes doc.

- [ ] **Step 2: Run it** — `GNOSIS_RPC_URL=... pnpm tsx scripts/circles/e2e-roebeltaler.ts`.
Expected: prints PASS with before/after balances showing the transfer arrived.

- [ ] **Step 3: Write the pilot acceptance checklist** (spec §12): the 5 Attesters each complete join → mint → send on their own device; record UX notes on the two new concepts (join step, demurrage).

- [ ] **Step 4: Commit**
```bash
git add scripts/circles/e2e-roebeltaler.ts docs/superpowers/runbooks/2026-06-17-roebeltaler-pilot-acceptance.md
git commit -m "test(roebeltaler): e2e acceptance script + pilot checklist"
```

---

## Self-Review

**Spec coverage (spec §→task):**
- §1 success criteria 1–6 → Tasks 11 (join/gate), 11 (UBI), 11/12 (mint), 11/12 (send), 11/12 (live balances), 7 (points untouched — no points tables modified). ✅
- §3 architecture (single chain, three pools) → Tasks 8/10 (Gnosis), 9 (group + fee→Stadt-Safe + Attester-Safe ownership). ✅
- §4 Phase 0 → out of scope by decision; sized in Task 6; CitizenNFT read path validated. ✅ (separate plan)
- §5.1–5.8 components → Tasks 10, 11 (5.2/5.3/5.6/5.7), 9 (5.4/5.5), 7 (5.8), 8 (helpers). ✅
- §6 treasury/fee/demurrage → Task 9 (fee→Stadt-Safe, rate 0), Task 11 (live balances/no cache), Task 5 (policy). ✅
- §7 committee 3-of-5 → Task 9 (ownership to Attester Safe). ✅
- §8 privacy honesty → Task 12 (public note). ✅
- §9 AA → Tasks 3, 10. ✅
- §10 spikes 1–6 → Tasks 1–6. ✅
- §11 error handling → Task 11 (idempotency/guards/live reads), Task 1 gate (avatar type). ✅
- §12 testing → Tasks 7/8/10/11 unit, Task 13 e2e + manual. ✅

**Placeholder scan:** SDK-dependent code is anchored to **recorded** `SNIPPET:*` artifacts produced and verified in Phase A — these are defined deliverables, not "TODO". The two on-chain addresses in Task 8 are env-injected and intentionally empty until Task 9 prints them (documented), not fake hardcoded values. No "TBD"/"handle edge cases"-style steps. ✅

**Type consistency:** `MemberPatch`/`upsertMemberPatch`/`saveMember`/`getMember` (Task 7) reused in Tasks 10/11; `canMint`/`formatRoebeltaler` (Task 8) reused in Tasks 11/12; `joinEligibility`/`deriveGnosisPatch` defined and consumed consistently. ✅

**Known honest limitation:** exact `@circles-sdk/sdk` method signatures are pinned by Phase A, not invented here — this is deliberate and is why Phase A is a hard gate. Phase B steps that consume `SNIPPET:*` must paste the verified code from the spikes doc at implementation time.
