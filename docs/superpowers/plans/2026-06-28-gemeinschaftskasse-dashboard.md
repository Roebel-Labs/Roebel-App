# Gemeinschaftskasse Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the Gnosis Safe treasury ("Gemeinschaftskasse") inside the `apps/web` admin dashboard as a dedicated, de-jargoned German page so Attesters can read balances, send funds (propose → co-sign → execute), and manage owners/threshold after a normal email/phone login — no Safe app, no external wallet.

**Architecture:** A new `/admin/dashboard/gemeinschaftskasse` page (4 tabs) reuses the existing thirdweb `inAppWallet + smartAccount` connection. Reads run server-side via viem; the shared signature queue lives in the Safe Transaction Service accessed through `@safe-global/api-kit` behind server routes that hold the API key. Signing uses `@safe-global/protocol-kit`, bridged to thirdweb via `EIP1193.toProvider`; smart-account owners sign via ERC-1271 contract signatures (proven first in a Phase 0 spike), EOA owners via ECDSA. Execution is gasless via thirdweb gas sponsorship.

**Tech Stack:** Next.js 15 (App Router, client components), TypeScript, Tailwind, thirdweb v5, viem, `@safe-global/protocol-kit`, `@safe-global/api-kit`, Supabase (admin client for name resolution).

## Global Constraints

- **Chain:** Gnosis (chainId **100**); `activeChain` from `@/lib/chains`. Safe address = `ADDR.safe` = `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` (Safe **v1.4.1**).
- **Package manager:** pnpm only. Run installs from repo root or with `--filter @roebel/web`.
- **Styling:** Tailwind utility classes only (no CSS-in-JS, no NativeWind). Match the Münzen console shell.
- **Language:** All UI text in **German**.
- **Currency copy:** Only ever "Röbel-Münzen" / "€". NEVER "CRC", "Circles", or personal-token jargon.
- **Never show raw wallet addresses** as the primary label. Resolve to display name via `resolveIdentities` (`@/lib/muenzen/identity`); raw `0x…` only as a muted, truncated (`shortAddr`) secondary.
- **API keys are server-only.** `SAFE_API_KEY` is read only inside `app/api/gemeinschaftskasse/*` route handlers; never `NEXT_PUBLIC_*`, never imported into a client component.
- **Auth:** Pages stay behind the existing dashboard session middleware. Signing actions are additionally gated on "connected wallet is a current Safe owner".
- **No test runner exists in apps/web.** Verify pure logic with Node-runnable `apps/web/scripts/*.mjs` scripts (`node apps/web/scripts/<name>.mjs`); verify wallet/Safe integration manually in the browser with the exact steps each task lists.
- **Brand color:** `#00498B`. Secondary text `#6B7280`. Borders subtle hairline gray.
- **Commit per task; push at the end of each phase** so the remote stays in sync.

---

## File map

**Create**
- `apps/web/src/lib/gemeinschaftskasse/constants.ts` — Safe address, Safe v1.4.1 ABI fragments, token list, types.
- `apps/web/src/lib/gemeinschaftskasse/safe-reads.ts` — server-only on-chain reads (owners, threshold, balances) + name resolution.
- `apps/web/src/lib/gemeinschaftskasse/format.ts` — €/Münzen + approval-label formatting (pure).
- `apps/web/src/lib/gemeinschaftskasse/owners.ts` — pure helpers: owner matching, `prevOwner` linked-list computation.
- `apps/web/src/lib/gemeinschaftskasse/safe-client.ts` — client: Protocol Kit init via thirdweb provider, build/sign Safe txs, execute.
- `apps/web/src/lib/gemeinschaftskasse/api-kit.ts` — server-only API Kit factory (holds `SAFE_API_KEY`).
- `apps/web/src/app/api/gemeinschaftskasse/overview/route.ts` — GET balances + owners(names) + threshold.
- `apps/web/src/app/api/gemeinschaftskasse/pending/route.ts` — GET pending txs + confirmations.
- `apps/web/src/app/api/gemeinschaftskasse/propose/route.ts` — POST a signed tx.
- `apps/web/src/app/api/gemeinschaftskasse/confirm/route.ts` — POST an extra signature.
- `apps/web/src/app/api/gemeinschaftskasse/history/route.ts` — GET executed txs.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx` — page shell + tabs.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/*` — tab UIs + shared bits.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_spike/page-spike.md` — Phase 0 notes (deleted after Phase 0).
- `apps/web/scripts/gk-verify-owners.mjs`, `apps/web/scripts/gk-verify-format.mjs` — Node verification.

**Modify**
- `apps/web/src/components/admin/admin-sidebar.tsx` — add the sidebar entry.
- `apps/web/.env.example` — add `SAFE_API_KEY` placeholder.
- `apps/web/package.json` — add Safe SDK deps (via pnpm).

---

# Phase 0 — De-risk the signing path (spike)

The only genuinely uncertain piece is whether a thirdweb **smart-account** owner can produce a signature the Safe accepts (ERC-1271 contract signature). Prove it with a **read-only** on-chain check before building any UI — no funds move, no Safe state changes.

### Task 0.1: Add Safe SDK dependencies and confirm they import

**Files:**
- Modify: `apps/web/package.json` (via pnpm)
- Create: `apps/web/src/lib/gemeinschaftskasse/_sanity.ts` (temporary)

**Interfaces:**
- Produces: confirmed import surface for `@safe-global/protocol-kit` (`Safe`, utils) and `@safe-global/api-kit` (`SafeApiKit`), and thirdweb `EIP1193`.

- [ ] **Step 1: Install the Safe SDK packages**

Run from repo root:
```bash
pnpm --filter @roebel/web add @safe-global/protocol-kit @safe-global/api-kit
```
Expected: both added to `apps/web/package.json` dependencies; lockfile updated.

- [ ] **Step 2: Write a sanity import module to pin the exact export surface**

Create `apps/web/src/lib/gemeinschaftskasse/_sanity.ts`:
```ts
// TEMP — Phase 0 only. Confirms the SDK export surface compiles against the
// installed versions. Delete after Task 0.2.
import Safe, {
  buildSignatureBytes,
  buildContractSignature,
  EthSafeSignature,
} from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import { EIP1193 } from "thirdweb/wallets";

export const _surface = {
  Safe,
  buildSignatureBytes,
  buildContractSignature,
  EthSafeSignature,
  SafeApiKit,
  toProvider: EIP1193.toProvider,
};
```

- [ ] **Step 3: Type-check just this file to confirm the imports resolve**

Run:
```bash
cd apps/web && npx tsc --noEmit src/lib/gemeinschaftskasse/_sanity.ts 2>&1 | grep -i "gemeinschaftskasse/_sanity" || echo "NO ERRORS in _sanity.ts"
```
Expected: `NO ERRORS in _sanity.ts`. If a named export is missing (version differs), open `apps/web/node_modules/@safe-global/protocol-kit/dist/types/index.d.ts` and adjust the import names, then re-run. **Record the confirmed names** — later tasks use them.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/gemeinschaftskasse/_sanity.ts
git commit -m "chore(web): add Safe protocol-kit + api-kit deps (Phase 0 sanity)"
```

### Task 0.2: Spike — prove smart-account ERC-1271 signing is accepted by the Safe

**Files:**
- Create: `apps/web/src/app/admin/dashboard/gk-spike/page.tsx` (temporary)
- Create: `apps/web/src/lib/gemeinschaftskasse/owners.ts`

**Interfaces:**
- Produces: `resolveSignerIdentity(args) => { ownerAddress, kind: "eoa" | "smart", account, adminAccount }` and a proven `signSafeTxHash(...)` recipe that later tasks reuse in `safe-client.ts`.

- [ ] **Step 1: Create the owner-detection helper (pure + chain read)**

Create `apps/web/src/lib/gemeinschaftskasse/owners.ts`:
```ts
import { getAddress } from "thirdweb/utils";

/** Case-insensitive owner membership check. `owners` from Safe.getOwners(). */
export function matchOwner(
  candidates: (string | undefined)[],
  owners: string[],
): string | null {
  const set = new Set(owners.map((o) => o.toLowerCase()));
  for (const c of candidates) {
    if (c && set.has(c.toLowerCase())) return getAddress(c);
  }
  return null;
}

/**
 * Safe owners are a SENTINEL-anchored linked list. To remove `owner` you must
 * pass the owner that points to it. `owners` MUST be Safe.getOwners() order.
 */
export const SENTINEL = "0x0000000000000000000000000000000000000001";
export function prevOwner(owners: string[], owner: string): string {
  const lower = owners.map((o) => o.toLowerCase());
  const i = lower.indexOf(owner.toLowerCase());
  if (i === -1) throw new Error("owner not found");
  return i === 0 ? SENTINEL : owners[i - 1];
}
```

- [ ] **Step 2: Build the spike page**

Create `apps/web/src/app/admin/dashboard/gk-spike/page.tsx`. It connects, resolves the signer identity, signs a **sample** Safe tx hash, and verifies acceptance with a read-only call — no proposal, no execution:
```tsx
"use client";
import { useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { readContract, getContract } from "thirdweb";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import Safe, { buildSignatureBytes, buildContractSignature, EthSafeSignature } from "@safe-global/protocol-kit";
import { EIP1193 } from "thirdweb/wallets";
import { matchOwner } from "@/lib/gemeinschaftskasse/owners";

const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const MAGIC = "0x1626ba7e"; // ERC-1271 isValidSignature(bytes32,bytes) success

export default function GkSpike() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [...l, s]);

  async function run() {
    if (!account || !wallet) return add("❌ no wallet connected");
    try {
      const provider = EIP1193.toProvider({ wallet, chain: activeChain, client });
      const adminAccount = (await wallet.getAdminAccount?.()) ?? undefined;
      const protocolKit = await Safe.init({ provider, safeAddress: SAFE });
      const owners = await protocolKit.getOwners();
      add(`owners: ${owners.join(", ")}`);

      const ownerAddr = matchOwner([account.address, adminAccount?.address], owners);
      if (!ownerAddr) return add(`❌ connected account is NOT a Safe owner (smart=${account.address}, admin=${adminAccount?.address})`);
      const isSmart = ownerAddr.toLowerCase() === account.address.toLowerCase();
      add(`✅ owner=${ownerAddr} kind=${isSmart ? "smart" : "eoa"}`);

      // Build a harmless sample tx (0 xDAI to the Safe itself) and hash it.
      const safeTx = await protocolKit.createTransaction({
        transactions: [{ to: SAFE, value: "0", data: "0x" }],
      });
      const txHash = await protocolKit.getTransactionHash(safeTx);
      add(`safeTxHash=${txHash}`);

      if (isSmart) {
        // Smart account signs the hash; assemble an ERC-1271 contract signature.
        const inner = await account.signMessage({ message: { raw: txHash as `0x${string}` } });
        // Verify the smart account itself accepts it (read-only).
        const smart = getContract({ client, chain: activeChain, address: account.address });
        const res = await readContract({
          contract: smart,
          method: "function isValidSignature(bytes32,bytes) view returns (bytes4)",
          params: [txHash as `0x${string}`, inner as `0x${string}`],
        });
        add(res.toLowerCase() === MAGIC ? "✅ smart account isValidSignature → MAGIC" : `❌ isValidSignature=${res}`);
        const contractSig = buildContractSignature(
          [new EthSafeSignature(ownerAddr, inner, true)],
          ownerAddr,
        );
        add(`assembled contract signature bytes len=${buildSignatureBytes([contractSig]).length}`);
      } else {
        const sig = await account.signMessage({ message: { raw: txHash as `0x${string}` } });
        add(`✅ EOA signed, sig len=${sig.length}`);
      }
      add("DONE — signing path validated (no funds moved)");
    } catch (e) {
      add(`❌ ${(e as Error).message}`);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-medium">GK signing spike</h1>
      <button onClick={run} className="px-4 py-2 rounded bg-[#00498B] text-white">Test signature</button>
      <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded">{log.join("\n")}</pre>
    </div>
  );
}
```

- [ ] **Step 3: Run the spike in the browser**

Run `pnpm dev:web`, log into the dashboard, open `/admin/dashboard/gk-spike`, connect as a known Safe owner, click **Test signature**.
Expected log: owner detected, `kind` shown, and for a smart-account owner **"✅ smart account isValidSignature → MAGIC"** plus a non-zero assembled signature length; for the EOA owner, "✅ EOA signed".
If `isValidSignature` does NOT return MAGIC, the thirdweb account wraps the hash in its own EIP-712 domain before validating — adjust by signing `account.signTypedData` with the thirdweb Account domain (`{ name: "Account", version: "1", chainId: 100, verifyingContract: account.address }`, type `AccountMessage{ bytes message }` over the hash) and re-run until MAGIC. **Record the working recipe** in the commit message.

- [ ] **Step 4: Confirm the assembled signature is Safe-acceptable (read-only checkSignatures)**

Add a final verification to `run()` after assembling `contractSig` (smart path) — call the Safe's view that reverts on bad signatures:
```ts
const safeC = getContract({ client, chain: activeChain, address: SAFE });
await readContract({
  contract: safeC,
  method: "function checkSignatures(bytes32 dataHash, bytes data, bytes signatures) view",
  params: [txHash as `0x${string}`, "0x", buildSignatureBytes([contractSig]) as `0x${string}`],
});
add("✅ Safe.checkSignatures accepted the assembled signature");
```
Run again in the browser. Expected: the new ✅ line, no revert. This proves the full path end-to-end with zero state change.

- [ ] **Step 5: Commit the spike result (record the working recipe), keep owners.ts, delete sanity + spike page**

```bash
rm apps/web/src/lib/gemeinschaftskasse/_sanity.ts
git rm -r apps/web/src/app/admin/dashboard/gk-spike
git add apps/web/src/lib/gemeinschaftskasse/owners.ts
git commit -m "spike(web): prove thirdweb smart-account ERC-1271 sig accepted by GK Safe

Recipe: <paste the working sign + assemble steps here>"
git push -u origin feat/gemeinschaftskasse-dashboard
```

---

# Phase 1 — Übersicht + Verlauf (read-only)

### Task 1.1: Safe constants module

**Files:**
- Create: `apps/web/src/lib/gemeinschaftskasse/constants.ts`

**Interfaces:**
- Produces: `GK_SAFE` (address), `SAFE_ABI` (parsed), `TOKENS` (asset list), types `AssetId`, `OwnerView`, `TxView`.

- [ ] **Step 1: Write the constants**

Create `apps/web/src/lib/gemeinschaftskasse/constants.ts`:
```ts
import { parseAbi } from "viem";
import { ADDR } from "@/lib/muenzen/constants";

export const GK_SAFE = ADDR.safe; // 0x3A08…
export const GK_CHAIN_ID = 100;

export const SAFE_ABI = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function addOwnerWithThreshold(address owner, uint256 _threshold)",
  "function removeOwner(address prevOwner, address owner, uint256 _threshold)",
  "function changeThreshold(uint256 _threshold)",
]);

export type AssetId = "xdai" | "eure" | "muenzen";

export const TOKENS: { id: AssetId; label: string; decimals: number; address?: string }[] = [
  { id: "xdai", label: "xDAI", decimals: 18 },
  { id: "eure", label: "EURe", decimals: 18, address: ADDR.eure },
  { id: "muenzen", label: "Röbel-Münzen", decimals: 18, address: ADDR.group },
];

export interface OwnerView { address: string; name: string; short: string; isYou?: boolean }
export interface TxView {
  safeTxHash: string;
  kind: "auszahlung" | "mitglied_hinzu" | "mitglied_entfernt" | "schwelle" | "sonstige";
  title: string;          // de-jargoned German line
  confirmations: number;
  threshold: number;
  executed: boolean;
  signers: string[];      // owner addresses that have confirmed
  submissionDate?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/constants.ts
git commit -m "feat(web): GK Safe constants (address, ABI, token list, types)"
```

### Task 1.2: Pure formatting helpers + Node verification

**Files:**
- Create: `apps/web/src/lib/gemeinschaftskasse/format.ts`
- Create: `apps/web/scripts/gk-verify-format.mjs`

**Interfaces:**
- Produces: `eur(amount: number): string`, `approvalLabel(n, m): string`, `muenzen(atto: bigint): string`.

- [ ] **Step 1: Write the helpers**

Create `apps/web/src/lib/gemeinschaftskasse/format.ts`:
```ts
import { attoToNumber } from "@/lib/muenzen/constants";

export function eur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

/** "Wartet auf Freigaben (1/2)" or "Bereit zur Ausführung (2/2)". */
export function approvalLabel(n: number, m: number): string {
  return n >= m ? `Bereit zur Ausführung (${n}/${m})` : `Wartet auf Freigaben (${n}/${m})`;
}

export function muenzen(atto: bigint): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(attoToNumber(atto))} Röbel-Münzen`;
}
```

- [ ] **Step 2: Write the Node verification script**

Create `apps/web/scripts/gk-verify-format.mjs` (mirrors the logic so it runs without the TS build):
```mjs
import assert from "node:assert";

function approvalLabel(n, m) {
  return n >= m ? `Bereit zur Ausführung (${n}/${m})` : `Wartet auf Freigaben (${n}/${m})`;
}
assert.equal(approvalLabel(1, 2), "Wartet auf Freigaben (1/2)");
assert.equal(approvalLabel(2, 2), "Bereit zur Ausführung (2/2)");
assert.equal(approvalLabel(3, 2), "Bereit zur Ausführung (3/2)");
console.log("✅ gk-verify-format passed");
```

- [ ] **Step 3: Run it**

Run: `node apps/web/scripts/gk-verify-format.mjs`
Expected: `✅ gk-verify-format passed`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/format.ts apps/web/scripts/gk-verify-format.mjs
git commit -m "feat(web): GK formatting helpers + node verification"
```

### Task 1.3: Verify `prevOwner` / `matchOwner` with Node script

**Files:**
- Create: `apps/web/scripts/gk-verify-owners.mjs`

**Interfaces:**
- Consumes: logic of `owners.ts` from Task 0.2.

- [ ] **Step 1: Write the verification (re-implements the pure logic to assert it)**

Create `apps/web/scripts/gk-verify-owners.mjs`:
```mjs
import assert from "node:assert";
const SENTINEL = "0x0000000000000000000000000000000000000001";
function prevOwner(owners, owner) {
  const lower = owners.map((o) => o.toLowerCase());
  const i = lower.indexOf(owner.toLowerCase());
  if (i === -1) throw new Error("owner not found");
  return i === 0 ? SENTINEL : owners[i - 1];
}
function matchOwner(candidates, owners) {
  const set = new Set(owners.map((o) => o.toLowerCase()));
  for (const c of candidates) if (c && set.has(c.toLowerCase())) return c;
  return null;
}
const O = ["0xAAa0000000000000000000000000000000000001", "0xBbb0000000000000000000000000000000000002", "0xCcc0000000000000000000000000000000000003"];
assert.equal(prevOwner(O, O[0]), SENTINEL);              // first → sentinel
assert.equal(prevOwner(O, O[1]), O[0]);                  // middle → predecessor
assert.equal(prevOwner(O, O[2]), O[1]);                  // last → predecessor
assert.equal(prevOwner(O, O[2].toUpperCase()), O[1]);    // case-insensitive
assert.throws(() => prevOwner(O, "0xdead"));             // unknown → throws
assert.equal(matchOwner(["0xZZZ", O[1].toLowerCase()], O), O[1].toLowerCase());
assert.equal(matchOwner(["0xZZZ"], O), null);
console.log("✅ gk-verify-owners passed");
```

- [ ] **Step 2: Run it**

Run: `node apps/web/scripts/gk-verify-owners.mjs`
Expected: `✅ gk-verify-owners passed`

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/gk-verify-owners.mjs
git commit -m "test(web): node verification for GK owner/prevOwner logic"
```

### Task 1.4: Server-side Safe reads (owners, threshold, balances, names)

**Files:**
- Create: `apps/web/src/lib/gemeinschaftskasse/safe-reads.ts`

**Interfaces:**
- Consumes: `gnosisClient`, `nativeBalance`, `eureBalance`, `rcrcBalance` (`@/lib/muenzen/gnosis`); `resolveIdentities` (`@/lib/muenzen/identity`); `GK_SAFE`, `SAFE_ABI` (Task 1.1).
- Produces: `getSafeOverview(you?: string) => Promise<{ owners: OwnerView[]; threshold: number; balances: { xdai: bigint; eure: bigint; muenzen: bigint }; euro: number }>`.

- [ ] **Step 1: Implement**

Create `apps/web/src/lib/gemeinschaftskasse/safe-reads.ts`:
```ts
import "server-only";
import { getAddress } from "viem";
import { gnosisClient, nativeBalance, eureBalance, rcrcBalance } from "@/lib/muenzen/gnosis";
import { resolveIdentities } from "@/lib/muenzen/identity";
import { shortAddr, XDAI_EUR } from "@/lib/muenzen/constants";
import { GK_SAFE, SAFE_ABI, type OwnerView } from "./constants";

export async function getSafeOverview(you?: string) {
  const safe = getAddress(GK_SAFE);
  const [ownersRaw, thresholdRaw, xdai, eure, muenzen] = await Promise.all([
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getOwners" }),
    gnosisClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "getThreshold" }),
    nativeBalance(GK_SAFE),
    eureBalance(GK_SAFE),
    rcrcBalance(GK_SAFE).catch(() => 0n),
  ]);
  const ownerAddrs = (ownersRaw as readonly string[]).map((a) => getAddress(a));
  const names = await resolveIdentities(ownerAddrs); // Map<addrLower, {name}>
  const owners: OwnerView[] = ownerAddrs.map((a) => ({
    address: a,
    name: names.get(a.toLowerCase())?.name || "Unbenannt",
    short: shortAddr(a),
    isYou: you ? a.toLowerCase() === you.toLowerCase() : false,
  }));
  const euro = (Number(xdai) / 1e18) * XDAI_EUR + Number(eure) / 1e18;
  return { owners, threshold: Number(thresholdRaw), balances: { xdai, eure, muenzen }, euro };
}
```
> Verify `resolveIdentities`' actual return shape against `@/lib/muenzen/identity` and adjust the `.get(...).name` access if it differs (e.g. returns an array or different key). This is the one external contract to confirm while implementing.

- [ ] **Step 2: Smoke-check the read path against mainnet via a temporary route**

This calls real Gnosis RPC. Manual verify in Task 1.5 once the route exists; no separate step needed here.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/safe-reads.ts
git commit -m "feat(web): GK server-side Safe reads (owners/threshold/balances + names)"
```

### Task 1.5: API Kit factory + overview/history/pending routes

**Files:**
- Create: `apps/web/src/lib/gemeinschaftskasse/api-kit.ts`
- Create: `apps/web/src/app/api/gemeinschaftskasse/overview/route.ts`
- Create: `apps/web/src/app/api/gemeinschaftskasse/history/route.ts`
- Create: `apps/web/src/app/api/gemeinschaftskasse/pending/route.ts`
- Modify: `apps/web/.env.example`

**Interfaces:**
- Consumes: `getSafeOverview` (Task 1.4); `requireAdmin`, `jsonError` (`@/lib/muenzen/api`).
- Produces: `getApiKit()` server factory; three GET endpoints returning JSON described below.

- [ ] **Step 1: API Kit factory (server-only)**

Create `apps/web/src/lib/gemeinschaftskasse/api-kit.ts`:
```ts
import "server-only";
import SafeApiKit from "@safe-global/api-kit";
import { GK_CHAIN_ID } from "./constants";

export function getApiKit() {
  const apiKey = process.env.SAFE_API_KEY;
  if (!apiKey) throw new Error("SAFE_API_KEY not set");
  return new SafeApiKit({ chainId: BigInt(GK_CHAIN_ID), apiKey });
}
```
> Confirm the `SafeApiKit` constructor option names against the installed version's types (`chainId`, `apiKey`, possibly `txServiceUrl`). Adjust if the installed major differs; record in the commit.

- [ ] **Step 2: overview route**

Create `apps/web/src/app/api/gemeinschaftskasse/overview/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getSafeOverview } from "@/lib/gemeinschaftskasse/safe-reads";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const you = new URL(req.url).searchParams.get("you") || undefined;
    const data = await getSafeOverview(you);
    return NextResponse.json({
      owners: data.owners,
      threshold: data.threshold,
      euro: data.euro,
      balances: {
        xdai: data.balances.xdai.toString(),
        eure: data.balances.eure.toString(),
        muenzen: data.balances.muenzen.toString(),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
```
> Confirm `requireAdmin`'s shape from `@/lib/muenzen/api` (it may return a `NextResponse` on failure or throw). Match the existing routes' usage exactly (see `app/api/muenzen/trust/route.ts`).

- [ ] **Step 3: history + pending routes**

Create `apps/web/src/app/api/gemeinschaftskasse/history/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { describeTx } from "@/lib/gemeinschaftskasse/describe";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const kit = getApiKit();
    const res = await kit.getMultisigTransactions(GK_SAFE);
    const executed = res.results.filter((t) => t.isExecuted);
    return NextResponse.json({ items: await describeTx(executed) });
  } catch (e) {
    return jsonError(e);
  }
}
```

Create `apps/web/src/app/api/gemeinschaftskasse/pending/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { describeTx } from "@/lib/gemeinschaftskasse/describe";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const kit = getApiKit();
    const res = await kit.getPendingTransactions(GK_SAFE);
    return NextResponse.json({ items: await describeTx(res.results) });
  } catch (e) {
    return jsonError(e);
  }
}
```
> Confirm API Kit method names (`getMultisigTransactions`, `getPendingTransactions`) and the result field `results` / `isExecuted` / `confirmations` against the installed version's types; adjust and record.

- [ ] **Step 4: Add the `describeTx` de-jargoning helper**

Create `apps/web/src/lib/gemeinschaftskasse/describe.ts`:
```ts
import "server-only";
import { decodeFunctionData, getAddress } from "viem";
import { resolveIdentities } from "@/lib/muenzen/identity";
import { SAFE_ABI, GK_SAFE, TOKENS, type TxView } from "./constants";
import { eur } from "./format";

// Maps a raw Safe Transaction Service tx into a German, name-first TxView.
export async function describeTx(raw: any[]): Promise<TxView[]> {
  // Pre-resolve all addresses that might need a name (recipients, new owners).
  const addrs = new Set<string>();
  for (const t of raw) { if (t.to) addrs.add(getAddress(t.to)); }
  const names = await resolveIdentities([...addrs]);
  const nm = (a?: string) => (a ? names.get(a.toLowerCase())?.name || "jemand" : "jemand");

  return raw.map((t): TxView => {
    const confirmations = t.confirmations?.length ?? 0;
    const signers = (t.confirmations ?? []).map((c: any) => c.owner);
    let kind: TxView["kind"] = "sonstige";
    let title = "Aktion";

    // Owner/threshold management = a call to the Safe itself.
    if (t.to && getAddress(t.to) === getAddress(GK_SAFE) && t.data && t.data !== "0x") {
      try {
        const dec = decodeFunctionData({ abi: SAFE_ABI, data: t.data });
        if (dec.functionName === "addOwnerWithThreshold") { kind = "mitglied_hinzu"; title = `Mitglied hinzufügen: ${nm(dec.args[0] as string)}`; }
        else if (dec.functionName === "removeOwner") { kind = "mitglied_entfernt"; title = `Mitglied entfernen: ${nm(dec.args[1] as string)}`; }
        else if (dec.functionName === "changeThreshold") { kind = "schwelle"; title = `Schwelle auf ${dec.args[0]} ändern`; }
      } catch { /* not a recognised Safe call */ }
    } else if (t.data === "0x" || !t.data) {
      // Native xDAI transfer.
      kind = "auszahlung";
      title = `Auszahlung ${eur((Number(t.value || 0) / 1e18) * 0.92)} an ${nm(t.to)}`;
    } else {
      // ERC-20/1155 transfer (EURe / Röbel-Münzen) — recipient/amount from calldata.
      kind = "auszahlung";
      const tok = TOKENS.find((x) => x.address && t.to && getAddress(x.address) === getAddress(t.to));
      title = tok ? `Auszahlung in ${tok.label} an Empfänger` : `Auszahlung an ${nm(t.to)}`;
    }
    return {
      safeTxHash: t.safeTxHash,
      kind, title, confirmations,
      threshold: t.confirmationsRequired ?? confirmations,
      executed: !!t.isExecuted, signers,
      submissionDate: t.submissionDate,
    };
  });
}
```
> `decodeFunctionData` for ERC-20/1155 recipients can be enriched later; Phase 1 only needs executed-history readability. The recipient/amount decode for token transfers is finalized in Task 2.x where the encode side is authored.

- [ ] **Step 5: Add the env placeholder**

Add to `apps/web/.env.example` (placeholder only):
```
# Safe Transaction Service API key (server-only) for the Gemeinschaftskasse page
SAFE_API_KEY=your-safe-api-key
```
Then set the real key locally in `apps/web/.env.local` (obtain a free key from the Safe developer dashboard).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/api-kit.ts apps/web/src/lib/gemeinschaftskasse/describe.ts apps/web/src/app/api/gemeinschaftskasse apps/web/.env.example
git commit -m "feat(web): GK API routes (overview/pending/history) + tx de-jargoning + SAFE_API_KEY"
```

### Task 1.6: Sidebar entry + page shell with tabs

**Files:**
- Modify: `apps/web/src/components/admin/admin-sidebar.tsx`
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Tabs.tsx`

**Interfaces:**
- Produces: route at `/admin/dashboard/gemeinschaftskasse` with a tab switcher rendering placeholders for Übersicht/Auszahlungen/Mitglieder/Verlauf.

- [ ] **Step 1: Add the sidebar import + entry**

In `apps/web/src/components/admin/admin-sidebar.tsx`, add `Landmark` to the lucide import on line 6, then add this object to the `extraLinks` array (after "Röbel Münzen", line ~226):
```tsx
    {
      name: "Gemeinschaftskasse",
      href: "/admin/dashboard/gemeinschaftskasse",
      icon: <Landmark className="h-5 w-5" />,
      badgeKey: null,
    },
```

- [ ] **Step 2: Page shell with client tabs**

Create `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Tabs } from "./_components/Tabs";

const TABS = ["Übersicht", "Auszahlungen", "Mitglieder", "Verlauf"] as const;
type Tab = (typeof TABS)[number];

export default function GemeinschaftskassePage() {
  const [tab, setTab] = useState<Tab>("Übersicht");
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gemeinschaftskasse</h1>
        <p className="text-sm text-muted-foreground">Die gemeinsame Kasse der Stadt — verwaltet von mehreren Personen.</p>
      </div>
      <Tabs tabs={TABS as unknown as string[]} active={tab} onChange={(t) => setTab(t as Tab)} />
      {tab === "Übersicht" && <div className="text-sm text-muted-foreground">Übersicht folgt…</div>}
      {tab === "Auszahlungen" && <div className="text-sm text-muted-foreground">Auszahlungen folgen…</div>}
      {tab === "Mitglieder" && <div className="text-sm text-muted-foreground">Mitglieder folgt…</div>}
      {tab === "Verlauf" && <div className="text-sm text-muted-foreground">Verlauf folgt…</div>}
    </div>
  );
}
```

- [ ] **Step 3: Tab switcher component**

Create `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Tabs.tsx`:
```tsx
"use client";
export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            active === t ? "border-[#00498B] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify in the browser**

Run `pnpm dev:web`. Confirm the **Gemeinschaftskasse** item appears in the sidebar under "Weitere", the page loads, the title shows, and clicking tabs switches the placeholder text.
Expected: all four tabs switch; no console errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/admin-sidebar.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse
git commit -m "feat(web): GK page shell, tabs, and sidebar entry"
```

### Task 1.7: Übersicht tab (balance, owners as names, threshold)

**Files:**
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Uebersicht.tsx`
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`

**Interfaces:**
- Consumes: `GET /api/gemeinschaftskasse/overview` (Task 1.5); `useActiveAccount` (thirdweb) to pass `?you=`.

- [ ] **Step 1: Build the Übersicht component**

Create `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Uebersicht.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";

interface Overview {
  owners: { address: string; name: string; short: string; isYou?: boolean }[];
  threshold: number; euro: number;
  balances: { xdai: string; eure: string; muenzen: string };
}

export function Uebersicht() {
  const account = useActiveAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const url = "/api/gemeinschaftskasse/overview" + (account ? `?you=${account.address}` : "");
    fetch(url).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(String(e)));
  }, [account]);

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Lädt…</p>;

  const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(data.euro);
  const muenzen = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(data.balances.muenzen) / 1e18);
  const youAreOwner = data.owners.some((o) => o.isYou);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-5">
        <p className="text-sm text-muted-foreground">Guthaben (€-Reserve)</p>
        <p className="text-3xl font-semibold">{eur}</p>
        <p className="text-sm text-muted-foreground mt-1">+ {muenzen} Röbel-Münzen</p>
      </div>

      <div className="rounded-lg border border-border p-5">
        <p className="text-sm font-medium mb-3">Mitsignierer ({data.owners.length})</p>
        <ul className="space-y-2">
          {data.owners.map((o) => (
            <li key={o.address} className="flex items-center justify-between">
              <span className="text-sm">{o.name}{o.isYou && <span className="ml-2 text-xs text-[#00498B]">(Du)</span>}</span>
              <span className="text-xs text-muted-foreground font-mono">{o.short}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          Aktuell genügen <strong>{data.threshold}</strong> von {data.owners.length} Freigaben für eine Auszahlung.
        </p>
        {data.threshold < 2 && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Sicherheitshinweis: Aktuell kann eine einzelne Person allein Geld bewegen. Wir empfehlen, die Freigabe-Schwelle unter „Mitglieder" auf mindestens 2 zu erhöhen.
          </div>
        )}
        {youAreOwner && <p className="mt-2 text-xs text-[#00498B]">Du bist Mitsignierer.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `page.tsx`, import `Uebersicht` and replace the `{tab === "Übersicht" && ...}` placeholder with `{tab === "Übersicht" && <Uebersicht />}`.

- [ ] **Step 3: Verify in the browser**

With `SAFE_API_KEY` and `GNOSIS_RPC_URL` set, load the page. Connect as an owner.
Expected: real € balance + Röbel-Münzen; 3 owners shown **by name** (not addresses) with a truncated mono `0x…` secondary; "Aktuell genügen **1** von 3 Freigaben"; the amber threshold warning appears (threshold is 1); "(Du)" + "Du bist Mitsignierer" if you're an owner.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse
git commit -m "feat(web): GK Übersicht tab (balance, owners by name, threshold + safety hint)"
```

### Task 1.8: Verlauf tab (executed history)

**Files:**
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Verlauf.tsx`
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`

**Interfaces:**
- Consumes: `GET /api/gemeinschaftskasse/history` → `{ items: TxView[] }`.

- [ ] **Step 1: Build the component**

Create `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Verlauf.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";

interface TxView { safeTxHash: string; title: string; submissionDate?: string }

export function Verlauf() {
  const [items, setItems] = useState<TxView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/gemeinschaftskasse/history").then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items))).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!items) return <p className="text-sm text-muted-foreground">Lädt…</p>;
  if (!items.length) return <p className="text-sm text-muted-foreground">Noch keine Vorgänge.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((t) => (
        <li key={t.safeTxHash} className="py-3 flex items-center justify-between">
          <span className="text-sm">{t.title}</span>
          <a className="text-xs text-muted-foreground hover:underline" href={`https://gnosisscan.io/tx/`} target="_blank" rel="noreferrer">
            {t.submissionDate ? new Date(t.submissionDate).toLocaleDateString("de-DE") : ""}
          </a>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Wire into page**, replacing the Verlauf placeholder with `<Verlauf />`.

- [ ] **Step 3: Verify in the browser** — Verlauf lists past executed Safe transactions in plain German (or "Noch keine Vorgänge." if none). No raw addresses as primary text.

- [ ] **Step 4: Commit, then push the phase**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse
git commit -m "feat(web): GK Verlauf tab (executed history, de-jargoned)"
git push
```

---

# Phase 2 — Auszahlungen (propose → co-sign → execute)

### Task 2.1: Client Safe helper (Protocol Kit via thirdweb, build + sign + execute)

**Files:**
- Create: `apps/web/src/lib/gemeinschaftskasse/safe-client.ts`

**Interfaces:**
- Consumes: Phase 0 proven recipe; `owners.ts`; `EIP1193.toProvider`; Protocol Kit.
- Produces:
  - `initProtocolKit(wallet) => Promise<Safe>`
  - `resolveSigner(protocolKit, account, wallet) => Promise<{ ownerAddress: string; isSmart: boolean } | null>`
  - `buildTransfer({ asset, to, amount }) => MetaTransactionData`
  - `signSafeTx(protocolKit, account, signer, safeTx) => Promise<{ safeTxHash: string; signature: string; senderSignature: string }>`
  - `executeSafeTx(protocolKit, safeTxHash) => Promise<string>` (returns tx hash)

- [ ] **Step 1: Implement build + sign using the Phase 0 recipe**

Create `apps/web/src/lib/gemeinschaftskasse/safe-client.ts`:
```ts
"use client";
import Safe, { buildSignatureBytes, buildContractSignature, EthSafeSignature } from "@safe-global/protocol-kit";
import { EIP1193 } from "thirdweb/wallets";
import { encodeFunctionData, getContract, sendTransaction, waitForReceipt } from "thirdweb";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { GK_SAFE, TOKENS, type AssetId } from "./constants";
import { matchOwner } from "./owners";
import type { Account } from "thirdweb/wallets";

export async function initProtocolKit(wallet: any) {
  const provider = EIP1193.toProvider({ wallet, chain: activeChain, client });
  return Safe.init({ provider, safeAddress: GK_SAFE });
}

export async function resolveSigner(protocolKit: Safe, account: Account, wallet: any) {
  const owners = await protocolKit.getOwners();
  const admin = await wallet.getAdminAccount?.().catch(() => undefined);
  const ownerAddress = matchOwner([account.address, admin?.address], owners);
  if (!ownerAddress) return null;
  return { ownerAddress, isSmart: ownerAddress.toLowerCase() === account.address.toLowerCase() };
}

export function buildTransfer({ asset, to, amountWei }: { asset: AssetId; to: string; amountWei: bigint }) {
  if (asset === "xdai") return { to, value: amountWei.toString(), data: "0x" };
  const tok = TOKENS.find((t) => t.id === asset)!;
  if (asset === "eure") {
    return { to: tok.address!, value: "0", data: encodeFunctionData({
      abi: [{ name: "transfer", type: "function", stateMutability: "nonpayable",
        inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "transfer", args: [to as `0x${string}`, amountWei] }) };
  }
  // Röbel-Münzen = ERC-1155 group token: safeTransferFrom(safe, to, id, amount, "")
  return { to: tok.address!, value: "0", data: encodeFunctionData({
    abi: [{ name: "safeTransferFrom", type: "function", stateMutability: "nonpayable",
      inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "id", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [] }],
    functionName: "safeTransferFrom", args: [GK_SAFE as `0x${string}`, to as `0x${string}`, BigInt(tok.address!), amountWei, "0x"] }) };
}

export async function signSafeTx(protocolKit: Safe, account: Account, signer: { ownerAddress: string; isSmart: boolean }, metaTx: any) {
  const safeTx = await protocolKit.createTransaction({ transactions: [metaTx] });
  const safeTxHash = await protocolKit.getTransactionHash(safeTx);
  const inner = await account.signMessage({ message: { raw: safeTxHash as `0x${string}` } });
  let senderSignature: string;
  if (signer.isSmart) {
    senderSignature = buildSignatureBytes([
      buildContractSignature([new EthSafeSignature(signer.ownerAddress, inner, true)], signer.ownerAddress),
    ]);
  } else {
    // EOA: adjust v for Safe eth_sign (+4) per Protocol Kit convention if needed (confirmed in Phase 0).
    senderSignature = buildSignatureBytes([new EthSafeSignature(signer.ownerAddress, inner)]);
  }
  return { safeTxHash, senderSignature, safeTx };
}

export async function executeSafeTx(account: Account, to: string, data: string, value: string) {
  const contract = getContract({ client, chain: activeChain, address: to as `0x${string}` });
  // Execution is a single thirdweb sendTransaction to Safe.execTransaction (data pre-encoded by caller).
  const tx = await sendTransaction({ account, transaction: { to: contract.address, data: data as `0x${string}`, value: BigInt(value), chain: activeChain, client } as any });
  await waitForReceipt({ client, chain: activeChain, transactionHash: tx.transactionHash });
  return tx.transactionHash;
}
```
> The EOA `v`-adjustment and the exact execution-encoding (`protocolKit.getEncodedTransaction(safeTx)` to get `execTransaction` calldata) are confirmed during this task using the Phase 0 recipe. Prefer `protocolKit.executeTransaction(safeTx)` if Protocol Kit can route through the thirdweb provider directly; fall back to manual `execTransaction` encoding + thirdweb `sendTransaction` (gasless) otherwise. Record which path works.

- [ ] **Step 2: Verify build helpers with a Node script**

Create `apps/web/scripts/gk-verify-transfer.mjs` asserting `buildTransfer` calldata shapes (re-implement the encode with viem's `encodeFunctionData`):
```mjs
import assert from "node:assert";
import { encodeFunctionData } from "viem";
const erc20 = encodeFunctionData({ abi: [{ name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] }], functionName: "transfer", args: ["0x000000000000000000000000000000000000dEaD", 1000000000000000000n] });
assert.ok(erc20.startsWith("0xa9059cbb"), "erc20 transfer selector"); // transfer(address,uint256)
console.log("✅ gk-verify-transfer passed");
```
Run: `node apps/web/scripts/gk-verify-transfer.mjs` → Expected `✅ gk-verify-transfer passed`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/safe-client.ts apps/web/scripts/gk-verify-transfer.mjs
git commit -m "feat(web): GK client Safe helper (build/sign/execute via Protocol Kit + thirdweb)"
```

### Task 2.2: propose + confirm routes

**Files:**
- Create: `apps/web/src/app/api/gemeinschaftskasse/propose/route.ts`
- Create: `apps/web/src/app/api/gemeinschaftskasse/confirm/route.ts`

**Interfaces:**
- Consumes: `getApiKit` (Task 1.5); client posts `{ safeTxHash, senderSignature, sender, txData }`.
- Produces: `POST propose` → `{ ok: true, safeTxHash }`; `POST confirm` → `{ ok: true }`.

- [ ] **Step 1: propose route**

Create `apps/web/src/app/api/gemeinschaftskasse/propose/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { safeTransactionData, safeTxHash, senderAddress, senderSignature } = await req.json();
    const kit = getApiKit();
    await kit.proposeTransaction({
      safeAddress: GK_SAFE,
      safeTransactionData,
      safeTxHash,
      senderAddress,
      senderSignature,
    });
    return NextResponse.json({ ok: true, safeTxHash });
  } catch (e) {
    return jsonError(e);
  }
}
```

- [ ] **Step 2: confirm route**

Create `apps/web/src/app/api/gemeinschaftskasse/confirm/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { safeTxHash, signature } = await req.json();
    const kit = getApiKit();
    await kit.confirmTransaction(safeTxHash, signature);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
```
> Confirm `proposeTransaction` / `confirmTransaction` arg shapes against the installed API Kit types (the `safeTransactionData` field shape in particular). Adjust and record.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/gemeinschaftskasse/propose apps/web/src/app/api/gemeinschaftskasse/confirm
git commit -m "feat(web): GK propose + confirm API routes (Safe Transaction Service)"
```

### Task 2.3: Auszahlungen UI (create + queue + freigeben + ausführen)

**Files:**
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Auszahlungen.tsx`
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/CreatePayout.tsx`
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx`
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`

**Interfaces:**
- Consumes: `safe-client.ts` (Task 2.1); `/api/gemeinschaftskasse/{pending,propose,confirm}`; thirdweb `useActiveAccount`/`useActiveWallet`.

- [ ] **Step 1: CreatePayout form**

Create `CreatePayout.tsx`: recipient (free address or name-search resolving to address — Phase 2 accepts a pasted address validated with `isAddress`), amount, asset select (xDAI / EURe / Röbel-Münzen), optional note. On submit:
```tsx
"use client";
import { useState } from "react";
import { isAddress, parseEther } from "viem";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { initProtocolKit, resolveSigner, buildTransfer, signSafeTx } from "@/lib/gemeinschaftskasse/safe-client";
import type { AssetId } from "@/lib/gemeinschaftskasse/constants";

export function CreatePayout({ onCreated }: { onCreated: () => void }) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const [to, setTo] = useState(""); const [amount, setAmount] = useState(""); const [asset, setAsset] = useState<AssetId>("eure");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!account || !wallet) return setErr("Bitte zuerst anmelden.");
    if (!isAddress(to)) return setErr("Ungültige Empfängeradresse.");
    setBusy(true);
    try {
      const kit = await initProtocolKit(wallet);
      const signer = await resolveSigner(kit, account, wallet);
      if (!signer) return setErr("Du bist kein Mitsignierer dieser Kasse.");
      const metaTx = buildTransfer({ asset, to, amountWei: parseEther(amount) });
      const { safeTxHash, senderSignature, safeTx } = await signSafeTx(kit, account, signer, metaTx);
      const res = await fetch("/api/gemeinschaftskasse/propose", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ safeTransactionData: safeTx.data, safeTxHash, senderAddress: signer.ownerAddress, senderSignature }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setTo(""); setAmount(""); onCreated();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  // …inputs + button (Tailwind), disabled while busy, shows err…
  return (/* form markup per project styling */ null as any);
}
```
> Fill in the input/button markup matching the Münzen console form styling. Keep all labels German.

- [ ] **Step 2: PendingQueue with Freigeben + Ausführen**

Create `PendingQueue.tsx`: fetch `/api/gemeinschaftskasse/pending`; for each item show title, `approvalLabel(confirmations, threshold)`, signer names; a **Freigeben** button (visible to owners who haven't signed) that re-signs the `safeTxHash` and POSTs `/confirm`; an **Ausführen** button (enabled when `confirmations >= threshold`) that calls `executeSafeTx`. Re-fetch on success.

- [ ] **Step 3: Compose into Auszahlungen.tsx** (CreatePayout above the PendingQueue) and wire into `page.tsx` replacing the placeholder.

- [ ] **Step 4: Verify end-to-end in the browser (threshold=1, smallest possible amount)**

With a real `SAFE_API_KEY`: create a tiny EURe payout (e.g. 0.01) to a test address. Expected: it appears in the queue, "Bereit zur Ausführung (1/1)" (threshold is 1), **Ausführen** executes gaslessly, a tx hash returns, the item disappears from pending and shows up in **Verlauf**. Confirm the same pending tx is visible in `app.safe.global` for the Safe (interop check). **Use a throwaway recipient and the smallest amount.**

- [ ] **Step 5: Commit, push**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse
git commit -m "feat(web): GK Auszahlungen — create, co-sign queue, execute (gasless)"
git push
```

---

# Phase 3 — Mitglieder (owners & threshold)

### Task 3.1: Owner-management transaction builders

**Files:**
- Modify: `apps/web/src/lib/gemeinschaftskasse/safe-client.ts`

**Interfaces:**
- Produces: `buildAddOwner(newOwner, threshold)`, `buildRemoveOwner(owners, owner, threshold)`, `buildChangeThreshold(threshold)` returning `MetaTransactionData` targeting the Safe itself (using `SAFE_ABI` + `prevOwner`).

- [ ] **Step 1: Add the builders**

Append to `safe-client.ts`:
```ts
import { encodeFunctionData as enc } from "thirdweb/utils";
import { SAFE_ABI } from "./constants";
import { prevOwner } from "./owners";
import { encodeFunctionData as viemEnc } from "viem";

export function buildAddOwner(newOwner: string, threshold: number) {
  return { to: GK_SAFE, value: "0", data: viemEnc({ abi: SAFE_ABI, functionName: "addOwnerWithThreshold", args: [newOwner as `0x${string}`, BigInt(threshold)] }) };
}
export function buildRemoveOwner(owners: string[], owner: string, threshold: number) {
  const prev = prevOwner(owners, owner);
  return { to: GK_SAFE, value: "0", data: viemEnc({ abi: SAFE_ABI, functionName: "removeOwner", args: [prev as `0x${string}`, owner as `0x${string}`, BigInt(threshold)] }) };
}
export function buildChangeThreshold(threshold: number) {
  return { to: GK_SAFE, value: "0", data: viemEnc({ abi: SAFE_ABI, functionName: "changeThreshold", args: [BigInt(threshold)] }) };
}
```
> Remove the unused `enc` import if `viemEnc` is used throughout; keep one encoder. (Cleanup note, not a placeholder.)

- [ ] **Step 2: Verify selectors with a Node script**

Create `apps/web/scripts/gk-verify-owner-tx.mjs` asserting the function selectors of the three encodings (e.g. `changeThreshold(uint256)` → `0x694e80c3`). Run with `node` → expect `✅`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/safe-client.ts apps/web/scripts/gk-verify-owner-tx.mjs
git commit -m "feat(web): GK owner/threshold transaction builders"
```

### Task 3.2: Mitglieder UI

**Files:**
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Mitglieder.tsx`
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`

**Interfaces:**
- Consumes: `/api/gemeinschaftskasse/overview` (owners + threshold); `safe-client.ts` builders + `signSafeTx`; `/propose`.

- [ ] **Step 1: Build the component**

Create `Mitglieder.tsx`: list owners by name; "Mitglied hinzufügen" (address input → `buildAddOwner`), per-owner "Entfernen" (`buildRemoveOwner` with the fetched owner order), and "Schwelle ändern" (number 1..ownerCount → `buildChangeThreshold`). Each action runs the same `initProtocolKit → resolveSigner → signSafeTx → POST /propose` flow as payouts, then routes the user to the Auszahlungen queue to collect approvals + execute. Reuse a shared `proposeMetaTx(metaTx)` helper extracted from `CreatePayout` to stay DRY.

- [ ] **Step 2: Extract shared `proposeMetaTx` helper**

Create `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/useProposeMetaTx.ts` wrapping `initProtocolKit → resolveSigner → signSafeTx → fetch('/propose')`; use it from both `CreatePayout` and `Mitglieder` (refactor `CreatePayout` to use it).

- [ ] **Step 3: Wire into page**, replacing the Mitglieder placeholder.

- [ ] **Step 4: Verify in the browser**

Propose a **changeThreshold(2)** as a self-test (don't execute unless you intend to). Expected: it appears in the Auszahlungen queue described as "Schwelle auf 2 ändern", visible in both the dashboard and `app.safe.global`. Add/remove owner forms validate addresses and produce correctly described pending items.

- [ ] **Step 5: Commit, push**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse
git commit -m "feat(web): GK Mitglieder — add/remove owner, change threshold"
git push
```

---

## Self-review against the spec

- **Dedicated page + sidebar item** → Task 1.6. ✓
- **Übersicht (balance €, owners by name, threshold, raise-threshold hint)** → Tasks 1.4, 1.7. ✓
- **Auszahlungen (propose → co-sign → execute, gasless)** → Tasks 2.1–2.3. ✓
- **Mitglieder (add/remove owner, change threshold via queue)** → Tasks 3.1–3.2. ✓
- **Verlauf (de-jargoned history)** → Tasks 1.5(describe), 1.8. ✓
- **No migration; detect smart-account vs admin-EOA owner; ERC-1271 vs ECDSA** → Tasks 0.2, 2.1. ✓
- **Safe Transaction Service via API Kit, server-side key proxy** → Tasks 1.5, 2.2. ✓
- **Reuse resolveIdentities / muenzen api / cache / gnosis reads** → Tasks 1.4, 1.5. ✓
- **German, no CRC jargon, never raw address as primary** → enforced in every UI task + describe.ts. ✓
- **Threshold=1 surfaced + raise action** → Tasks 1.7, 3.1–3.2. ✓
- **Phase 0 de-risks ERC-1271** → Task 0.2 (read-only `isValidSignature` + `checkSignatures`). ✓

**Known external contracts to confirm during implementation (recorded in commit messages, not guessed):**
1. Exact Protocol Kit export names + `Safe.init` / contract-signature helpers (Task 0.1/0.2).
2. `resolveIdentities` return shape (Task 1.4).
3. `requireAdmin`/`jsonError` usage convention (match `app/api/muenzen/*`) (Task 1.5).
4. API Kit constructor + method/result shapes (Tasks 1.5, 2.2).
5. The exact thirdweb smart-account signing recipe that yields the ERC-1271 MAGIC value (Task 0.2) — load-bearing; everything downstream depends on it.
