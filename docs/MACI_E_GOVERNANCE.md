# Roebel/Müritz On-Chain e-Governance — Architecture

**Status:** production on Base mainnet (chainId 8453) since 2026-05-07.
**Last revised:** 2026-05-08 after the third VkRegistry/Governor rotation aligned all four MACI tree depths with the production-ceremony zKey signatures.

This document is the canonical reference for the full stack: identity (AttesterNFT + CitizenNFT) → governance (Governor + Timelock) → privacy (MACI v2) → coordinator → apps. It covers what each component does, how they fit together, the contract addresses on Base, and the operational runbook for keeping it running. If this doc and any other doc disagree, this one wins.

---

## 1. TL;DR

Roebel/Müritz is a small German town (population ~5,000). The system lets verified citizens vote on local proposals from their phone, with these guarantees:

1. **Sybil resistance** — only humans verified by the local culture committee can vote, enforced by a soulbound `CitizenNFT`.
2. **Anti-collusion / vote-buying resistance** — even though the coordinator decrypts ballots, it cannot prove to a vote-buyer or a coercer who voted what. A voter can re-vote any number of times before the deadline; only the highest-nonce signed command wins. The buyer can't tell whether the seller voted as instructed and then changed their mind. This guarantee holds today against any single coordinator.
3. **Public verifiability of the result** — anyone can check the published tally on Basescan: a Groth16 proof in the `Tally` contract attests that the numbers are the honest sum of the encrypted ballots. A dishonest coordinator cannot fake a result; they can only refuse to publish (DoS).
4. **Privacy from third parties on chain** — anyone reading the chain sees encrypted blobs only.

What is **not** yet guaranteed in the current production setup, and is on the [roadmap](#12-roadmap-to-maximal-trustlessness--decentralization):

- **Privacy from the coordinator.** Today a single Fly.io machine holds both private keys (the Babyjubjub decryption key and the on-chain submitter key). The operator can decrypt a citizen's vote and link it to their wallet via the on-chain `SignUp` event. Mitigation path: split the Babyjubjub key with Shamir's secret sharing across the founding attesters, so no single party can decrypt — see [§12 Phase 1](#phase-1--before-pilot-scaling).
- **Coordinator liveness without a single operator.** Currently a GitHub Actions schedule + a Fly.io machine + the coordinator EOA are all single-operator. A compromise breaks liveness (not result correctness — the on-chain Verifier still rejects bad proofs). Hardening path: move tally-tx submission behind a 3-of-5 attester Safe — see [§12 Phase 1](#phase-1--before-pilot-scaling).

Architecturally:

```
         ┌──────────────────────────────────────────────────────────────┐
         │   IDENTITY LAYER (Soulbound NFTs)                            │
         │   AttesterNFT  ──issues──▶  CitizenNFT                       │
         └──────────────────────────────────────────────────────────────┘
                                │ controls who can { propose, vote }
                                ▼
         ┌──────────────────────────────────────────────────────────────┐
         │   GOVERNANCE LAYER (OZ Governor + Timelock, Base mainnet)    │
         │   MaciAttesterGovernor → propose() → MACI.deployPoll()       │
         └──────────────────────────────────────────────────────────────┘
                                │ each proposal owns one Poll
                                ▼
         ┌──────────────────────────────────────────────────────────────┐
         │   PRIVACY LAYER (MACI v2)                                    │
         │   MACI core │ Poll │ MessageProcessor │ Tally │ VkRegistry   │
         │   Citizen → publishMessage(encrypted ballot)                 │
         │   Coordinator → mergeSignups → mergeMessages → genProofs     │
         │              → proveOnChain → verify                         │
         └──────────────────────────────────────────────────────────────┘
                                │ ballots tallied with ZK proof
                                ▼
         ┌──────────────────────────────────────────────────────────────┐
         │   COORDINATOR (off-chain, Fly.io machine)                    │
         │   GitHub Actions cron (15 min) → /finalize-pending           │
         │   → scan-and-finalize → finalize-poll.js (per pending Poll)  │
         └──────────────────────────────────────────────────────────────┘
                                │ Tally.tallyResults(0/1/2) populated
                                ▼
         ┌──────────────────────────────────────────────────────────────┐
         │   APPS                                                       │
         │   Web (Next.js)  — proposal creation by Attesters            │
         │   Expo (RN)      — citizen sign-up + voting + result display │
         └──────────────────────────────────────────────────────────────┘
```

Live addresses: see [§5](#5-smart-contracts--current-base-mainnet-addresses).

---

## 2. System overview by layer

| Layer | What it is | Where it runs | Trust assumption |
|---|---|---|---|
| Identity | Two soulbound NFTs (Attester, Citizen) issued via on-chain signatures | Base mainnet | A majority of attesters are honest |
| Governance | OpenZeppelin Governor with MACI-aware `state()` + a Timelock | Base mainnet | OZ Governor is unmodified except for documented overrides |
| Privacy | MACI v2 — global signup pool, per-poll Polls, encrypted `publishMessage`, ZK-proven tally | Base mainnet | Coordinator's MACI Babyjubjub privkey isn't leaked; ZK trusted-setup ceremony was honest |
| Coordinator | Holds the MACI Babyjubjub privkey, computes proofs, submits tallies | Fly.io single machine (auto-stop) | Trusted **only for liveness** (publishing the tally); ballot privacy holds even if the operator goes rogue |
| Apps | Next.js web (proposal creation) + Expo mobile (voting) | Vercel + EAS Update | Standard front-end trust — match what the contracts on chain say |

Why MACI? Without it, every vote is public on chain — a citizen's wallet → vote linkage is permanent. Quadratic-voting research (PSE) developed MACI specifically so a trusted but limited coordinator can publish a verifiable tally without ever revealing individual ballots, and so vote-buying becomes impossible because the buyer can't verify they got what they paid for.

---

## 3. Identity layer — AttesterNFT + CitizenNFT

Source: [`contracts/governor-contract/contracts/verification-system/`](../contracts/governor-contract/contracts/verification-system/).

### 3.1 AttesterNFT — `0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb` (rotated 2026-05-23)

A soulbound (non-transferable) ERC-721 held by members of Roebel's culture committee. Holding it grants the right to **attest** other people. There's no on-chain voting power tied to AttesterNFT alone — Attesters who want to vote also hold a CitizenNFT.

Issuance is decentralized: `createAttestationRequest(evidenceURI)` opens a request, then **2 existing Attesters** must `approveRequest(requestId)`. After two approvals the contract mints. Bootstrap: 3 founding committee members are seeded by the deployer at construction time so the system can start without an existing attester pool.

Revocation has the same shape (2-Attester approval) so a rogue attester can be removed.

**Both `requiredSignatures` (default 2) and `requiredRejections` (default 2) are now mutable state variables**, settable only by `owner()` — which after deploy is the Timelock. So any future change to the Attester threshold is a single governance proposal calling `setRequiredSignatures()` / `setRequiredRejections()`, not another contract redeploy.

Rejection is also multi-sig: a single Attester rejection no longer auto-vetoes a request. The status only flips to `Rejected` once `requiredRejections` distinct Attesters reject.

Revocation gas cost is now O(1) regardless of mint history (an internal `_tokenIdByOwner` mapping replaces the prior O(N) `tokenOfOwnerByIndex` loop).

Key entry points:
- `createAttestationRequest(string evidenceURI) → uint256 requestId`
- `approveRequest(uint256 requestId)` — 2/N rule, attester-gated, threshold mutable
- `rejectRequest(uint256 requestId)` — multi-sig veto, threshold mutable
- `setRequiredSignatures(uint256)` / `setRequiredRejections(uint256)` — Timelock only
- `hasAttesterNFT(address) view returns (bool)`
- `requiredSignatures()` / `requiredRejections()` — read current thresholds

### 3.2 CitizenNFT — `0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB` (rotated 2026-05-23)

The civic ID. Soulbound ERC-721 + ERC-721Votes (the token weight is unused now that voting moved to MACI, but the standard hook stays). Holding it is the prerequisite for **signing up to MACI** and therefore for voting.

**Attestation rule:** **1 Attester + 1 Citizen** must each sign off on `approveRequest`. Dual NFT holders (Attester + Citizen) explicitly choose which role they're signing as via the `signAsAttester` flag — this prevents a single dual-holder from satisfying both halves of the 2-of-2 rule.

**Revocation rule (changed 2026-05-23):** also **1 Attester + 1 Citizen**, symmetric with attestation. Previously revocation required only 1 Attester signature, which let any single Attester unilaterally wipe a citizen — that single-key risk was the headline reason for this rotation.

All four signature thresholds (`requiredAttesterSignatures`, `requiredCitizenSignatures`, `requiredRevocationAttesterSignatures`, `requiredRevocationCitizenSignatures`) plus the two rejection thresholds (`requiredAttesterRejections`, `requiredCitizenRejections`) are mutable state variables, settable only by the Timelock via three pair-setters: `setAttestationRequirements(att, cit)`, `setRevocationRequirements(att, cit)`, `setRejectionRequirements(att, cit)`. Any future tightening (e.g. raising revocation to 2+1 as the citizen base grows) is a single governance proposal.

Why this rule? The town's social fabric is dense enough that any prospective citizen knows at least one current citizen and one attester. The pair signature stops bots and forces real-world verification — and now extends to the destructive direction (revocation) too, so no single Attester can grief.

Rejection follows the same multi-sig pattern (single rejection no longer flips status to `Rejected`).

Burn gas is now O(1) regardless of mint history (same `_tokenIdByOwner` pattern as AttesterNFT).

Key entry points:
- `createAttestationRequest(string evidenceURI) → uint256 requestId`
- `approveRequest(uint256 requestId, bool signAsAttester)` — role-explicit
- `rejectRequest(uint256 requestId, bool signAsAttester)` — role-explicit, multi-sig
- `setAttestationRequirements(uint256 att, uint256 cit)` / `setRevocationRequirements(uint256 att, uint256 cit)` / `setRejectionRequirements(uint256 att, uint256 cit)` — Timelock only
- `hasCitizenNFT(address) view returns (bool)`
- `getVotes(address) view returns (uint256)` — present but unused for MACI polls
- `requiredAttesterSignatures()` / `requiredCitizenSignatures()` / `requiredRevocationAttesterSignatures()` / `requiredRevocationCitizenSignatures()` / `requiredAttesterRejections()` / `requiredCitizenRejections()` — read current thresholds

### 3.3 Why these are soulbound

Transferable identity NFTs trivialize Sybil attacks (buy 100 wallets, transfer 100 NFTs). The contracts override `_beforeTokenTransfer` to revert on any transfer except mint/burn. The voting weight + sign-up gate therefore cannot be moved or sold.

---

## 4. Privacy layer — MACI v2 (Minimal Anti-Collusion Infrastructure)

[MACI](https://maci.pse.dev) is a research project from the [Privacy & Scaling Explorations](https://pse.dev) team. Brief mental model:

- Every voter generates a **MACI Babyjubjub keypair** locally.
- They `signUp` to MACI — the contract emits a `SignUp` event indexed by their pubkey and assigns them a `stateIndex`.
- For each Poll, the voter computes an **encrypted message** containing `(stateIndex, voteOption, voiceCredits, nonce, signature)`, encrypted to the **coordinator's** pubkey via ECDH.
- They call `Poll.publishMessage` to put the encrypted message on chain.
- The voter can re-vote any number of times before the deadline. Only the highest-nonce signed command per voter wins (the on-chain process circuit enforces this).
- After the deadline, the **coordinator** (off-chain) decrypts, runs the process circuit + tally circuit locally to get per-option vote counts, and posts the resulting commitments + a Groth16 proof to the on-chain `MessageProcessor` and `Tally` contracts. The on-chain Verifier checks the proof. If valid, `Tally.tallyResults(voteOption)` is updated.

What this buys us:

1. **Privacy from third parties.** Anyone reading the chain sees encrypted blobs.
2. **Privacy from a passive coordinator.** They can decrypt individual ballots, but they can't prove to a vote-buyer who voted what (the voter could have re-voted later — the buyer only sees the final tally).
3. **Coordinator can't fake a result.** The Groth16 proof verifies that the published tally is the honest sum of the on-chain encrypted ballots. A dishonest coordinator can refuse to publish (DoS) but cannot publish a wrong result.

Source: [`maci-cli@2.5.0`](https://www.npmjs.com/package/maci-cli) and [`maci-contracts@2.5.0`](https://www.npmjs.com/package/maci-contracts), pinned in [`apps/coordinator/Dockerfile`](../apps/coordinator/Dockerfile).

### 4.1 Production ceremony parameters

We use the production trusted-setup zKeys distributed at `https://maci-develop-fra.s3.eu-central-1.amazonaws.com/v2.0.0/maci_artifacts_14-9-2-3_prod.tar.gz`. Two zKeys, named after their circuit signatures (NOT the order they appear in `Poll.treeDepths`):

| zKey filename | Circuit template | Params |
|---|---|---|
| `ProcessMessagesNonQv_14-9-2-3.zkey` | `ProcessMessagesNonQv(stateTreeDepth, msgTreeDepth, msgBatchDepth, voteOptionTreeDepth)` | `(14, 9, 2, 3)` |
| `TallyVotesNonQv_14-5-3.zkey` | `TallyVotesNonQv(stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth)` | `(14, 5, 3)` |

The `Poll.treeDepths` struct on chain therefore must be:

| Field | Value | Source |
|---|---|---|
| `stateTreeDepth` | 14 | both circuits' first param |
| `intStateTreeDepth` | 5 | tally circuit second param |
| `messageTreeSubDepth` (= `msgBatchDepth`) | 2 | process circuit third param → batch size = 5² = 25 |
| `messageTreeDepth` (= `msgTreeDepth`) | 9 | process circuit second param |
| `voteOptionTreeDepth` | 3 | both circuits' last param |

**This took three rotations to get right.** The history is in [§12.4](#124-history-of-the-rotations) — read that before changing depths again.

---

## 5. Smart contracts — current Base-mainnet addresses

All addresses live in [`contracts/governor-contract/deployments/base.json`](../contracts/governor-contract/deployments/base.json) (canonical source of truth). Archived addresses from prior rotations are kept under `addresses.<name>_archived_<timestamp>`.

### 5.1 Identity

| Contract | Address |
|---|---|
| AttesterNFT | `0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb` |
| CitizenNFT | `0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB` |

### 5.2 MACI v2 infrastructure

These get deployed once and stay forever (assuming no protocol-version bump):

| Contract | Address | Purpose |
|---|---|---|
| MACI core | `0x2922e42945a10d1F765E3f9Cab136421d4556D30` | Global signup pool; `deployPoll` factory |
| Verifier | `0x6682A865C9e2cAAC89DAAAdf25e15bc90db482D8` | Groth16 proof verifier |
| VkRegistry | `0xd6EF1Ad8cCAFC41bf025efe620e27d8CF18B91ED` | Stores process + tally VKs keyed by tree depths |
| SignUpTokenGatekeeper | `0xc767fa3bbd9f0934Fb419137d7b6506E44105f74` | "You can sign up iff you hold CitizenNFT" (fresh instance from the 2026-06-08 clean-slate rotation) |
| ConstantInitialVoiceCreditProxy | `0x5b358A77E89FF3d699607b4fC235b381d67f3d05` | Issues 1 voice credit per signup (non-QV) |
| PoseidonT3 | `0x5F5e499Dc1872c2Ce19a4b50cd10f680e78E3Ba3` | Linked into PollFactory + MACI |
| PoseidonT4 | `0x71f05e914Aa4E8Bc19c0c98073e5B0a59b2Ef0C6` | … |
| PoseidonT5 | `0xf076977DBa20db18328f1a8E7aeE9A207d3E8207` | … |
| PoseidonT6 | `0xC6a65aE90Aec79cB14a287092EB4709612860997` | … |
| PollFactory | `0x604B8b61488e02b2EEeeB4993825afD436D526fE` | Deploys per-proposal Poll |
| MessageProcessorFactory | `0x34EDb8C26cc759D3e63C2580323eDcB0A136dAAb` | Deploys per-poll MP |
| TallyFactory | `0xC6351B4470CE0C1fab41b45a902554A8040Df463` | Deploys per-poll Tally |

VkRegistry is the only one that's been rotated since first deploy (twice — see §12.4). MACI core, Verifier, the gatekeeper, the voice-credit proxy, and the Poseidon libs are immutable and reused across all rotations.

### 5.3 Governance

| Contract | Address | Purpose |
|---|---|---|
| MaciAttesterGovernor | `0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177` | OZ Governor + MACI-aware state() override (rotated 2026-05-23 to add governance setters + rebind to new NFTs) |
| TimelockController | `0xe8B8149F9373a56F55112e5Fc867E58308D014c1` | OZ Timelock (currently 1-hour min delay for the test phase; raise via `timelock.updateDelay()` governance proposal) |

Coordinator EOA (Fly machine wallet): `0x5e6528D22283Daf1E4340B39d48a4D3CeaDC184C`. Owns each Poll's MessageProcessor + Tally contracts (set in `_deployPollFor`).

### 5.4 MaciAttesterGovernor — what it does differently

Source: [`contracts/governor-contract/contracts/verification-system/MaciAttesterGovernor.sol`](../contracts/governor-contract/contracts/verification-system/MaciAttesterGovernor.sol).

Standard OZ Governor with these overrides:

1. **`propose()` is restricted to AttesterNFT holders.** A regular OZ Governor lets any token-holder propose; we delegate that gate to attesters. Reverts with `OnlyAttestersCanPropose(address)`.

2. **`propose()` deploys a per-proposal Poll** via `MACI.deployPoll(duration, treeDepths, coordinatorPubKey, verifier, vkRegistry, mode)`. The resulting `(pollId, poll, messageProcessor, tally, deadline)` tuple is stored in `proposalPolls[proposalId]`. Voting happens on that Poll, not on the Governor.

3. **`castVote*` is disabled.** Reverts with `VotingHappensOnMaciPoll(address)`. There's no on-chain `castVote` — that's the whole point.

4. **`_quorumReached` and `_voteSucceeded` read from `Tally`.** OZ's default reads `proposalVotes` (which is always 0/0/0 here because no public votes are cast). We override:
   - `_quorumReached` returns `Tally.totalSpent() >= quorum(0)` (only after `Tally.isTallied()` is true).
   - `_voteSucceeded` returns `Tally.tallyResults(FOR).value > Tally.tallyResults(AGAINST).value` (only after `isTallied()`).

5. **`state()` keeps the proposal Active during the tally grace period.** OZ's default would flip to `Defeated` immediately at deadline since `_quorumReached` is false until the tally lands. We override: if the standard logic returns `Defeated` AND the tally hasn't landed AND we're within `tallyGracePeriod` seconds of the deadline, return `Active` instead. Once the grace expires without a tally, the proposal is genuinely `Defeated` (timed out).

   This is critical for the UX: badge says "AKTIV" while the coordinator computes the tally; flips to "ABGELEHNT" / "ERFOLGREICH" once the tally lands.

6. **`tallyGracePeriod`** is governance-mutable post-deploy via `setTallyGracePeriod()` (Timelock-only). Currently 7 days on mainnet; was 30 min during the test cycle. Capped at 30 days by the setter.

7. **Five governance-tunable parameters** (added 2026-05-23 rotation). All callable only by the Timelock via `onlyGovernance` — i.e. a Governor proposal must propose + queue + execute against the Timelock for any of these to land. The Governor itself stays immutable; only its parameter storage changes.

| Setter | Default | Bounds | Rotation use case |
|---|---|---|---|
| `setQuorumPercentage(uint256)` | `10` | `≤ 100` | Tighten/loosen quorum as citizen base grows |
| `setQuorumAbsolute(uint256)` | `2` | unbounded | Floor when `signups * pct / 100` is too small |
| `setTallyGracePeriod(uint256)` | `604800` (7d) | `≤ 30 days` | Shorten when the coordinator is reliably fast; lengthen during a coordinator migration |
| `setCoordinator(address)` | deploy EOA | non-zero | **Critical**: rotate the on-chain coordinator to a Gnosis Safe at 7+ Attesters, or after a key compromise |
| `setCoordinatorPubKey(DomainObjs.PubKey)` | deploy pubkey | none | Off-chain key rotation; future-proofs for the eventual threshold-MACI swap |

The pre-rotation Governor at `0x5983F630…` had none of these setters — `coordinator` was `immutable` and the quorum / grace fields were storage-only-no-setter. A compromised coordinator would have required a full Governor + Timelock + NFT redeploy. Now it's a single governance proposal.

### 5.5 Per-proposal contracts

Each `propose()` deploys three new contracts via the factories:

| Contract | What it does |
|---|---|
| Poll | Holds the encrypted message queue, the snapshotted state tree root, the deadline, and the tree depths. `publishMessage` is the citizen-facing entry point. |
| MessageProcessor | Receives the process-circuit ZK proof from the coordinator. Verifies it on chain via Verifier + the process VK looked up from VkRegistry. |
| Tally | Receives the tally-circuit ZK proof + the per-option results. After `addTallyResult` is called, `tallyResults(voteOption)` returns `(value, true)`. |

The Coordinator EOA owns the MP + Tally for each proposal (via `transferOwnership` inside `_deployPollFor`), so it can submit proofs without needing to go through the Governor.

---

## 6. Coordinator — off-chain ZK proof generator

Source: [`apps/coordinator/`](../apps/coordinator/).

### 6.1 What it is

A single Fly.io machine (region `fra`, 4 GB RAM, 2 shared CPUs, auto-stop) running a Node 20 container with the production zKeys mounted at `/app/zkeys`. It holds **two private keys**, both as Fly secrets:

| Secret | Purpose |
|---|---|
| `COORDINATOR_PRIV` | The MACI Babyjubjub privkey used to ECDH-decrypt every published ballot. Public counterpart: `coordinatorPubKey` baked into every Poll. |
| `COORDINATOR_ETH_PRIV` | The Ethereum privkey for the EOA that owns each MP/Tally and submits the on-chain `proveOnChain` transactions. Public address: `0x5e6528…84C`. |

Both are equally sensitive. Compromise of `COORDINATOR_PRIV` breaks **ballot privacy** (the attacker can decrypt any past or future ballot encrypted to that key). Compromise of `COORDINATOR_ETH_PRIV` breaks **liveness** (the attacker can refuse to submit tallies, but can't fake them — the Verifier still checks the ZK proof).

> ⚠️ **POST-ROTATION CHECKLIST — the coordinator does NOT read `deployments/base.json`.** It reads its contract addresses from Fly secrets only. After **any MACI core rotation** you MUST update the coordinator or it will silently scan the old MACI, find zero pending polls, and never finalize any new proposal (this exact failure stranded "Test Umfrage 2" on 2026-05-24). Run:
>
> ```bash
> fly secrets set -a roebel-maci-coordinator MACI_ADDRESS=<new MACI core>
> # then confirm:
> fly ssh console -a roebel-maci-coordinator -C 'printenv MACI_ADDRESS'
> ```
>
> Also re-check `VERIFIER_ADDRESS` / `VK_REGISTRY_ADDRESS` (only if they rotated — usually reused) and `BASE_REFERENCE_TX` (see §6.4 — must remain a Base tx **older** than the new MACI's first `SignUp`, else `genProofs` will miss signups). The `redeploy-maci-governor.cjs` script prints this reminder at the end of every run.

### 6.2 The finalize pipeline

`finalize-poll.js <pollId>` runs five steps in sequence:

1. **`mergeSignups`** — calls `Poll.mergeMaciState()` on chain. Snapshots MACI's global state tree into the poll. Idempotent.
2. **`mergeMessages`** — calls `Poll.mergeMessageAqSubRoots()` + `mergeMessageAq()` on chain. Collapses the message accumulator. Idempotent.
3. **`genProofs`** — off-chain. Re-builds the MACI state from `SignUp` + `PublishMessage` events, runs the process circuit per batch (25 messages each) + tally circuit, writes per-batch JSON proofs to `/app/proofs/poll-<id>/`. This is the slow step (proof generation can take minutes).
4. **`proveOnChain`** — submits each process proof to MessageProcessor and each tally proof to Tally. The on-chain Verifier checks each one. After the last batch lands, `Tally.totalTallyResults > 0` and `tallyResults(0/1/2)` are populated.
5. **`verify`** — sanity check: re-reads `tallyResults` and confirms they match the local `tally.json`.

Steps 1–2 are idempotent: the script catches the SDK's "already merged" error and continues. Steps 3–5 are deterministic given the on-chain state, so a re-run from a partial failure picks up where it left off.

### 6.3 Why the script bypasses Hardhat

The `maci-cli` binary resolves its signer through `hre.ethers.getSigners()` and looks for `hardhat.config.js` in its own package directory. We tried mounting a `hardhat.config.js` at `/app` and setting `HARDHAT_NETWORK=base`, but the CLI ignored both. Instead we `require("maci-cli")` directly and inject an `ethers.Wallet(COORDINATOR_ETH_PRIV, JsonRpcProvider(BASE_RPC_URL))` as the `signer` argument. This is set up in [`finalize-poll.js`](../apps/coordinator/scripts/finalize-poll.js).

### 6.4 RPC channel split

Two providers, both ethers v6 with `batchMaxCount: 1` (Base public RPCs silently mishandle batched eth_calls):

- **`BASE_RPC_URL`** — for transactions (merges + proveOnChain). Alchemy is fine here.
- **`BASE_ARCHIVE_RPC_URL`** — for `genProofs`'s log scan. Set to `https://mainnet.base.org`. Alchemy free tier caps `eth_getLogs` at 10 blocks per call, which would require ~5 M round-trips for a fresh-MACI scan.

The unbatched `queryFilter` calls inside `genProofs` are constrained by computing `startBlock = latest - QUERY_WINDOW_BLOCKS` (default 100 blocks) at runtime. The batched state-rebuild scan inside `genMaciStateFromContract` then uses `BASE_REFERENCE_TX` (a Base tx hash older than the first SignUp on this MACI) to reset its starting block, paginating with `BLOCKS_PER_BATCH` (default 5000).

### 6.5 Auto-finalize cron

Two pieces:

1. **GitHub Actions cron** — [`.github/workflows/coordinator-cron.yml`](../.github/workflows/coordinator-cron.yml). Runs every 15 minutes (GH throttles `*/15` schedules to ~80-min cadence in practice). Curls `POST /finalize-pending` on the Fly machine with the `X-Finalize-Token` header. The HTTPS request auto-wakes the machine (it's `auto_stop_machines = "stop"` with `auto_start_machines = true`).

2. **`/finalize-pending` endpoint** — implemented in [`scripts/healthcheck.js`](../apps/coordinator/scripts/healthcheck.js). Auth-gated by the `FINALIZE_TOKEN` Fly secret. Spawns `scan-and-finalize.js` as a child process and returns `202 Accepted` immediately so the curl doesn't time out waiting for proof generation.

`scan-and-finalize.js` walks every poll on MACI core (`0..nextPollId-1`) and finalizes any poll where:
- `messageTreeSubDepth == 2` (matches our zKey — skips legacy polls from earlier rotations),
- voting deadline has passed,
- `numMessages > 0` (skip empty polls),
- `Tally.totalTallyResults() == 0` (real "not yet tallied" signal — `isTallied()` is unreliable, see [§12.3](#123-istallied-is-vacuously-true)).

For each pending poll, it spawns `node /app/scripts/finalize-poll.js <pollId>`. Idempotent across runs.

### 6.6 Setting up the cron from scratch

```bash
# 1. Generate a shared random token.
TOKEN=$(openssl rand -hex 32)

# 2. Set it on Fly (used by the /finalize-pending handler).
fly secrets set FINALIZE_TOKEN="$TOKEN" --app roebel-maci-coordinator

# 3. Set it on GitHub (used by the cron workflow).
gh secret set COORDINATOR_FINALIZE_TOKEN --body "$TOKEN"
# OR via the UI: Settings → Secrets and variables → Actions → New repository secret
```

If the secret is missing, the workflow now exits with `::error::COORDINATOR_FINALIZE_TOKEN secret is not set on this repository (...)`. (Earlier behavior was a silent `exit 0`; that masked an outage for hours.)

---

## 7. Apps

### 7.1 Web — Next.js, proposal creation only

Path: [`apps/web/`](../apps/web/). Deployed at `https://www.roebel.app`.

Critical routes:
- `/app/proposals/create` — Attester-gated form. Calls `governorContract.propose([target], [value], [calldata], description)`. Mirror to Supabase via `/api/proposals/store` so we have searchable metadata + Irys content URLs.
- `/app/proposals/[id]` — read-only proposal page. Reads on-chain state via the Governor + Supabase metadata.

Constants: [`apps/web/src/lib/contracts.ts`](../apps/web/src/lib/contracts.ts). The `MACI_GOVERNOR_ADDRESS` constant is the only thing that changes when we rotate the Governor.

The web app does **not** vote. Voting is mobile-only by design — the keypair must live in secure-store on the citizen's phone, which is also the device that signs MACI commands.

### 7.2 Expo — React Native, voting + result display

Path: [`apps/expo/`](../apps/expo/). Deployed via EAS Update.

Critical screens:
- `app/proposal/[id].tsx` — single-proposal view: state badge, title/metadata, content, [VotingStats](../apps/expo/components/VotingStats.tsx), [VoteButtons](../apps/expo/components/VoteButtons.tsx), [ProposalTimeline](../apps/expo/components/ProposalTimeline.tsx), comments.
- `context/MaciContext.tsx` — the per-citizen MACI state machine. Manages the Babyjubjub keypair (in `expo-secure-store`), the on-chain stateIndex (cached), and the local `lastVote` cache (so the user sees what they voted for after re-rendering).

Citizen lifecycle in the app:

1. **No keypair yet** — VoteButtons shows "Schritt 1 von 2 — Schlüssel erstellen". Tap → `generateMaciKeypair` → write to secure-store under `roebel.maci.keypair.v1`.
2. **Keypair exists, not signed up to MACI** — "Schritt 2 von 2 — Bei MACI anmelden". Tap → `MACI.signUp((pubKeyX, pubKeyY), gatekeeperData = abi.encode(citizenTokenId), voiceCreditData = "")` from the citizen's smart wallet. The `SignUp` event is parsed from the receipt to learn the assigned `stateIndex`, which is persisted next to the keypair.
3. **Signed up + voting open** — three-button row (Dafür/Dagegen/Enthalten). Tap → `buildVoteMessage` (encrypts to coordinator's pubkey) → `Poll.publishMessage(message, encPubKey)`. After success, the local `recordVote(pollAddress, optionIndex, nonce, txHash)` writes to secure-store under `roebel.maci.votes.v1`. The next render shows a [LastVoteCard](../apps/expo/components/LastVoteCard.tsx) with the recorded vote + a "Stimme ändern" affordance that re-reveals the buttons. Re-voting bumps the nonce; the on-chain process circuit takes the highest signed nonce per voter.
4. **Voting closed, tally not landed** — VoteButtons shows "Abstimmung beendet — der Koordinator entschlüsselt jetzt die Stimmen…".
5. **Tally landed** — VotingStats shows real percentages from `Tally.tallyResults(0/1/2)` plus a small "On-chain prüfen ↗" link to the Tally on Basescan. ProposalStateBadge reads `governor.state(proposalId)` every 30 s so it flips to `Defeated`/`Succeeded` automatically.

Three orphan / edge states the UI handles explicitly:
- **Proposal on a deprecated Governor** (post-rotation) — `proposalPolls(id)` returns the zero address. Both VoteButtons and VotingStats render an "ältere Governor – nicht mehr aktiv" card with a Basescan link to the current Governor's `readContract` page.
- **Votes encrypted, deadline passed, tally not yet on chain** — VotingStats stays hidden (active vote and pre-tally show nothing); VoteButtons shows the closed-state card.
- **Pending → Active transition** — ProposalTimeline reads `governor.clock()` + `proposalSnapshot()` + `proposalDeadline()` every 30 s and ticks locally at 1 Hz between resyncs, so the countdown is fluid.

Constants: [`apps/expo/constants/thirdweb.ts`](../apps/expo/constants/thirdweb.ts). All addresses fall back to baked-in defaults so the EAS bundle works without a `.env`.

---

## 8. End-to-end flows

### 8.1 New citizen onboarding

```
Prospective citizen      Existing Attester        Existing Citizen        On chain
─────────────────────    ──────────────────       ──────────────────      ───────────────────────
1. Visit web app
2. Connect wallet
3. Pin "I'm a citizen"
   evidence to Irys
4. createAttestationRequest(evidenceURI) ───────────────────────────▶  CitizenNFT
                                                                          ↳ AttestationRequestCreated
                         5. Reviews evidence
                         6. approveRequest(id, signAsAttester=true)  ▶  +1 attester sig
                                                  7. Reviews evidence
                                                  8. approveRequest(id, signAsAttester=false) ▶  +1 citizen sig → mint
                                                                                                  ↳ CitizenNFTMinted
9. Open Expo app
10. Generate MACI keypair
11. signUp(pubKey, gatekeeperData = citizenTokenId)  ─────────────▶  MACI.signUp()
                                                                       ↳ SignUp event (stateIndex, pubKeyX, pubKeyY)
                                                                       Citizen now eligible to vote on every poll.
```

### 8.2 New proposal

```
Attester                                                            On chain
──────────────────────                                              ─────────────────────────────
1. Open web app /app/proposals/create
2. Write title + description
3. Pin description to Irys
4. propose([target], [0], [calldata], description) ────────────▶   MaciAttesterGovernor.propose
                                                                     ↳ checks AttesterNFT
                                                                     ↳ ProposalCreated event
                                                                     ↳ _deployPollFor(proposalId):
                                                                       MACI.deployPoll(...)
                                                                       proposalPolls[id] = (pollId, poll, mp, tally, deadline)
                                                                       PollLinked event
                                                                     ↳ MP.transferOwnership(coordinator)
                                                                     ↳ Tally.transferOwnership(coordinator)
5. /api/proposals/store  ───────────────────────────────────▶      Supabase row (UI metadata + Irys URL)
```

### 8.3 Voting

```
Citizen (Expo)                                                       On chain
──────────────────────                                               ─────────────────────────────
1. Open /proposal/[id]
2. ProposalStateBadge polls governor.state(id)        ◀──────       Reads from Governor.
3. VoteButtons fetches proposalPolls(id)             ◀──────        Reads (pollId, poll, …, deadline).
4. Tap "Dafür"
5. nonce = getNextNonce(pollAddress)                                (read from secure-store, default 1n)
6. buildVoteMessage(keypair, stateIndex, pollId,
                   voteOptionIndex=1, voiceCredits=1, nonce)
   → ECDH-encrypt to coordinatorPubKey
7. publishMessage(message, encPubKey) ─────────────────────▶       Poll.publishMessage
                                                                     ↳ PublishMessage event (encrypted blob)
8. recordVote(pollAddress, 1, nonce, txHash)
   → write to secure-store roebel.maci.votes.v1
9. LastVoteCard renders "Du hast „Dafür" gestimmt"
```

Re-voting: same flow, nonce = previous + 1. The citizen sees the LastVoteCard update; on chain there's another `PublishMessage` event with a higher signed nonce.

### 8.4 Tally finalization

Triggered by either the GH-Actions cron (every 15 min) or a manual `fly ssh console -C "node /app/scripts/finalize-poll.js <pollId>"`.

```
Coordinator (Fly)                                                    On chain
──────────────────────                                               ─────────────────────────────
1. mergeSignups(pollId, maciAddress, signer)   ───────────────▶    Poll.mergeMaciState()
2. mergeMessages(pollId, maciAddress, signer)  ───────────────▶    Poll.mergeMessageAqSubRoots() + mergeMessageAq()
3. genProofs(...)                                                    [off-chain]
   - genMaciStateFromContract scans SignUp + PublishMessage events
   - For each batch (size 25), runs process circuit
   - For each ballot batch (size 5⁵=3125), runs tally circuit
   - Writes process_<n>.json + tally.json to /app/proofs/poll-<id>/
4. proveOnChain(...)  ─────────────────────────────────────────▶   For each batch:
                                                                     - MessageProcessor.processMessages(proof, ...)
                                                                     - Tally.tallyVotes(proof, ...)
                                                                       Verifier checks Groth16 proof against VK from VkRegistry.
                                                                     Final batch: Tally.addTallyResult(option, value, ...)
                                                                       ↳ tallyResults(0/1/2) populated, totalTallyResults > 0
5. verify(...)         ─────────────────────────────────────────▶   Reads tallyResults back, asserts == local tally.json
6. Writes /app/proofs/last-run.json with status=succeeded
```

### 8.5 Reading the result

```
Citizen reopens /proposal/[id] in Expo                              On chain
──────────────────────                                               ─────────────────────────────
1. ProposalStateBadge poll                              ◀──────    governor.state(id) → Succeeded or Defeated
   (the contract's state() now sees Tally.isTallied()=true and falls through to OZ default)
2. VotingStats fetches proposalPolls(id)               ◀──────     Reads tally addr.
3. VotingStats reads Tally.isTallied()                 ◀──────     true (real tally landed)
4. VotingStats reads Tally.tallyResults(0/1/2)         ◀──────     (against, for, abstain)
5. Renders percentages + "On-chain prüfen ↗" link to Tally on Basescan.
```

---

## 9. Operational runbook

### 9.1 Deploying a new Governor

We rotate the Governor when `treeDepths`, `votingPeriod`, `quorumAbsolute`, `tallyGracePeriod`, or `coordinatorPubKey` need to change. MACI core, Verifier, gatekeeper, and (usually) VkRegistry are reused.

```bash
cd contracts/governor-contract
# Optional inline overrides (else .env values apply):
QUORUM_ABSOLUTE=2 VOTING_PERIOD_SECONDS=1800 \
  REUSE_INFRA=1 npx hardhat run scripts/deploy-maci-base.cjs --network base
```

The script:
1. Reads `deployments/base.json` for existing infra addresses.
2. Deploys new Timelock + new MaciAttesterGovernor wired to the existing MACI/Verifier/VkRegistry/Gatekeeper/VoiceCreditProxy.
3. Grants Timelock proposer/canceller roles to the new Governor; deployer renounces admin.
4. Archives the old Governor + Timelock under timestamped keys; updates the canonical `addresses.maciAttesterGovernor` + `addresses.timelock`.

After the script returns, propagate the new Governor address to:
- [`apps/web/src/lib/contracts.ts`](../apps/web/src/lib/contracts.ts) — `MACI_GOVERNOR_ADDRESS`
- [`apps/expo/constants/thirdweb.ts`](../apps/expo/constants/thirdweb.ts) — fallback in `governorContractAddress`
- [`packages/blockchain/src/index.ts`](../packages/blockchain/src/index.ts) — `CONTRACTS.maciAttesterGovernor` + `CONTRACTS.maciTimelock`

Then:
- Push to `main` → Vercel auto-redeploys web.
- Run `cd apps/expo && eas update --branch production` to ship the Expo bundle.

Existing proposals on the old Governor become orphans — the [VoteButtons](../apps/expo/components/VoteButtons.tsx) + [VotingStats](../apps/expo/components/VotingStats.tsx) orphan branches handle this gracefully.

### 9.2 Rotating the VkRegistry (rare)

Only needed when the production zKey changes (new ceremony) or we discover a tree-depth mismatch with the existing zKey. Both have happened.

```bash
cd contracts/governor-contract
npx hardhat run scripts/register-vk-batch25.cjs --network base
# Then redeploy the Governor (it stores the registry address immutably).
QUORUM_ABSOLUTE=2 REUSE_INFRA=1 npx hardhat run scripts/deploy-maci-base.cjs --network base
# Update the Fly secret so finalize-poll.js sees the new registry.
fly secrets set VK_REGISTRY_ADDRESS=0x<new> --app roebel-maci-coordinator
```

### 9.3 Manually finalizing a stuck poll

```bash
fly ssh console --app roebel-maci-coordinator -C "node /app/scripts/finalize-poll.js <pollId>"
```

If the SSH session drops mid-run, the process dies (Fly auto-stops the machine when idle). To detach, use:

```bash
fly ssh console --app roebel-maci-coordinator -C \
  "sh -c 'setsid node /app/scripts/finalize-poll.js <pollId> > /app/proofs/manual-<pollId>.log 2>&1 < /dev/null & echo started'"
# Then check:
fly ssh console --app roebel-maci-coordinator -C "tail -f /app/proofs/manual-<pollId>.log"
```

Or trigger the auto-finalize endpoint:

```bash
curl -X POST -H "X-Finalize-Token: $TOKEN" \
     https://roebel-maci-coordinator.fly.dev/finalize-pending
curl https://roebel-maci-coordinator.fly.dev/status
```

### 9.4 When the cron silently does nothing

Symptom: `lastScan` on `/status` is hours behind, but the GH workflow shows "success". Two failure modes:
- **`COORDINATOR_FINALIZE_TOKEN` missing or wrong.** Workflow now fails loudly with `::error::` (post-`18f4267`). Re-set both Fly's `FINALIZE_TOKEN` and the GH repo secret to the same value.
- **Fly machine wouldn't wake.** Check `fly status --app roebel-maci-coordinator`. Auto-start can fail if the build is broken; redeploy with `fly deploy --remote-only`.

### 9.5 When the Expo app shows infinite "Lade verschlüsselte Abstimmung…"

This is the orphan state: `proposalPolls(id)` returned the zero address. After a Governor rotation, all pre-rotation proposals are orphans on the new Governor. Either:
- The web bundle is stale (Vercel didn't redeploy). Hard-refresh the web app (`⌘⇧R`) and verify the proposal-creation tx targets the current Governor (`base.json → addresses.maciAttesterGovernor`).
- The proposal genuinely lives on a deprecated Governor. Show the user the orphan card (already automatic) and create a new proposal on the current Governor.

---

## 10. Security model

### 10.1 What's trustless

- **Governor + Timelock + MACI contracts** are immutable bytecode on Base. No upgrade paths, no admin keys.
- **The ZK tally proof** is verified on chain. A malicious coordinator can't publish a wrong result; the Verifier rejects.
- **CitizenNFT issuance** requires two unrelated humans (1 Attester + 1 Citizen). Single-key compromise can't mint.
- **Vote privacy** holds against any adversary who only reads the chain.

### 10.2 What's trusted

- **A majority of the founding 3 attesters are honest.** They were seeded by the deployer at construction time. As the attester set grows, this becomes a 2-of-N rule on the actual count.
- **The coordinator's Babyjubjub privkey isn't leaked.** Compromise breaks ballot privacy retroactively. Mitigation roadmap: split the key with Shamir among the founding attesters (Layer 2 hardening).
- **The coordinator is online enough to publish tallies before `tallyGracePeriod` expires.** Compromise breaks liveness only — proposals would time out as Defeated. Mitigation roadmap: replace the EOA with a 3-of-5 attester Safe that proposes the `proveOnChain` tx (Layer 1 hardening).
- **The MACI v2 trusted-setup ceremony was honest.** PSE ran this in 2024 with public participation; we use the resulting zKeys verbatim. The `processVk` and `tallyVk` registered in our VkRegistry are extracted directly from those zKey files.
- **Front-end deployment integrity.** Vercel + EAS Update sign their builds; we don't have IPFS-pinned reproducible builds yet. A compromised front-end could steer voters toward the wrong proposalId. Mitigation: a citizen who's worried about this can verify the on-chain `proposalPolls(id).poll` and `Tally.tallyResults` directly on Basescan.

### 10.3 Threat model — what an attacker can and cannot do

| Attack | Defense | Outcome |
|---|---|---|
| Buy citizen votes | Coordinator-as-trusted re-voting + MACI's nullifier construction means the buyer can't tell what the seller actually voted | Fails — vote-buying becomes uneconomic |
| Steal a citizen's wallet key | The CitizenNFT is soulbound, but the MACI keypair is in `expo-secure-store` on the device | Attacker can sign one ballot per stolen key; the legitimate citizen can re-vote with a higher nonce until the deadline |
| Compromise the coordinator's MACI privkey | Decrypts every past + future ballot encrypted to that key | Privacy broken retroactively for past polls; new polls need a new coordinatorPubKey (full Governor rotation) |
| Compromise the coordinator's ETH key | Can refuse to publish, can submit only valid (ZK-checked) tallies | Liveness break only — proposals time out as Defeated; result correctness preserved |
| Fake an attestation | 1-Att + 1-Cit signing rule with `signAsAttester` flag | Fails — collusion of 2 unrelated humans required |
| Modify a proposal's content after creation | `description` is hashed into the proposalId via OZ Governor; Irys URLs are content-addressed | Fails — any change produces a different proposalId |

---

## 11. Roadmap to maximal trustlessness + decentralization

This section is the **honest delta** between what's deployed today and what the system needs to become before it can carry binding civic decisions. Each item lists a trigger (when it must ship) and a measurable definition of done.

What's already shipped is in [§5](#5-smart-contracts--current-base-mainnet-addresses) and [§6](#6-coordinator--off-chain-zk-proof-generator) — production zKey integration, tree-depth-aligned Governor, chunked `addTallyResults`, fail-loud cron, idempotent finalize pipeline, MACI-aware `state()` override, orphan-proposal UX, and the admin dashboard with live infra + cron health surfacing.

### Phase 1 — before pilot scaling

These are the items that block scaling beyond the founding pilot. They are open issues that an external reviewer (Devcon attendee, BfDI, professional auditor) is right to flag today.

#### 1.1 Shamir-split coordinator MACI key (the privacy unlock)

**Trigger**: before the citizen base exceeds ~50, or before the system carries any vote whose outcome creates real-world enforcement.
**Done when**: the Babyjubjub decryption key is reconstructed only in a multi-party-computation protocol across N≥3 founding-attester custodians, with M-of-N threshold reconstruction. No single machine ever holds the full secret.
**Notes**: requires either (a) running the proof-generation step inside the threshold-MPC ceremony for each finalize, or (b) a per-poll throwaway key derivation pattern. (a) is simpler operationally; (b) limits blast radius if a single key leaks. Either resolves the §10.2 trust assumption "the coordinator's Babyjubjub privkey isn't leaked" and lets the [§1 TL;DR](#1-tldr) reclaim "privacy from the coordinator" honestly.

#### 1.2 3-of-5 attester Safe as Tally submitter

**Trigger**: same as 1.1.
**Done when**: the on-chain `proveOnChain` transactions are proposed to a Gnosis Safe owned by the founding attesters and confirmed before broadcast. The current single coordinator EOA goes from "trusted for liveness AND submission authority" to "trusted only for proof generation."
**Notes**: result-correctness is already trustless (the on-chain Verifier rejects bad proofs); this only hardens the submission step against single-operator coercion or compromise.

#### 1.3 Professional audit of `MaciAttesterGovernor`

**Trigger**: before the first treasury-bearing proposal (any proposal whose `execute()` moves funds, mints NFTs, or upgrades a contract).
**Done when**: at least one external audit report (Cyfrin, Trail of Bits, Hats, ChainSecurity, etc.) covering specifically the OZ Governor overrides — `state()`, `_quorumReached`, `_voteSucceeded`, `propose()` attester gate, `_deployPollFor` ownership transfer to coordinator. OZ Governor base + MACI v2 contracts already have public audits; only our overrides are new code.

#### 1.4 Expand the founding attester set to ≥7

**Trigger**: within 4 weeks of public launch. Until then, the bootstrap 3 + 2-of-N rule is structurally a 2-of-3 multisig — collusion-resistant against one, not two.
**Done when**: 7 active AttesterNFT holders, with at least 3 from each of the town's existing civic structures (Stadtrat, Kulturverein, Jugendvertretung, etc.) so social-fabric collusion is harder than a 2-of-3 friend group.

#### 1.5 Documented disaster-recovery procedure

**Trigger**: before scaling beyond pilot.
**Done when**: a written, rehearsed runbook covers: Fly account loss, deployer-EOA loss (the wallet that deployed everything), coordinator-EOA loss, Babyjubjub key loss, and the founder bus factor. Includes off-site encrypted backups of all secrets and a documented succession path that doesn't require any one person to be alive.

### Phase 2 — production-grade hardening

#### 2.1 Move auto-finalize off GitHub Actions

**Trigger**: any rotation with `tallyGracePeriod < 7d` (which we should also tighten — see 2.4).
**Done when**: the cron trigger is one of:
  - A small VPS with `systemd` timers (operationally simplest; still single-operator).
  - A Chainlink Automation upkeep or Gelato Web3 Function (decentralized, costs ~$5–10/month per upkeep).
**Why**: GitHub Actions explicitly throttles `*/15` schedules — we observed 60–90 min effective cadence. For a 30-min-period proposal, that's a real liveness risk: a missed 15-min window means the tally lands after grace and the proposal becomes Defeated by timeout.

#### 2.2 Vote-receipt UX in Expo

**Trigger**: anytime — purely additive, no rotation needed.
**Done when**: [`LastVoteCard.tsx`](apps/expo/components/LastVoteCard.tsx) shows, in addition to the tx hash, a one-tap inclusion check: parse the `PublishMessage` event from the tx receipt to confirm the encrypted ballot ended up in `Poll.numMessages` at the expected index. Optionally compute a Merkle proof against the message tree post-merge so a citizen can prove their ballot is in the tallied set.

#### 2.3 Documented coordinator key rotation procedure

**Trigger**: before the first scheduled key rotation (recommend every 6 months).
**Done when**: written procedure, rehearsed once on testnet, covers: generate fresh Babyjubjub keypair via the founding-attester ceremony → redeploy `MaciAttesterGovernor` with new `coordinatorPubKey` (current path; expensive) OR design a per-poll coordinator-key pattern that makes routine rotation cheap. The current architecture forces a Governor redeploy because `coordinatorPubKey` is an immutable constructor arg passed into every `MACI.deployPoll` call.

#### 2.4 Tighten `tallyGracePeriod` from 7 days to ≤24 hours

**Trigger**: after Phase 2.1 (decentralized cron) ships.
**Done when**: `tallyGracePeriod` is `≤86_400` and the cron has been running cleanly for at least 4 weeks. The current 7 days was set conservatively while the cron path was unproven; after Phase 2.1 it's overengineered and widens the window in which a coordinator-side mistake can affect the recorded outcome.

#### 2.5 Reproducible front-end builds + IPFS pinning

**Trigger**: before any binding vote.
**Done when**: the Expo bundle and the `apps/web` build are reproducible from source (lockfiles, deterministic builds, hash published on chain), and the IPFS-pinned bundle is available as an alternative entry point. Defends against a Vercel / EAS supply-chain compromise pointing voters at a wrong proposal.

### Phase 3 — long-term decentralization

These are not pilot-blockers but they shape the long-term integrity of the system.

#### 3.1 Citizen-initiated proposals (or escape hatch)

**Trigger**: politically: when the citizen base passes ~200 and a non-attester wants to propose something the attesters won't.
**Done when**: either (a) a parallel `propose()` path opens for citizens with N-of-M citizen co-sponsorship (e.g. 10 citizens), or (b) a documented escape hatch that lets the community fork the system if attesters become a captured class.

#### 3.2 Governance over MACI parameter changes

**Trigger**: post-pilot.
**Done when**: changing `votingPeriod`, `quorumAbsolute`, `tallyGracePeriod` requires going through the existing on-chain governance flow itself, not a deployer redeploy. Currently it's `REUSE_INFRA=1` from a privileged EOA — a single point of authority over the rules.

#### 3.3 Legal status clarified in README

**Trigger**: before public launch.
**Done when**: README states explicitly whether a Roebel vote is a `Verein` internal decision, a non-binding `Bürgerbefragung`, an input to `Stadtrat` resolutions, or something else, and what the legal liability of the founders is for a wrong tally. Citizens deserve to know how to interpret the on-chain outcome.

### Cosmetic dead code

**`CitizenNFT` inherits `ERC721Votes`** (`getVotes(address)`, `delegates(address)`) from when the original public-vote `AttesterGovernor` was the live governor. The current `MaciAttesterGovernor` doesn't read it — voting weight is read from `Tally` instead. The hook is still callable but Roebel governance does not consult it. The risk surface is: someone deploys a *different* governance contract pointing at `CitizenNFT.getVotes` to siphon citizen voting weight into an unrelated DAO. Citizens would still need to interact with that contract for it to matter (no automatic exposure), so the surface is cosmetic. We'll keep it documented; if/when CitizenNFT is redeployed for an unrelated reason, drop the inheritance.

---

## 12. Appendix

### 12.1 Glossary

| Term | Meaning |
|---|---|
| **MACI** | Minimal Anti-Collusion Infrastructure — the privacy + collusion-resistance protocol from PSE that we use for voting |
| **Babyjubjub** | The elliptic curve MACI uses for keypairs (different from Ethereum's secp256k1; chosen because it's efficient inside Groth16 circuits) |
| **State tree** | Per-MACI-instance Merkle tree of registered `(pubKey, voiceCredits)` pairs. New signups append leaves. Depth 14 → ~6 B leaves capacity |
| **Ballot tree** | Per-Poll Merkle tree of one ballot per signup. Each ballot is `(voteOptionTreeRoot, nonce)` |
| **Message tree** | Per-Poll Merkle tree of encrypted messages. Depth 9 + sub-depth 2 → 5⁹ ≈ 2 M total messages, batch-processed 5² = 25 at a time |
| **Vote-option tree** | Per-Poll Merkle tree of vote options; depth 3 → 5³ = 125 options. We use 3 (Against/For/Abstain) |
| **`stateIndex`** | The leaf position of a citizen in the state tree, assigned by MACI on signup |
| **`numSignUps`** | The state-tree leaf count on a Poll (zero before `mergeMaciState`) |
| **`tallyBatchNum`** | How many tally batches have been proven on a Tally contract (zero before any `tallyVotes` proof lands) |
| **`totalTallyResults`** | How many `(voteOption, value)` pairs have been added on a Tally contract (zero before `addTallyResult`). The real "is the tally done" signal |
| **Coordinator** | The off-chain operator who decrypts ballots and posts the tally proof |
| **`tallyGracePeriod`** | Seconds the Governor will continue reporting Active after the voting deadline, while waiting for the coordinator's tally |
| **Orphan proposal** | A proposal that was created on an earlier (now-rotated) Governor; the current Governor's `proposalPolls(id)` returns the zero address |

### 12.2 Cryptographic parameters

The single source of truth for tree depths is the circuit signature:

```
ProcessMessagesNonQv(stateTreeDepth, msgTreeDepth, msgBatchDepth, voteOptionTreeDepth)
TallyVotesNonQv     (stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth)
```

The zKey filename `ProcessMessagesNonQv_14-9-2-3.zkey` encodes the params **in template-signature order**, NOT in `Poll.treeDepths` order. Mapping table:

| `Poll.treeDepths` field | Production zKey value |
|---|---|
| `intStateTreeDepth` | **5** (TallyVotesNonQv_14-**5**-3) |
| `messageTreeSubDepth` (= `msgBatchDepth`) | **2** (ProcessMessagesNonQv_14-9-**2**-3) |
| `messageTreeDepth` (= `msgTreeDepth`) | **9** (ProcessMessagesNonQv_14-**9**-2-3) |
| `voteOptionTreeDepth` | **3** |

Capacity implications:
- State tree (depth 14): 5¹⁴ ≈ 6.1 B citizens — comfortably more than Roebel's 5,000.
- Message batch (5²): 25 encrypted ballots per process-circuit invocation.
- Total messages per Poll (5⁹): ≈ 2 M.
- Voting options (5³): 125 — three of them used (Against/For/Abstain).

### 12.3 `isTallied()` is vacuously true

`Tally.isTallied()` is computed as `tallyBatchNum * 5^intStateTreeDepth >= numSignUps`. For a poll where `mergeSignups` was never called, `numSignUps = 0`, so the predicate is `0 >= 0 = true` even though no actual tally has been submitted.

We discovered this when [`scan-and-finalize.js`](../apps/coordinator/scripts/scan-and-finalize.js) was silently skipping a fresh poll. The fix is to use `Tally.totalTallyResults() > 0` as the real "results landed on chain" signal — that's only non-zero after `addTallyResult` has actually been called.

Don't use `isTallied()` anywhere — including inside `MaciAttesterGovernor._quorumReached` / `_voteSucceeded` / `state()`, which originally trusted it (rotation #6 fixed that).

### 12.4 History of the rotations

In sequence, why each was needed:

1. **First Governor deploy** (2026-05-07, archived as `0x3B13…45c2e`). Worked for the public-vote tests. Rotated when we moved to MACI.

2. **Second Governor** (`0xc637C9…315A6`). First MACI deploy. `messageTreeSubDepth = 1` → batch size 5. Rotated to fix this.

3. **Third Governor** (`0xE7123B…D9d6F`). 7-day voting period. `messageTreeSubDepth = 2` ✓ (batch size 25), but a fresh `VkRegistry` was deployed alongside because tally-VK signatures collide on the same key regardless of `messageBatchSize`. Tally for Test 5/6/7 worked. Rotated for the 30-min testing window.

4. **Fourth Governor** (`0x11ed03Db…E84f`). 30-min voting period. Same `VkRegistry` as #3. **Failed at `genProofs`** with `The number of leaves must be less than the tree capacity` — root cause: `messageTreeDepth = 2` (off-chain message tree had capacity exactly equal to `messageBatchSize=25`) and `intStateTreeDepth = 9` (didn't match the tally zKey's 5).

5. **Fifth Governor** (`0x61E899…E60B`). 30-min voting period. New `VkRegistry`. All four tree depths aligned with the zKey signatures. Worked end-to-end **for the test where the tally landed**, but Test 10 surfaced a contract-side bug:

6. **Sixth Governor** (`0x5983F6…30F3`, current, 2026-05-09). 30-min voting period. Same `VkRegistry` as #5. The contract's `state()` override and `_quorumReached`/`_voteSucceeded` trusted the same vacuous `Tally.isTallied()` predicate that we'd already patched out of [`scan-and-finalize.js`](../apps/coordinator/scripts/scan-and-finalize.js). For un-merged polls (numSignUps=0), `isTallied()` returns true vacuously, so the grace-period override was skipped and the badge flipped to `ABGELEHNT` the moment the deadline passed even before the coordinator had a chance to run. Rotation #6 swaps every internal `isTallied()` check for `totalTallyResults() > 0`, which is only non-zero after `addTallyResult` has actually been called. Verified by deploying then watching the badge stay `AKTIV` past the deadline.

Lessons for the next rotation:
- The zKey filename's number ordering matches the **circuit template signature**, not the `Poll.treeDepths` struct order. Always verify against `node_modules/maci-circuits/circom/core/non-qv/{processMessages,tallyVotes}.circom`.
- The `setVerifyingKeysBatch` signature on `VkRegistry` registers process + tally VKs together. The tally VK's key ignores `messageBatchSize` (uses only `(stateTreeDepth, intStateTreeDepth, voteOptionTreeDepth)`), so re-registering at a new batch size collides on the tally side. Deploy a fresh `VkRegistry` instead.

### 12.5 File index

| Path | Role |
|---|---|
| [`contracts/governor-contract/contracts/verification-system/AttesterNFT.sol`](../contracts/governor-contract/contracts/verification-system/AttesterNFT.sol) | 2-of-N attester soulbound NFT |
| [`contracts/governor-contract/contracts/verification-system/CitizenNFT.sol`](../contracts/governor-contract/contracts/verification-system/CitizenNFT.sol) | 1-Att + 1-Cit citizen soulbound NFT |
| [`contracts/governor-contract/contracts/verification-system/MaciAttesterGovernor.sol`](../contracts/governor-contract/contracts/verification-system/MaciAttesterGovernor.sol) | OZ Governor with MACI hooks |
| [`contracts/governor-contract/scripts/deploy-maci-base.cjs`](../contracts/governor-contract/scripts/deploy-maci-base.cjs) | Full + REUSE_INFRA deploy |
| [`contracts/governor-contract/scripts/register-vk-batch25.cjs`](../contracts/governor-contract/scripts/register-vk-batch25.cjs) | One-off VkRegistry rotation |
| [`contracts/governor-contract/deployments/base.json`](../contracts/governor-contract/deployments/base.json) | Canonical mainnet addresses |
| [`apps/coordinator/Dockerfile`](../apps/coordinator/Dockerfile) | Coordinator container build |
| [`apps/coordinator/fly.toml`](../apps/coordinator/fly.toml) | Fly.io machine config |
| [`apps/coordinator/scripts/finalize-poll.js`](../apps/coordinator/scripts/finalize-poll.js) | Per-poll finalize pipeline |
| [`apps/coordinator/scripts/scan-and-finalize.js`](../apps/coordinator/scripts/scan-and-finalize.js) | Walk all polls, finalize pending |
| [`apps/coordinator/scripts/healthcheck.js`](../apps/coordinator/scripts/healthcheck.js) | `/healthz` + `/status` + `/finalize-pending` |
| [`.github/workflows/coordinator-cron.yml`](../.github/workflows/coordinator-cron.yml) | 15-min auto-finalize cron |
| [`apps/web/src/lib/contracts.ts`](../apps/web/src/lib/contracts.ts) | Web app contract addresses |
| [`apps/web/src/app/app/proposals/create/page.tsx`](../apps/web/src/app/app/proposals/create/page.tsx) | Attester proposal-creation form |
| [`apps/expo/constants/thirdweb.ts`](../apps/expo/constants/thirdweb.ts) | Expo app contract addresses |
| [`apps/expo/context/MaciContext.tsx`](../apps/expo/context/MaciContext.tsx) | Per-citizen MACI state machine |
| [`apps/expo/components/VoteButtons.tsx`](../apps/expo/components/VoteButtons.tsx) | Citizen voting UI |
| [`apps/expo/components/VotingStats.tsx`](../apps/expo/components/VotingStats.tsx) | Tally results UI |
| [`apps/expo/components/ProposalTimeline.tsx`](../apps/expo/components/ProposalTimeline.tsx) | Real-time countdown + timeline |
| [`apps/expo/components/LastVoteCard.tsx`](../apps/expo/components/LastVoteCard.tsx) | "Du hast … gestimmt" + Stimme ändern |
| [`apps/expo/components/ProposalStateBadge.tsx`](../apps/expo/components/ProposalStateBadge.tsx) | Live chain-state badge |
| [`packages/blockchain/src/index.ts`](../packages/blockchain/src/index.ts) | Cross-app contract registry |

### 12.6 External references

- MACI v2 docs: https://maci.pse.dev
- Production trusted-setup ceremony: https://maci.pse.dev/blog/maci-v2-ceremony (PSE)
- ZK proof system: Groth16 with Babyjubjub-friendly Poseidon hashes
- Base mainnet (chainId 8453): https://basescan.org
- OpenZeppelin Governor: https://docs.openzeppelin.com/contracts/5.x/governance
