# MACI v2 Privacy-Voting Governor — Base Mainnet Deployment

This guide walks you through deploying a complete MACI v2 privacy-voting stack on **Base mainnet**, wired to your existing on-chain `AttesterNFT` (`0xa06F09Cb…`) and `CitizenNFT` (`0xe2d39ffd…`).

The MACI v2 trusted-setup ceremony is complete (per [MACI docs](https://maci.pse.dev/docs/security/trusted-setup)) — production zKeys exist and the cryptographic security model holds. We deliberately stayed on v2 instead of the unreleased v3 because v3's ceremony "has not started yet."

## Files in this commit

| File | Role |
|---|---|
| [MaciAttesterGovernor.sol](MaciAttesterGovernor.sol) | OZ Governor: Attester-gated `propose()`, deploys a fresh MACI Poll per proposal, reads tally for quorum/success, hands MP/Tally ownership to the coordinator address |
| [AttesterNFT.sol](AttesterNFT.sol) / [CitizenNFT.sol](CitizenNFT.sol) | unchanged — already live on Base mainnet |
| [AttesterGovernor.sol](AttesterGovernor.sol) | unchanged — old public-vote governor stays for proposal history |
| [../../scripts/deploy-maci-base.ts](../../scripts/deploy-maci-base.ts) | full deploy chain: gatekeeper → voice credit proxy → MACI core → Verifier → VkRegistry → Timelock → Governor |
| [../../scripts/download-zkeys.sh](../../scripts/download-zkeys.sh) | fetches the 1.5 GB production-ceremony tarball and extracts to `./zkeys/` |
| [../../scripts/generate-coordinator-keypair.ts](../../scripts/generate-coordinator-keypair.ts) | one-shot Babyjubjub keypair generator for the coordinator |
| [../../.env.example](../../.env.example) | template for the deployer's local `.env` |
| [../../hardhat.config.js](../../hardhat.config.js) | Base + Base Sepolia networks, multi-compiler |

We deliberately use **stock MACI v2 contracts** (no custom Solidity beyond the Governor) for the gatekeeper and voice-credit proxy:
- `SignUpTokenGatekeeper(citizenNFT)` — built into `maci-contracts@2.5.0`. Gates MACI signups by CitizenNFT ownership: each token can sign up exactly once.
- `ConstantInitialVoiceCreditProxy(1)` — built in. Issues 1 voice credit per signup (non-QV → 1 NFT = 1 vote).

## Step-by-step deployment

All commands run from `contracts/governor-contract/`.

### 1. Configure environment

```bash
cp .env.example .env
$EDITOR .env
```

Required values:
- `DEPLOYER_PRIVATE_KEY` — the EOA paying gas for the deploy. Needs ~0.01 ETH on Base for the full chain.
- `BASE_RPC_URL` — public `https://mainnet.base.org` works; for higher reliability use Alchemy/QuickNode.
- `ATTESTER_NFT_ADDRESS` / `CITIZEN_NFT_ADDRESS` — pre-filled with the live Base mainnet addresses.
- `COORDINATOR_ADDRESS` — see step 3.
- `COORDINATOR_PUBKEY_X` / `COORDINATOR_PUBKEY_Y` — see step 3.
- Governance parameters (defaults: 7-day voting, 10% quorum, 7-day tally grace, 2-day timelock).

### 2. Download the production ceremony zKeys

```bash
bash scripts/download-zkeys.sh
```

This pulls `maci_artifacts_14-9-2-3_prod.tar.gz` (~1.5 GB) from PSE's S3 and extracts to `./zkeys/`. Idempotent — re-run anytime; it skips if already extracted.

The `14-9-2-3` parameter set means: state tree depth 14 (max 16,384 signups — plenty for ~6,500 Roebel/Müritz citizens), int state tree depth 9, message tree depth 2, vote option tree depth 3. These match what we hard-code in [scripts/deploy-maci-base.ts](../../scripts/deploy-maci-base.ts).

### 3. Generate the coordinator keypair

**Do this on the machine that will host the Coordinator Service**, not on your dev laptop. The private key is the secret that decrypts every encrypted ballot:

```bash
npx ts-node scripts/generate-coordinator-keypair.ts \
    > coordinator.pub \
    2> coordinator.priv
```

Then:
1. Copy the `COORDINATOR_PUBKEY_X` / `COORDINATOR_PUBKEY_Y` lines from `coordinator.pub` into your `.env`.
2. Move `coordinator.priv` into your secret manager (Fly secrets / 1Password / hardware key) and shred the file.
3. Decide what `COORDINATOR_ADDRESS` will be — this is the *Ethereum* EOA (or Safe) that signs `tallyVotes` and `processMessages` transactions. It can be:
   - **v1:** a single EOA derived from a separate secret. Cheap, simple.
   - **v1.1 (recommended for Devcon):** a 3-of-5 Gnosis Safe owned by your founding attesters. Adds a per-tally human approval gate; doesn't require contract changes.

Set `COORDINATOR_ADDRESS` in `.env` accordingly.

### 4. Run the deploy

```bash
npx hardhat run scripts/deploy-maci-base.ts --network base
```

This deploys, in order:
1. `SignUpTokenGatekeeper(citizenNFT)`
2. `ConstantInitialVoiceCreditProxy(1)`
3. `PoseidonT3` / `T4` / `T5` / `T6`
4. `PollFactory`, `MessageProcessorFactory`, `TallyFactory` (Poseidon-linked)
5. `MACI` core (state tree depth 14)
6. `Verifier`
7. `VkRegistry` + uploads the production non-QV process & tally VKs
8. `TimelockController` (2-day default delay)
9. `MaciAttesterGovernor`

Final action: grants the Governor the timelock's `PROPOSER_ROLE` and `CANCELLER_ROLE`, then renounces the deployer's `DEFAULT_ADMIN_ROLE`. After that the timelock is fully autonomous.

Output: `deployments/base.json` with every address.

Approximate gas cost on Base at ~0.05 gwei: **0.001 ETH (~$2.50)**. Linked Poseidon contracts are the bulk of the spend.

### 5. Wire into the apps

Update `packages/blockchain/addresses.ts` with `maciAttesterGovernor` from `deployments/base.json`. The frontend now points at the new Governor; the old `0x84D8ab0Fc…` AttesterGovernor stays on chain for past proposals.

## Per-proposal lifecycle

1. **Attester proposes** → `MaciAttesterGovernor.propose(targets, values, calldatas, description)`:
   - reverts unless caller holds an AttesterNFT
   - calls `super.propose(...)` to register the OZ proposal
   - calls `MACI.deployPoll(duration, treeDepths, coordinatorPubKey, verifier, vkRegistry, NON_QV)` — voting period = `votingPeriod()` from settings
   - reads the new `pollId = MACI.nextPollId() - 1` and the `(poll, mp, tally)` triple
   - **transfers ownership of `MessageProcessor` and `Tally` to `coordinator`** so the coordinator can submit proofs without proxying through the Governor
   - emits `PollLinked(proposalId, poll, tally, pollId)`

2. **Citizens sign up** (one-time per MACI instance):
   - frontend generates a Babyjubjub keypair via `maci-domainobjs`
   - smart account calls `MACI.signUp(pubKey, abi.encode(tokenId), "")` — `tokenId` is the citizen's CitizenNFT id; `SignUpTokenGatekeeper` enforces ownership and one-shot use

3. **Citizens vote**:
   - frontend encrypts ballot to `coordinatorPubKey`
   - smart account calls `Poll.publishMessage(message, ephemeralPubKey)` — voters can re-publish to change their vote until `endDate`

4. **Coordinator finalizes** (after voting period):
   - decrypts messages off-chain
   - generates ZK proofs (Process + Tally circuits)
   - submits via `MessageProcessor.processMessages(...)` then `Tally.tallyVotes(...)` then `Tally.addTallyResults(...)`
   - on-chain Tally now exposes `isTallied() == true` and `tallyResults(0..2)`

5. **Anyone executes**:
   - call `governor.queue(...)` then (after the timelock min-delay) `governor.execute(...)`
   - Governor's `_quorumReached` reads `Tally.totalSpent() >= quorum(0)`
   - Governor's `_voteSucceeded` reads `Tally.tallyResults(1).value > Tally.tallyResults(0).value`

If the coordinator doesn't post the tally within `tallyGracePeriod` after the deadline, the proposal moves to `Defeated` and cannot execute — fail-safe.

## thirdweb smart-wallet compatibility

Every user-facing call (`signUp`, `publishMessage`, `propose`) authenticates only via `msg.sender`. The thirdweb `inAppWallet + smartAccount` pair makes the smart account `msg.sender`, holds the CitizenNFT, and pays gas through your bundler/paymaster. **No EOA dependency anywhere in the user flow.**

## Verification checklist

Before pointing real proposals at the new Governor:

- [ ] `npx hardhat compile` clean (warnings about unreachable `_countVote` are expected)
- [ ] `bash scripts/download-zkeys.sh` finished, both .zkey files present
- [ ] `deployments/base.json` contains all 12 addresses
- [ ] `gatekeeper.maci()` returns the MACI core address
- [ ] `vkRegistry.hasNonQvProcessVk(...)` returns true (or equivalent — check via Basescan)
- [ ] `governor.attesterNFT()` returns `0xa06F09Cb…`
- [ ] `governor.coordinator()` returns the address you set
- [ ] `timelock.hasRole(PROPOSER_ROLE, governor) == true` and `hasRole(DEFAULT_ADMIN_ROLE, deployer) == false`
- [ ] **Pilot proposal**: an attester proposes a no-op (e.g. `governor.updateVotingPeriod(...)` itself). Verify `PollLinked` fires, `MACI.polls(0)` returns non-zero addresses, and the Tally's owner equals `coordinator`.

## Layered coordinator hardening (post-v1)

The MaciAttesterGovernor contract does **not** change between layers — only the off-chain coordinator setup does:

- **Layer 1 (do this for Devcon):** swap `COORDINATOR_ADDRESS` from a single EOA to a 3-of-5 Gnosis Safe of founding attesters. Each tally submission requires their explicit approval. Safe address is set in `.env` *before* deploy and baked into the Governor immutably.
- **Layer 2 (v1.1):** Shamir-split the Babyjubjub coordinator privkey across 5 attesters. Each tally is a coordinated event on an ephemeral Fly.io machine; reconstruction happens in memory only, then the machine self-destructs. Trust assumption: ≤2 attesters compromised at the tally window.
- **Layer 3 (when v3 ceremony lands):** swap to MPC-based threshold decryption — no key reconstruction at all. Requires a contracts upgrade once v3 is production-ready.
