# MACI Coordinator — Shamir Operations Runbook

Operational guide for the 3-of-5 Shamir-split MACI coordinator that ships in
M1 → M4. Read this in the order the sections are written.

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

## 9. Where to look when something is wrong

| Symptom | First check |
|---|---|
| Registration POST 401 | `verifyWalletSignature` failed — wallet signed wrong message |
| Registration POST 403 | Wallet doesn't hold AttesterNFT at `0xa06F09Cb…DA73` |
| Generate-key wizard stuck on "Persistiere…" | Inspect `/api/coordinator/key-generations` server logs — most likely Supabase service-role key not set on Vercel |
| Tally page shows red "manifest signature invalid" | Reconstructor signed with wrong key. Check `COORDINATOR_ETH_PRIV` on Fly matches `MACI_INFRA.coordinator` |
| Reconstructor never spawns | `FINALIZE_TOKEN` missing or wrong on Vercel (`COORDINATOR_FINALIZE_TOKEN`) |
| Active generation never marked activated | Chain listener cron not configured in `vercel.json`, or `BASE_RPC_URL` missing on Vercel |
| `proveOnChain` fails with gas limit | Known issue — handled by `chunkedAddTallyResults`. If still failing, the maci-cli was updated; rebuild Docker image |
