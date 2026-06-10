# MACI Coordinator — Shamir Operations Runbook

Operational guide for the 3-of-5 Shamir-split MACI coordinator that ships in
M1 → M4. Read this in the order the sections are written.

> **Status (2026-06-10):** end-to-end verified in production. Rotation
> proposal executed on Base mainnet; first Shamir tally for poll 3 ran
> successfully with 1/3 → 2/3 → 3/3 share submissions via the production
> tally page. See [`SHAMIR_CEREMONY.md`](./SHAMIR_CEREMONY.md) for the
> conceptual deep-dive on what the ceremony is and what Shamir actually
> does.

---

## 1. System architecture (one-screen mental model)

```
┌─ apps/web (Vercel) ──────────────────────────────────────────────────┐
│ /admin/dashboard/coordinator                                          │
│   - status dashboard, history, register-share-key, generate-key,      │
│     tally/[pollId]                                                    │
│ /api/coordinator/*                                                    │
│   - share-keys, key-generations, key-generations/[id]/proposal,       │
│     key-generations/[id]/executed, sessions, sessions/[id],           │
│     state, audit-log, chain-listener                                  │
└──────────────────────────────────────────────────────────────────────┘
                          │                            │
   FINALIZE_TOKEN-auth    │  wallet-signed             │  service_role
   ↓                      ↓  share submissions         ↓
┌─ apps/coordinator (Fly.io, roebel-maci-coordinator) ─────────────────┐
│  healthcheck.js  ←  POST /sessions  ←  apps/web                       │
│      │              POST /sessions/:id/submissions ← Attester browsers │
│      │              GET  /sessions/:id              ← apps/web         │
│      ↓ spawn child                                                    │
│  reconstructor.js                                                     │
│   ├─ writes coordinator_sessions row + signed manifest                │
│   ├─ awaits 3 of 5 share submissions on localhost:<port>              │
│   ├─ sssCombine → macisk → runFinalize() from finalize-helpers.js     │
│   ├─ zeros buffer, exits — privkey never written to disk              │
│      ↓                                                                │
│  scan-and-finalize.js (cron entry point) → POST /sessions per poll    │
└──────────────────────────────────────────────────────────────────────┘
                          │
                          ↓ tally tx
┌─ Base mainnet ───────────────────────────────────────────────────────┐
│ MaciAttesterGovernor (0xffCeE774…2a5b)                                │
│   ├ setCoordinatorPubKey   ← Governor proposal from generate-key page │
│   └ ProposalExecuted       → chain-listener polls this every 5 min    │
│ MACI v2 core + Tally       ← coordinator submits proof bundles        │
└──────────────────────────────────────────────────────────────────────┘
```

**Trust model:**
- ≥ 3 of 5 AttesterNFT-holders' wallets must voluntarily decrypt and submit
  their share for any vote to be decrypted.
- The reconstructor never persists the privkey to disk; it lives only in
  the forked child process's RAM for ~5 minutes per tally.
- Between tallies the Fly machine has no privkey at all. The legacy env
  var `COORDINATOR_PRIV` must be removed via `fly secrets unset COORDINATOR_PRIV`
  after the first Shamir tally has run end-to-end — that's the marker that
  the privacy-from-coordinator gap is actually closed.

---

## 2. First-time setup (one-shot)

### 2.1 Environment variables

**Fly.io (apps/coordinator):** set with `fly secrets set <K>=<V> -a roebel-maci-coordinator`.

| Secret | Description |
|---|---|
| `COORDINATOR_ETH_PRIV` | EOA private key that owns MessageProcessor + Tally; signs tally tx |
| `BASE_RPC_URL` | JSON-RPC endpoint (Alchemy/QuickNode); also for log scans |
| `BASE_ARCHIVE_RPC_URL` | Optional separate archive node for log queries |
| `MACI_ADDRESS` | MACI v2 core, currently `0xEbcF0628…492E` |
| `GOVERNOR_ADDRESS` | MaciAttesterGovernor, currently `0xffCeE774…2a5b` |
| `VERIFIER_ADDRESS` | from `deployments/base.json` |
| `VK_REGISTRY_ADDRESS` | same |
| `FINALIZE_TOKEN` | shared secret for `/finalize-pending` + `/sessions` auth; generate with `openssl rand -hex 32` |
| `COORDINATOR_SUPABASE_URL` | `https://wwbeqhkslxdxhktqzqti.supabase.co` |
| `COORDINATOR_SUPABASE_SERVICE_KEY` | Supabase **service_role** key (writes coordinator_* rows; do NOT use anon key) |
| `PUBLIC_HOST` | `https://roebel-maci-coordinator.fly.dev` (used in signed manifests so Attester browsers know which host they're hitting) |

After M3 ships and the first Shamir tally has completed end-to-end:
```bash
fly secrets unset COORDINATOR_PRIV -a roebel-maci-coordinator
```

**Vercel (apps/web):** Set in the Vercel project's Environment Variables UI.

| Variable | Description |
|---|---|
| `COORDINATOR_BASE_URL` | `https://roebel-maci-coordinator.fly.dev` |
| `COORDINATOR_FINALIZE_TOKEN` | same value as Fly's `FINALIZE_TOKEN` |
| `BASE_RPC_URL` | for the chain-listener route |
| `SUPABASE_SERVICE_ROLE_KEY` | already configured (used by existing API routes) |
| `NEXT_PUBLIC_SUPABASE_URL` | already configured |

### 2.2 Vercel cron (M4.B chain listener)

Add to `vercel.json` (or create it) at the repo root:

```jsonc
{
  "crons": [
    {
      "path": "/api/coordinator/chain-listener",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Every 5 minutes Vercel hits the chain-listener route, which:
1. Reads every `coordinator_key_generations` row with `proposal_id IS NOT NULL`
   and `activated_at IS NULL`.
2. Calls `governor.state(proposalId)` for each.
3. If state == 7 (Executed), PATCHes `activated_at = now()`, supersedes
   the previous active row, and writes a `pubkey_set_executed` audit row
   with the on-chain tx hash.

You can also hit the route manually:
```bash
curl https://roebel.app/api/coordinator/chain-listener
```

### 2.3 First-time Attester onboarding

Each of the 5 Attesters does this ONCE before any rotation can happen.

1. Sign into `/admin/dashboard/coordinator/register-share-key` with their
   thirdweb wallet.
2. Click **Registrieren**.
3. Wallet signs the constant challenge `SHARE_KEY_CHALLENGE`. Derives
   Curve25519. POSTs pubkey to `/api/coordinator/share-keys`.
4. Page shows `✓ Registriert` with the derived pubkey hex.
5. The Curve25519 PRIVATE key is regenerated from the wallet signature on
   every future tally — it is never stored anywhere. If the Attester loses
   their wallet, they also lose their AttesterNFT, so the failure modes are
   already aligned.

Status page must show 5/5 ✓ before the founder can run the first rotation.

---

## 3. Per-rotation workflow

A rotation is needed (a) the first time you switch off the legacy env-based
privkey, and (b) any time you want to swap a shareholder or change the
threshold, OR (c) on a periodic cadence for forward secrecy (recommended:
after every tally).

### 3.1 Founder runs the ceremony

URL: `/admin/dashboard/coordinator/generate-key`

1. Top card shows green "5/5 Attesters registered". If not, ping the missing
   wallets.
2. Click **Generieren** → browser generates a fresh Babyjubjub keypair via
   `maci-domainobjs`. Page shows `pubX`, `pubY`, and the last 8 hex of the
   privkey as a fingerprint. **DO NOT close this tab** until you've clicked
   through to the proposal tx.
3. Click **3. Teilen + Verschlüsseln + Persistieren** → wallet signs the
   canonical generation payload. Browser performs SSS split (3-of-5), seals
   each share to the Curve25519 pubkey of each registered Attester, and
   POSTs the bundle to `/api/coordinator/key-generations`. Server creates
   one `coordinator_key_generations` row + 5 `coordinator_shares` rows in
   one transaction.
4. Click **Proposal einreichen** → wallet signs the Governor `propose()` tx
   with calldata for `setCoordinatorPubKey({x, y})`. After mining, page
   PATCHes the generation row with `proposal_id` and `set_pubkey_tx_hash`.
5. Page navigates to the status dashboard. The privkey is dropped from
   React state.

### 3.2 Citizens vote

URL: `/app/proposals/[proposalId]` (the existing voting UI — no new code).
Voting closes after 1h, then a 1h Timelock period elapses before the
proposal can be executed.

### 3.3 Founder (or anyone) executes

Hit **Execute** in `/app/proposals/[proposalId]`. Within 5 minutes the
chain-listener cron will notice and PATCH `activated_at` on the generation
row. Alternatively the founder can click **Als ausgeführt markieren** on
the status page and paste the execution tx hash for an immediate update.

After execution, the on-chain `coordinatorPubKey()` matches the
generation's `(pubkey_x, pubkey_y)`. The status page's "Off-chain ⇄ on-chain
divergence" yellow banner disappears.

---

## 4. Per-tally workflow (when a real anonymous poll closes)

### 4.1 Auto-trigger via cron

`scan-and-finalize.js` runs from a GitHub Actions cron (existing — see
`.github/workflows/finalize-cron.yml`). For each pending poll, it POSTs to
its own `/sessions` endpoint instead of calling `finalize-poll.js` directly.

### 4.2 Founder manual trigger (UI)

URL: `/admin/dashboard/coordinator`

The "Tally-Sessions" card includes a Poll ID input. Founder types the poll
id, clicks **Session öffnen**, wallet signs, browser POSTs to
`/api/coordinator/sessions` which proxies the call (with `FINALIZE_TOKEN`)
to the coordinator service. The service spawns `reconstructor.js`.

### 4.3 Attesters submit shares

URL: `/admin/dashboard/coordinator/tally/[pollId]`

Each Attester opens the URL (linked from the status page when an open
session exists). The page:
1. Fetches the session via `/api/coordinator/sessions/[id]`.
2. Verifies the manifest signature recovers to
   `MACI_INFRA.coordinator` (`0x5e6528…184C`). **This is the trust root.**
   If it doesn't match, the page shows a red warning and refuses to submit.
3. Wallet signs `SHARE_KEY_CHALLENGE` → derives Curve25519 → opens the
   sealed share for THIS wallet.
4. Wallet signs `keccak256(sessionPubkey || shareIndex || wallet)`.
5. Browser POSTs the decrypted share + signature to the coordinator at
   `POST /sessions/:id/submissions`.
6. Coordinator service forwards to the localhost reconstructor.

Progress 1/3 → 2/3 → 3/3 visible on the page.

### 4.4 Reconstructor finalizes

Once 3 valid submissions are in, the reconstructor:
1. Calls `sssCombine` → 32-byte secret → `macisk.<hex>`.
2. Calls `runFinalize()` from `lib/finalize-helpers.js`: mergeSignups →
   mergeMessages → genProofs (~10 min on the 4 GB Fly machine) → proveOnChain
   → verify.
3. Zeros the macisk buffer in RAM, writes `session_completed` audit row,
   exits cleanly. Fly's child-process lifecycle reaps it.

The tally is now on-chain. The proposal becomes Succeeded/Defeated in the
existing `/app/proposals/[id]` UI.

---

## 5. Threshold / shareholder rotation

To change from 3-of-5 → 4-of-7 (or any other configuration), or to swap a
shareholder:

1. Have any new shareholders register at `/register-share-key`.
2. Founder runs a NEW key-generation ceremony at `/generate-key`. The UI
   currently bakes in 3-of-5 — adjust the `THRESHOLD` and `TOTAL_SHARES`
   constants in the generate-key page if you want a different split (this is
   a small code change, not a redeploy of contracts).
3. Old polls remain decryptable only by the old shareholder set (the
   sealed shares for old generations are still in `coordinator_shares`).
   Only future polls move under the new threshold.

The on-chain Governor doesn't care about thresholds — it just sees a new
pubkey. The threshold is purely an off-chain agreement.

---

## 6. Disaster recovery

### 6.1 An Attester is unreachable at tally time

Tally still works as long as **any 3 of 5** can decrypt. The expired
shareholder doesn't block anything. Audit log shows the missed submission
clearly.

### 6.2 A share is corrupted or rejected

Reconstructor logs the rejection reason. Fixes:
- Wrong wallet → the Attester is using a different wallet than the one
  registered. Re-register that wallet.
- Bad signature → wallet is out of sync. Reconnect and try again.
- Bad share bytes → the encrypted_share row in Supabase is corrupted.
  Re-run the key-generation ceremony with a fresh keypair.

### 6.3 Reconstructor times out (no 3 shares within `SESSION_TIMEOUT_MS`)

Default 4 hours. Session is marked `expired` in Supabase. Founder retriggers
via the status page when more Attesters are awake.

### 6.4 Reconstructor crashes mid-tally

The session row is marked `aborted` with the error in the payload. Cached
proof artifacts under `/app/proofs/poll-<id>/` survive (volume-mounted), so
re-triggering the session will resume from `genProofs`' last successful
batch. Idempotent.

### 6.5 We need to roll back to env-based privkey

Re-add `COORDINATOR_PRIV` as a Fly secret. `finalize-poll.js` will work again.
Set the chain listener to inactive so it doesn't trip on stale state. This
should only happen in a true emergency — it re-introduces the privacy gap.

---

## 7. Verifying the trust model end-to-end

After M3 ships, run this once to confirm everything works:

1. **Audit `fly secrets list`**: `COORDINATOR_PRIV` should be absent.
2. **`curl https://roebel-maci-coordinator.fly.dev/healthz`**: returns `ok`.
3. **`curl https://roebel-maci-coordinator.fly.dev/status`**: shows
   `activeSession: null` (no privkey in memory between tallies).
4. **Inspect a session row in Supabase** after one tally:
   `select reconstructor_session_signature from coordinator_sessions where state = 'completed' order by created_at desc limit 1`.
   The signature should recover to `0x5e6528…184C` (the coordinator EOA),
   confirming that browsers were correctly verifying the trust root.
5. **Inspect a session_completed audit row**: the payload should reference
   a `tallyFile` path; no privkey, no shares.
6. **Re-run `verify-shamir.mjs`** at `apps/web/scripts/verify-shamir.mjs`:
   12/12 assertions pass.

If all six pass, the privacy-from-coordinator gap is closed.

---

## 8. Operating costs

- Fly machine (existing): ~$15/month at 4 GB / 2 shared CPUs.
- Supabase row growth: negligible (~5 rows per rotation + ~5 per tally).
- Vercel cron: free tier covers a 5-minute schedule comfortably.
- On-chain gas per rotation: ~150k gas per `setCoordinatorPubKey` tx
  (≈$0.01 on Base) plus ~3M gas for the Governor `propose` + `queue` +
  `execute` (≈$0.30).
- Per tally: ~30M gas across proveOnChain + addTallyResults (≈$3 on Base).

---

## 9. Production lessons from the first end-to-end run (2026-06-09 → -10)

The first real Shamir tally surfaced five non-trivial bugs that
would not have appeared in any local dev test. Each was fixed and
re-deployed live. Documenting them here so anyone reverting to
older code or rebuilding from scratch knows to keep these patches.

### 9.1 Smart-wallet ERC-1271 verification

**Symptom:** Attester clicks **Anteil einreichen**, gets HTTP 401
`submission signature does not match wallet`. Wallet was definitely
correct (Attester is on the allowlist, holds the share).

**Cause:** thirdweb's `inAppWallet + smartAccount` setup signs via
the underlying embedded EOA but `account.address` is the
smart-account address. Plain `ethers.verifyMessage` (EIP-191
recovery) returns the EOA, not the smart-account address →
mismatch → 401.

**Fix:** Mirror the ERC-1271 fallback that
`apps/web/src/lib/shamir/signature-verification.ts` already
implemented for share-key registration. See
`apps/coordinator/scripts/lib/session-manifest.js → verifySubmissionSignature()`.
The pattern: try EIP-191 recovery first; if it doesn't match AND
`wallet` has on-chain bytecode, call
`isValidSignature(hash, signature)` on the smart-account contract and
accept when it returns the `0x1626ba7e` magic value. Plain EOAs
never trigger an RPC call.

Anywhere a *user-controlled* wallet signs anything verified
server-side, this pattern is required. The same applies to the
Governor's `coordinator()` value — if you ever switch the coordinator
EOA to a smart account, the verifier on the tally page needs the
same fallback.

### 9.2 Manifest timestamp serialization mismatch

**Symptom:** tally page shows red "Session-Manifest ungültig — manifest
signature does not recover to coordinator: got 0xa0C5…8FE2" even
though Fly's `COORDINATOR_ETH_PRIV` legitimately derives to the
on-chain coordinator address.

**Cause:** Fly's `reconstructor.js` signs the manifest payload after
calling `new Date(...).toISOString()` on `expiresAt`, producing the
`"…Z"` form (e.g. `"2026-06-09T23:53:56.407Z"`). Postgres returns
the same `timestamptz` column as `"2026-06-09T23:53:56.407+00:00"`.
Both represent the same instant but are different byte strings.
`JSON.stringify` in `buildManifestPayload` includes the raw value
verbatim → verifier reconstructs a different payload → recovers a
deterministically-wrong address.

**Fix:** `apps/web/src/lib/shamir/tally-session.ts → verifySessionManifestFull`
normalizes `expiresAt` via `new Date(session.expires_at).toISOString()`
before assembling the manifest. Both encoders now produce identical
bytes.

**Generalization:** any byte-canonical signed payload sourced from
Postgres needs normalization at the boundary. Timestamps, addresses,
JSON arrays (sort + lowercase!), and any whitespace from server
formatters can all silently desync sign-side and verify-side.

### 9.3 Orphan-session race in reconstructor spawn

**Symptom:** open a fresh tally session, submit a share, get HTTP 410
`session not active on this machine` even though Fly logs clearly show
the reconstructor running and ready for the new session ID.

**Cause:** `healthcheck.js → startReconstructorSession` polls Supabase
every 500ms for "most recent open session for poll N" to wire up
`activeSession.sessionRow`. The reconstructor child takes ~1s to do
its boot (load deps, fetch active generation, fetch shares, sign
manifest, INSERT row). In that gap, any prior open session row for
the same poll (e.g. one orphaned by the previous Fly redeploy) wins
the parent's query, and `activeSession.sessionRow.id` locks to the
orphan UUID. Every subsequent `/sessions/<new-id>/submissions` POST
fails the equality check at `forwardSubmissionToReconstructor` →
returns 410.

**Fix:** two-layer defense, either alone would close the race:

1. `reconstructor.js` sweeps prior open sessions for its poll to
   `state='aborted'` BEFORE inserting its own row. After this UPDATE
   the orphan no longer reads as `open`.
2. `healthcheck.js` filters the poll query by
   `created_at >= startedAt`. Even if the child's UPDATE hasn't run
   yet, the parent can't see any row older than the spawn timestamp.

Keep both. (1) handles the case where the parent's poll wins the race
mid-query; (2) handles the case where the parent polls before the
child has even loaded.

### 9.4 CORS on `/sessions/:id/submissions`

**Symptom:** browser POST from `https://www.roebel.app` to Fly's
submission endpoint blocked with `No 'Access-Control-Allow-Origin'
header is present on the requested resource`.

**Cause:** Fly's `healthcheck.js` had no CORS handling on any endpoint.
For server-to-server routes (`/sessions`, `/finalize-pending`,
`/status`) that's correct — they shouldn't accept browser cross-
origin calls at all. But `/sessions/:id/submissions` is *specifically
designed* to receive direct browser POSTs of decrypted shares — that
share **must not** pass through Vercel because that would put it in
front of an additional trust boundary.

**Fix:** Allow exactly the prod web origin + localhost dev, and only
on the submission endpoint. See the `CORS_ORIGIN_ALLOWLIST` and
`applyCorsForSubmissions` in `healthcheck.js`. Handles the OPTIONS
preflight (browsers send it before a JSON POST) and echoes
`Access-Control-Allow-Origin` on the POST response.

Do **not** generalize this to other endpoints. Leaving them
non-CORS means a browser literally cannot call them — which is the
correct security posture for an endpoint that shouldn't be browser-
reachable in the first place.

### 9.5 No-op survey proposals revert on execute

**Symptom:** queue + execute on a survey proposal (e.g. `Bürgerumfrage
finaler Test`) reverts with `GovernorDisabledDeposit`.

**Cause:** OZ Governor's `receive()` reverts with
`GovernorDisabledDeposit` unless `msg.sender == address(this)`. Survey-
style proposals are created with `targets=[Governor], values=[0],
calldatas=["0x"]`. The Timelock's `execute()` then calls the Governor
with empty calldata → Solidity dispatches to `receive()` → revert. The
proposal is structurally un-executable.

**Fix:** Hide the Execute button when calldata is no-op. See
`apps/web/src/app/admin/dashboard/coordinator/proposals/page.tsx →
probeIsNoop`. The row instead shows: "Survey-Vorschlag — keine
Ausführung möglich. Das Ergebnis steht im Tally-Vertrag, der Vorschlag
bleibt dauerhaft im Zustand 'In Timelock'."

This isn't a bug in the queue/execute code — it's a property of
no-action proposals. The tally result IS the artifact; on-chain
execution would be a no-op anyway.

### 9.6 publicnode RPC sometimes returns null receipts

**Symptom:** `/api/coordinator/proposal-action/[txHash]` returns 404
`tx not found` even though the tx has hours of confirmations on
BaseScan.

**Cause:** `https://base-rpc.publicnode.com` (default `BASE_RPC_URL`
in dev environments) occasionally returns `{ "result": null }` for
`eth_getTransactionReceipt` on otherwise-confirmed transactions.
Possibly a node lagging behind, possibly partial archive.

**Fix:** RPC fallback chain. `apps/web/src/app/api/coordinator/proposal-action/[txHash]/route.ts`
iterates through `BASE_RPC_URL → mainnet.base.org → 1rpc.io/base →
publicnode` and uses whichever first returns a receipt.

Worth applying this pattern to any Vercel route that reads on-chain
receipts. RPC availability is the dominant source of flake in
client-facing endpoints.

### 9.7 propose() decoded from event, not tx input

**Symptom (earlier):** queue button reverts with 422 `tx is not a
propose() call` even on legit propose transactions.

**Cause:** thirdweb's smart-account stack means the propose tx
actually lands on-chain as `EntryPoint.handleOps(...)` (ERC-4337),
not as a direct `Governor.propose(...)`. Decoding the tx's input
bytes as a propose() call selector-mismatches and returns 422.

**Fix:** Decode from the `ProposalCreated` **event log** the Governor
emits, regardless of how the tx reached it. The event always carries
`(proposalId, proposer, targets, values, signatures, calldatas,
voteStart, voteEnd, description)`. See
`apps/web/src/app/api/coordinator/proposal-action/[txHash]/route.ts`.

Also caught a subtle ethers-v6 gotcha along the way:
`decoded.args.values` returns `Array.prototype.values()` (the iterator
method) instead of the `bigint[]` because of name shadowing. Use
positional access (`decoded.args[3]`) instead.

---

## 10. Where to look when something is wrong

| Symptom | First check |
|---|---|
| Registration POST 401 | `verifyWalletSignature` failed — wallet signed wrong message |
| Registration POST 403 | Wallet doesn't hold AttesterNFT at `0xa06F09Cb…DA73` |
| Generate-key wizard stuck on "Persistiere…" | Inspect `/api/coordinator/key-generations` server logs — most likely Supabase service-role key not set on Vercel |
| Tally page shows red "manifest signature invalid" | Reconstructor signed with wrong key. Check `COORDINATOR_ETH_PRIV` on Fly matches `MACI_INFRA.coordinator` |
| Reconstructor never spawns | `FINALIZE_TOKEN` missing or wrong on Vercel (`COORDINATOR_FINALIZE_TOKEN`) |
| Active generation never marked activated | Chain listener cron not configured in `vercel.json`, or `BASE_RPC_URL` missing on Vercel |
| `proveOnChain` fails with gas limit | Known issue — handled by `chunkedAddTallyResults`. If still failing, the maci-cli was updated; rebuild Docker image |

---

## 10. Production lessons (2026-06-09 / 2026-06-10 rollout)

End-to-end Shamir tally hit a sequence of seven bugs the first time it
was run on real data. All fixed; flagging them here so future
contributors don't relearn the same lessons.

### 10.1 publicnode RPC returns null receipts for some txs

The Vercel default `BASE_RPC_URL` was `https://base-rpc.publicnode.com`.
For the rotation propose tx specifically, `eth_getTransactionReceipt`
returns `{ result: null }` even hours after confirmation — `mainnet.base.org`
and `1rpc.io/base` return the full receipt. The
`/api/coordinator/proposal-action/[txHash]` route now iterates through
a fallback chain (`BASE_RPC_URL → mainnet.base.org → 1rpc.io/base →
publicnode`) and uses whichever first returns a receipt. Don't pin a
single endpoint.

### 10.2 Smart-account propose() can't be decoded from tx input

Thirdweb's inAppWallet+smartAccount stack lands `propose()` as
`EntryPoint.handleOps(...)`, not as a direct call to the Governor.
Decoding the tx input bytes as a propose() call therefore fails with
422. Fix: decode from the `ProposalCreated` event log emitted by the
Governor itself, which is wallet-stack-agnostic. The
proposal-action route also re-derives `proposalId` from
`keccak(abi.encode(targets, values, calldatas, descriptionHash))` and
refuses to return mismatched data so a bad tuple can never trigger an
on-chain revert.

### 10.3 ethers v6 `Result.values` collides with `Array.prototype.values()`

When parsing the ProposalCreated event log, `decoded.args.values`
returns the iterator function instead of the `bigint[]` because
ethers v6's Result type doesn't shadow prototype methods. Use
positional access: `decoded.args[3]`. Cost us two hours.

### 10.4 useSendTransaction silently drops callbacks

thirdweb's `useSendTransaction().mutate(tx, { onSuccess, onError })`
intermittently fires neither callback under conditions we never
isolated. Symptom: 5-8 sec spinner, then nothing — no console log, no
state change. Drop down to `sendTransaction({ transaction, account })`
+ `waitForReceipt(...)` directly. Explicit promise chain, real
try/catch.

### 10.5 Manifest signature: ISO `Z` vs `+00:00`

The reconstructor signs the session manifest after `new Date(...).toISOString()`,
producing `"…Z"`. Postgres returns the same timestamptz as `"…+00:00"`.
Both represent the same instant but are different bytes. JSON.stringify
in `buildManifestPayload` includes the value verbatim, so the verifier
reconstructs a payload that doesn't byte-match what was signed — and
EIP-191 recovery returns a wrong-but-deterministic address. Fix:
normalize via `new Date(session.expires_at).toISOString()` in
`verifySessionManifestFull` before assembling the manifest. The bug
shows up as "Session-Manifest ungültig — manifest signature does not
recover to coordinator" with a wrong (non-coordinator) recovered
address.

### 10.6 CORS on /sessions/:id/submissions

Browsers POST decrypted shares **directly** to Fly (the share MUST NOT
go through Vercel; that would add a trust boundary the privacy model
is designed to avoid). The healthcheck.js server needs explicit CORS
headers on that one endpoint:

```js
const CORS_ORIGIN_ALLOWLIST = new Set([
  "https://www.roebel.app",
  "https://roebel.app",
  "http://localhost:3000",
]);
```

Allowlist only the submission endpoint — `/status`, `/sessions`,
`/finalize-pending` are server-to-server and have no business
advertising cross-origin acceptance.

### 10.7 Orphan-session race in startReconstructorSession

When the parent (healthcheck.js) spawns a reconstructor child, it
polls Supabase every 500 ms for "most recent open session for poll N"
to wire up `activeSession.sessionRow`. The child's INSERT takes ~1 s
(load deps → fetch generation → fetch shares → sign manifest →
INSERT). In that gap, any prior `open` row for the same poll wins
the query — locking `activeSession.sessionRow.id` to the orphan UUID.
Every subsequent `/sessions/<new-id>/submissions` then 410s with
"session not active on this machine."

Two-layer fix:
- **reconstructor.js** sweeps prior open sessions for its poll to
  `aborted` BEFORE inserting its own row.
- **healthcheck.js** filters its row-poll by `created_at >= startedAt`
  — orphans can't be returned even before the child sweeps.

This happens every Fly redeploy that interrupts a live session; the
sweep is what cleans it up automatically on next session-open.

### 10.8 ERC-1271 fallback in verifySubmissionSignature

Attester wallets that are thirdweb smart-accounts produce signatures
whose EIP-191 recovery returns the underlying EOA, not the smart-
account address. `ethers.verifyMessage(payload, signature) === wallet`
fails. Same fix already in `signature-verification.ts` for share-key
registration: mirror it into `session-manifest.js` —
`isValidSignature(hash, sig)` on the smart-account contract, check
for the `0x1626ba7e` magic value. Plain EOAs skip the RPC call.

### 10.9 Survey proposals trigger `GovernorDisabledDeposit` on execute

The proposal-creation UI for citizen surveys produces proposals with
`targets=[Governor], values=[0], calldatas=["0x"]`. OZ Governor's
`execute()` routes the empty calldata to `receive()`, which reverts
with `GovernorDisabledDeposit()` if `_executor() != address(this)` —
i.e., always, since the Timelock is the executor. Survey proposals
are therefore inherently unexecutable. The admin Vorschläge page
detects empty calldata + zero values and replaces the Execute button
with an inline note explaining the proposal is tally-only.

### 10.10a CRITICAL: never hardcode the coordinator pubkey in a voting client

The Expo app shipped with a hardcoded `MACI_COORDINATOR_PUBKEY` constant
used for ECDH vote encryption. After the key rotation executed, new polls
were deployed bound to the NEW pubkey while the app kept encrypting to
the OLD one. The MACI Process circuit treats undecryptable messages as
no-ops — so polls 3 and 4 tallied **0/0/0 with zero errors anywhere**,
despite citizens voting. The Shamir pipeline was innocent: it correctly
proved that no valid ballots existed.

Fix (commit `4da83fd`): the client reads `coordinatorPubKey()` from the
Poll contract itself at vote time (a poll is permanently bound to the
key it was deployed with), and `buildVoteMessage` requires the key as an
argument — the constant and its fallback were deleted so this bug class
cannot recur. If the on-chain read fails, the vote aborts loudly.

Detection heuristic for the future: `Poll.numMessages() > 0` but
`tallyResults` all-zero after a successful tally = ballots encrypted to
the wrong key. Check what pubkey the client used vs. the poll's
DeployPoll event.

Related decode trap: MACI v2's `tallyResults(uint256)` getter returns
`(uint256 value, bool isSet)` — value FIRST. Declaring it backwards
decodes the isSet flag as the count (reads as "1"), which masked this
incident during initial verification.

### 10.10 No-cost on-chain merge pre-work from a failed legacy attempt

If someone accidentally clicks the (now-removed) legacy Tally button
on a poll bound to the new Shamir-split pubkey, `finalize-poll.js`
calls `mergeSignups` + `mergeMessages` (key-independent, succeed
on-chain) and then aborts at the `coordinatorKeypair.pubKey.hash() ===
coordinatorPubKeyHashOnChain` assertion before doing any proof work.
The merged state is committed on-chain and `runFinalize` from the
subsequent Shamir flow detects it (`Poll.stateMerged()` and
`Poll.messageAqMerged()`) and skips re-merging. The "failed legacy
attempt" is effectively free pre-work for the Shamir tally.
