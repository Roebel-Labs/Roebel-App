# Roebel MACI Coordinator Service

The MACI v2 coordinator for the Roebel/Müritz DAO. Wraps `maci-cli@2.5.0` in a containerized service deployed to Fly.io (Frankfurt region) so we can finalize encrypted polls deterministically.

This service is **not user-facing**. It runs the post-vote ZK pipeline:

```
mergeSignups → mergeMessages → genProofs → proveOnChain → verify
```

…against a poll deployed by the on-chain `MaciAttesterGovernor`, then writes the tally to the Tally contract. Only after that step can `governor.execute(proposalId)` actually run, because the Governor's `_quorumReached` and `_voteSucceeded` overrides read live data from `Tally.totalSpent` and `Tally.tallyResults(...)`.

## Architecture (v1)

```
Attester proposes ─► Governor.propose ─► MACI.deployPoll ─► Poll/MP/Tally created
                                                          │
                                              MP & Tally owner = COORDINATOR_ETH_PRIV
                                                          │
                                         Citizens cast encrypted ballots on Poll
                                                          │
                                                  ── voting deadline ──
                                                          │
                                                          ▼
       ┌────────────────────────────── Fly.io machine (this service) ───────────────────┐
       │  $ node scripts/finalize-poll.js <pollId>                                       │
       │  reads zKeys + COORDINATOR_PRIV (Babyjubjub) + COORDINATOR_ETH_PRIV (EOA)       │
       │  writes proofs to /app/proofs/poll-<id>/, posts on-chain via maci-cli           │
       └────────────────────────────────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                              Tally.isTallied() = true → Governor execution unlocks
```

## Files

| File | Purpose |
|---|---|
| [Dockerfile](Dockerfile) | Node 20 + maci-cli@2.5.0 + ceremony zKeys (~1.5 GB) baked in |
| [fly.toml](fly.toml) | Fly app `roebel-maci-coordinator` in `fra` region, 4 GB RAM, 2 shared CPUs, 5 GB volume |
| [scripts/healthcheck.js](scripts/healthcheck.js) | Default container process. HTTP `:8080/healthz` + `/status` endpoints |
| [scripts/finalize-poll.js](scripts/finalize-poll.js) | The real workhorse — orchestrates the 5 maci-cli commands |
| [.env.example](.env.example) | Template for required secrets (mirror these into Fly secrets) |

## One-time setup

### 1. Pre-flight on a development machine

You need to generate the coordinator's MACI keypair **before** running the contract deploy in `contracts/governor-contract/`, because the public key (`COORDINATOR_PUBKEY_X`/`Y`) is baked into `MaciAttesterGovernor`'s constructor.

```bash
cd ../contracts/governor-contract
npx ts-node scripts/generate-coordinator-keypair.ts > coordinator.pub 2> coordinator.priv
```

- `coordinator.pub` → copy `COORDINATOR_PUBKEY_X` and `Y` into the contracts' `.env`.
- `coordinator.priv` → this is `COORDINATOR_PRIV` for the coordinator service. Move it into Fly secrets immediately and shred the file.

### 2. Pick the on-chain submitter

`COORDINATOR_ETH_PRIV` is the privkey of the address that owns `MessageProcessor` and `Tally` for every poll (the Governor calls `transferOwnership` to it inside `propose()`). It pays gas for `proveOnChain`.

- **v1 (single-EOA):** generate a fresh EOA, fund it with ~0.005 ETH on Base. This address must equal the `COORDINATOR_ADDRESS` you set when deploying the Governor.
- **v1.1 (Layer 1 — Safe submitter, recommended for Devcon):** deploy a 3-of-5 Gnosis Safe of founding attesters on Base. Set `COORDINATOR_ADDRESS` to the Safe address before running the Governor deploy. Update `finalize-poll.js` to propose tx batches via Safe Transaction Service (not yet implemented in this v1 commit — open issue).

### 3. Provision Fly.io

```bash
fly auth login

# From this directory:
fly apps create roebel-maci-coordinator --org <your-org>
fly volumes create coordinator_proofs --region fra --size 5 --yes

fly secrets set \
    COORDINATOR_PRIV="$(cat ../contracts/governor-contract/coordinator.priv)" \
    COORDINATOR_ETH_PRIV="0x…" \
    BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/…" \
    MACI_ADDRESS="0x…" \
    VERIFIER_ADDRESS="0x…" \
    VK_REGISTRY_ADDRESS="0x…"

# After the contracts deploy succeeds, copy MACI/Verifier/VkRegistry from
# ../contracts/governor-contract/deployments/base.json before running:
fly deploy
```

The first build downloads the 1.5 GB ceremony tarball — expect ~5 min. Subsequent builds reuse the cached `zkeys` layer.

### 4. Smoke-test the healthcheck

```bash
curl https://roebel-maci-coordinator.fly.dev/healthz
# → ok
curl https://roebel-maci-coordinator.fly.dev/status
# → {"ready": true, "lastRun": null}
```

## Running a finalization

After the poll's voting period ends (and the optional tally-grace period in the Governor):

```bash
# Find the pollId from the PollLinked event on the Governor or from
# deployments/base.json + proposal lookup
fly ssh console --app roebel-maci-coordinator
$ node /app/scripts/finalize-poll.js 0
```

The script:

1. **mergeSignups** — collapses MACI's lazyIMT once. Cheap, idempotent across polls on the same MACI core.
2. **mergeMessages** — collapses this poll's message accumulator.
3. **genProofs** — locally generates ZK proofs (process + tally batches). This is the heavy step; expect 2–10 minutes depending on signups/messages. Memory peaks ~3 GB.
4. **proveOnChain** — submits each batch's proof to `MessageProcessor.processMessages` and `Tally.tallyVotes`, then posts the final tally via `Tally.addTallyResults`.
5. **verify** — reads the on-chain tally and compares to the local `tally.json`.

After step 5, the Governor's `state(proposalId)` flips from `Active` to `Succeeded` or `Defeated`, and `governor.queue(...)` becomes callable.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `mergeSignups` reverts with `OwnableUnauthorizedAccount` | The Governor's `transferOwnership` ran but to the wrong address | Compare `MessageProcessor.owner()` and `Tally.owner()` to `COORDINATOR_ETH_PRIV`'s address; redeploy if mismatched |
| `genProofs` exits with OOM | Default Fly machine ran out of RAM | Bump `[[vm]] memory` to `8gb` in `fly.toml`, or scale the machine ad-hoc with `fly scale memory 8192` |
| `proveOnChain` reverts with `IncorrectPerVOSpentVoiceCredits` | The local tally salt doesn't match what was committed | Most often: `mergeMessages` was skipped or run twice. Wipe `/app/proofs/poll-<id>` and re-run the full pipeline |
| Coordinator submits valid tally but Governor still reads `Defeated` | The voting deadline + `tallyGracePeriod` already elapsed before the tally landed | Coordinator missed the window. Future runs: bump `TALLY_GRACE_PERIOD_SECONDS` in the Governor's deploy or finalize sooner |

## Layered hardening roadmap

This v1 implementation runs with a single EOA submitter and a single Babyjubjub key. The MACI contracts on chain don't change between layers — only this service does:

- **Layer 1 — Safe submitter (next):** swap `COORDINATOR_ETH_PRIV` for `SAFE_API_TOKEN` + `SAFE_ADDRESS`. `finalize-poll.js` proposes the proveOnChain tx batches to Safe Transaction Service; 3-of-5 attesters confirm before broadcast. Adds a per-tally human approval gate.
- **Layer 2 — Shamir-split MACI key (v1.1):** split `COORDINATOR_PRIV` with `shamir-secret-sharing` at keygen time. Each finalization spins up an ephemeral Fly machine that reconstructs the key in memory, runs proofs, and self-destructs. Trust shifts from "1 honest coordinator" to "≤2 attesters compromised at the tally window." Documented in `contracts/governor-contract/contracts/verification-system/MACI_DEPLOYMENT.md`.
- **Layer 3 — Threshold decryption (post-v3 ceremony):** when MACI v3 ships its trusted setup, swap to MPC-based threshold decryption that never reconstructs the full key. Requires a contracts upgrade.

## Cost

- Fly.io: ~€5–10/month for the always-on healthcheck container plus an extra ~€2 for the 5 GB volume. Memory-heavy proof runs are ephemeral.
- Base gas per finalization: ~0.0005 ETH (~$1.20) for `proveOnChain` of a small poll. Scales with batch count.
