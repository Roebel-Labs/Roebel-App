# Gemeinschaftskasse — Safe MultiSig in the Web Admin Dashboard

- **Date:** 2026-06-28
- **Status:** Approved design — ready for implementation plan
- **Author:** Brainstormed with the maintainer
- **Scope app:** `apps/web` (Next.js 15 admin dashboard)

## 1. Problem

The civic treasury "Gemeinschaftskasse" is a Gnosis **Safe** multisig
(`0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa`). Today it is operated through the
official Safe web app (`app.safe.global`). That UI is full of crypto wording,
raw token tickers, and 0x addresses — too much friction for the Attesters who
are (or want to become) multisig signers.

**Goal:** replicate the Safe's functionality inside the existing web admin
dashboard with de-jargoned, German, name-first UX, so an Attester can manage the
treasury after a normal email/phone login — no external wallet, no Safe app.

## 2. Goals / Non-goals

**Goals**
- A dedicated **"Gemeinschaftskasse"** page (own sidebar item, not a sub-section).
- Read: treasury balance (€), owners (as names), threshold, transaction history.
- Send funds (xDAI / EURe / Röbel-Münzen): propose → co-sign → execute.
- Manage owners & threshold (add/remove signer, change M-of-N) via the same queue.
- Email/phone login signing — reuse the existing thirdweb connection; no migration.
- Interoperable with the official Safe app as a guaranteed fallback.

**Non-goals (this iteration)**
- Arbitrary contract calls / "transaction builder" (NFT thresholds, Circles group
  ownership). Deferred — power-user surface; can be a later phase.
- Changing the Safe's owner set as a migration step (not needed — see §4).
- Replacing the official Safe app (it stays available as a fallback).

## 3. Verified on-chain state (Gnosis, 2026-06-28)

Queried directly against `rpc.gnosischain.com`:

- **Safe:** `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa`, **version 1.4.1**.
- **Threshold: 1** (currently **1-of-3** — any single owner can move funds today).
- **Owners (3):**
  - `0xf468d87fca0e15bc2c383ef482d38b9b77812b29` — **contract** (thirdweb smart account)
  - `0x90f677dc480e76a127ec1dce42263a370e396313` — **contract** (thirdweb smart account)
  - `0x1c11f068c83d364ad0a015c01d51d2cc6c62d1f9` — **EOA**

This is the linchpin finding: **thirdweb smart accounts already serve as Safe
owners on this Safe** (proving the ERC-1271 contract-signature path works in
production), alongside one plain EOA. So no owner migration is required — the
dashboard just needs to detect which identity the connected user holds and sign
accordingly.

> The maintainer exported a thirdweb wallet private key into MetaMask to use the
> Safe app. Note: that exported key is the **admin EOA** underlying a smart
> account; the app normally connects as the **smart account** (a different
> address that wraps that EOA). The dashboard handles both — see §6.

## 4. Architecture decisions

### 4.1 Signing model — no migration
Reuse the existing thirdweb `inAppWallet + smartAccount` connection
([wallet-config.ts](../../../apps/web/src/lib/wallet-config.ts),
[ConnectButton in admin-sidebar.tsx](../../../apps/web/src/components/admin/admin-sidebar.tsx)).
On connect, resolve **both** candidate signer addresses for the user:
1. the smart-account address (`useActiveAccount()`), and
2. its **admin EOA** (`wallet.getAdminAccount?.()` / thirdweb admin signer),

then check each against on-chain `getOwners()`. Whichever is an owner becomes the
active signer. Signing goes through the Safe **Protocol Kit**:
- **EOA owner** → standard ECDSA signature.
- **Smart-account owner** → ERC-1271 contract signature (the admin EOA signs the
  Safe tx hash; the smart account's `isValidSignature` validates it; assembled as
  a Safe contract signature with `v=0`).

### 4.2 Queue backend — Safe Transaction Service (API Kit)
The shared queue of partially-signed transactions lives in **Safe's hosted
Transaction Service**, accessed via `@safe-global/api-kit`. Rationale:
- Battle-tested tx hashing / signature assembly.
- **Interoperable** — pending txs also appear in `app.safe.global`, a guaranteed
  fallback if the dashboard ever breaks (important during the trust transition).
- Minimal new infra.

Trade-off accepted: requires a (free) **Safe API key** and is subject to free-tier
rate limits (2 rps / 5k req per month — ample for 3–5 signers). Gnosis Chain is
officially supported by the Transaction Service.

### 4.3 Key safety — server-side proxy
The Safe API key is **never** exposed to the browser. Matching the existing
`/api/muenzen/*` pattern (server routes + `requireAdmin`), all Transaction
Service calls go through thin Next.js routes under
`apps/web/src/app/api/gemeinschaftskasse/*` that hold the key server-side. The
browser only ever **signs**; it sends the signature to the server route, which
proposes/confirms via API Kit. On-chain reads (balances, owners, threshold,
history) also run server-side via the existing viem client
([lib/muenzen/gnosis.ts](../../../apps/web/src/lib/muenzen/gnosis.ts)).

### 4.4 Execution & gas
Once the threshold is met, the connected user executes `execTransaction`. Sent
from a **smart-account** signer it is **gasless** via the existing thirdweb gas
sponsorship (`sponsorGas: true`). From the EOA signer it costs a few cents of
xDAI. Execution can be performed by any owner; the UI offers it to whoever
crosses the threshold.

## 5. Page structure & routing

- **Sidebar:** add a `"Gemeinschaftskasse"` entry to `extraLinks` in
  [admin-sidebar.tsx](../../../apps/web/src/components/admin/admin-sidebar.tsx)
  (lucide `Landmark` icon, `href: "/admin/dashboard/gemeinschaftskasse"`).
- **Route:** `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`
  (client component; protected by existing middleware + dashboard session).
- **Tabs** (in-page, same shell style as the Münzen console):
  1. **Übersicht** — balance (€), owners as names, threshold, "raise threshold" hint.
  2. **Auszahlungen** — create payout + the pending approval queue.
  3. **Mitglieder** — add/remove owner, change threshold (queued like any tx).
  4. **Verlauf** — human-readable executed-transaction history.

## 6. Data layer

New module `apps/web/src/lib/gemeinschaftskasse/` mirroring `lib/muenzen/`:
- `constants.ts` — Safe address (reuse `ADDR.safe`), Safe v1.4.1 ABI fragments
  (`getOwners`, `getThreshold`, `nonce`, `getTransactionHash`, `execTransaction`,
  `addOwnerWithThreshold`, `removeOwner`, `changeThreshold`), token list
  (xDAI native, EURe, Röbel-Münzen group token).
- `safe-reads.ts` (server-only) — `getOwners()`, `getThreshold()`, treasury
  balances (reuse `nativeBalance` / `eureBalance` / `rcrcBalance` from
  `lib/muenzen/gnosis.ts`), resolve owner addresses → names via
  [resolveIdentities](../../../apps/web/src/lib/muenzen/identity.ts).
- `safe-client.ts` (client) — Protocol Kit init bridged to thirdweb via
  `EIP1193.toProvider({ wallet, chain, client })`; helpers to build a Safe tx,
  compute its hash, and sign (ECDSA or ERC-1271 contract signature).
- `format.ts` — €/Münzen formatting; "Wartet auf Freigaben (n/m)" labels.

API routes under `apps/web/src/app/api/gemeinschaftskasse/`:
- `GET overview` — owners (names), threshold, balances (cached via `lib/muenzen/cache.ts`).
- `GET pending` — pending txs + per-tx confirmations (API Kit).
- `POST propose` — accept a signed Safe tx from the client → `proposeTransaction`.
- `POST confirm` — accept an additional signature → `confirmTransaction`.
- `GET history` — executed multisig txs (API Kit), de-jargoned for the Verlauf tab.

All routes use `requireAdmin` / `jsonError` from
[lib/muenzen/api.ts](../../../apps/web/src/lib/muenzen/api.ts) and never expose the API key.

## 7. Feature specs

### 7.1 Übersicht
- Treasury balance card in € (xDAI→€ + EURe, indicative; Röbel-Münzen shown
  separately and labelled non-redeemable, consistent with `treasuryEuro()`).
- Owners list as **names** (attester display name; never raw 0x — short address
  only as a muted secondary per the house rule).
- Threshold sentence: "Aktuell genügt **1 von 3** Freigaben." If threshold < 2,
  show a gentle recommendation banner to raise it (links to Mitglieder).
- "Du bist Mitsignierer" badge when the connected user is an owner.

### 7.2 Auszahlungen (propose → co-sign → execute)
- **Create:** recipient (name search → resolves to address) + amount + asset
  (xDAI / EURe / Röbel-Münzen) + optional note. Build the Safe tx (native
  transfer or ERC-20/ERC-1155 transfer calldata), sign, `POST propose`.
- **Queue:** list pending payouts with "Wartet auf Freigaben (n/m)", who has
  approved (names), and a **Freigeben** button for owners who haven't yet signed.
- **Execute:** once confirmations ≥ threshold, an **Ausführen** button executes
  `execTransaction` (gasless via smart account). Success → moves to Verlauf.
- Guards: only owners can propose/sign/execute; non-owners see a read-only queue.

### 7.3 Mitglieder
- List current owners (names) + threshold.
- **Mitglied hinzufügen** → `addOwnerWithThreshold(newOwner, threshold)`.
- **Mitglied entfernen** → `removeOwner(prevOwner, owner, threshold)` (compute the
  linked-list `prevOwner` from `getOwners()` ordering).
- **Schwelle ändern** → `changeThreshold(n)`.
- Each action is a Safe transaction → goes through the same propose/co-sign/execute
  queue (these are calls to the Safe itself).

### 7.4 Verlauf
- Executed multisig transactions, newest first, rendered in plain German:
  "Auszahlung 50 € an Anna", "Mitglied hinzugefügt", "Schwelle auf 2 geändert".
- Link out to Gnosisscan for the curious (secondary, not primary).

## 8. Signing flow detail (the one fiddly part)

1. Server builds the canonical Safe tx fields (to, value, data, operation,
   nonce from `getNonce`) and returns them (or the client builds via Protocol Kit
   from the same inputs).
2. Client computes the Safe **transaction hash** (Protocol Kit `getTransactionHash`).
3. Client signs:
   - **EOA owner:** `account.signMessage({ message: { raw: safeTxHash } })` → ECDSA.
   - **Smart-account owner:** the thirdweb account signs the hash; the resulting
     signature is wrapped as a Safe **contract signature** (signer = smart-account
     address, `v=0`, dynamic part = the signature bytes the account's
     `isValidSignature` accepts). Round-trips because thirdweb signs and validates
     with the same scheme.
4. Client `POST`s the signature to `propose` (first signer) or `confirm`
   (subsequent signers); the server forwards via API Kit.
5. When confirmations ≥ threshold, client assembles the combined signature
   (Protocol Kit `buildSignatureBytes`, sorted by signer) and submits
   `execTransaction` via thirdweb `sendTransaction` (gasless).

> **Phase 0 spike** validates step 3's smart-account (ERC-1271) path end-to-end
> with a throwaway transaction before any UI is built. Trivial today since
> threshold = 1.

## 9. Dependencies & environment

- **npm (apps/web):** `@safe-global/protocol-kit`, `@safe-global/api-kit`.
  (thirdweb's `EIP1193` provider adapter is already available in `thirdweb`.)
- **Env:**
  - `SAFE_API_KEY` — server-only, free Safe developer API key (Transaction Service).
  - `GNOSIS_RPC_URL` — already used by `lib/muenzen/gnosis.ts`.
  - Safe address reuses the existing `ADDR.safe` constant; no new public env needed.
- Add `SAFE_API_KEY` to `apps/web/.env.example` (placeholder only).

## 10. Security & risks

- **Threshold = 1 today.** Any single owner can move funds. The Mitglieder tab
  makes raising it to e.g. 2-of-3 a first-class action; recommend doing so early.
- **ERC-1271 signing format** (§8) is the main technical risk → de-risked by the
  Phase 0 spike.
- **API key exposure** — mitigated by the server-proxy design (§4.3).
- **Recovery model** unchanged from today (owners are already app-derived
  accounts); email/social account security still gates signing. The lone EOA
  owner currently acts as a non-app recovery anchor — keep it.
- **Identity gate** — the dashboard's shared password stays; signing actions are
  additionally gated on "connected wallet is a current Safe owner".
- **Never show raw addresses** — all owner/recipient rendering goes through
  `resolveIdentities`; raw 0x only as a muted secondary, per the house rule.
- **Copy rules** — German; currency only ever "Röbel-Münzen" / € (never CRC).

## 11. Phasing / milestones

- **Phase 0 — Spike:** connect → detect owner identity → build/sign/propose/
  execute one trivial test tx (validates the ERC-1271 path). Throwaway code.
- **Phase 1 — Übersicht + Verlauf:** sidebar item, route shell, read-only data
  layer + API routes, balances/owners/threshold/history. Low risk.
- **Phase 2 — Auszahlungen:** propose → co-sign → execute for fund transfers.
- **Phase 3 — Mitglieder:** add/remove owner, change threshold + raise-threshold
  recommendation surfaced in Übersicht.

## 12. Open questions / future work

- Should Verlauf also include incoming transfers (deposits), or only outgoing
  multisig txs? (Lean: multisig txs first; deposits later.)
- Advanced contract-call surface (deferred non-goal) — revisit once the core flow
  is trusted, to retire the Safe app entirely for governance actions.
- Optional later upgrade: mirror/cache the queue in Supabase for faster UI
  (the "hybrid" option), keeping Transaction Service as source of truth.
