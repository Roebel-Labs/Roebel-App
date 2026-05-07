# MACI Privacy-Voting Governor — Deployment Guide

This directory now contains three new contracts that swap the public-vote `AttesterGovernor` for a MACI v3 privacy-voting governor while reusing the existing `AttesterNFT` and `CitizenNFT` deployments on Base mainnet.

## What changed

| File | Status | Purpose |
|---|---|---|
| [AttesterNFT.sol](AttesterNFT.sol) | unchanged | Soulbound attester NFT (live: `0xa06F09Cb406880512326318fbC09Cdb28631DA73`) |
| [CitizenNFT.sol](CitizenNFT.sol) | unchanged | Soulbound voter NFT (live: `0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7`) |
| [AttesterGovernor.sol](AttesterGovernor.sol) | unchanged, kept for history | Old public-vote governor (live: `0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b`) |
| [CitizenNFTPolicy.sol](CitizenNFTPolicy.sol) | **new** | Excubiae `IBasePolicy` that gates MACI signup/poll-join by CitizenNFT ownership |
| [CitizenNFTVoiceCreditsProxy.sol](CitizenNFTVoiceCreditsProxy.sol) | **new** | `IInitialVoiceCreditProxy` returning 1 credit per CitizenNFT |
| [MaciAttesterGovernor.sol](MaciAttesterGovernor.sol) | **new** | OZ Governor whose `propose()` deploys a fresh MACI Poll; reads tally for quorum/success |

The old `/contracts/maci/` and `/contracts/HomeTownMaciGovernor.sol` (stub-based, never worked) have been deleted.

## Prerequisites — what you must deploy *before* this Governor

MACI cannot run without its own infrastructure. PSE does **not** maintain pre-deployed MACI contracts on Base — you deploy them yourself, **once**, then reuse for every poll. This step is Hardhat-only (Remix can't compile circuits or run the deployer task chain).

Deploy on **Base Sepolia first** for end-to-end testing, then on **Base mainnet** when green.

You need:

1. **Poseidon hash libraries** (T3, T4, T5, T6) — deploy from [`node_modules/@maci-protocol/contracts/contracts/crypto/`](../../node_modules/@maci-protocol/contracts/contracts/crypto/). MACI's hardhat tasks (`npx hardhat deploy-full`) handle this automatically.
2. **Verifier** + **VkRegistry** + zKey artifacts — installed from PSE's S3 by the MACI CLI.
3. **PollFactory**, **MessageProcessorFactory**, **TallyFactory** — deployed by the same task.
4. **MACI core** — its constructor takes the three factories + the **global** `CitizenNFTPolicy` (deploy that first; see step A below).
5. **Coordinator Service** — Docker container (Fly.io recommended) holding the Babyjubjub coordinator key. See [`apps/coordinator/`](../../../../apps/coordinator/) (separate workstream).

The full MACI infra deployment is documented at https://maci.pse.dev/docs/quick-start — drop the deployer's private key into a `.env` file in this package and run `npx hardhat deploy-full --network baseSepolia`.

## Deployment order via Remix

Once MACI infrastructure exists on the target chain, **everything below can be done in Remix**. Open Remix, create a workspace from this folder (or use Remix's GitHub import on `roebel/roebel`), set the compiler to **Solidity 0.8.28** with optimizer **enabled, runs=200, viaIR=true**, and connect Remix to your thirdweb deployer wallet on Base.

### Step A — Global CitizenNFTPolicy

Deploy [CitizenNFTPolicy.sol](CitizenNFTPolicy.sol).

Constructor args:
- `_citizenNFT`: `0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7` (Base mainnet) or your fresh CitizenNFT on Sepolia.

This single instance is the **MACI sign-up policy**: it gates who can sign up to MACI itself. After MACI is deployed in Step B you'll call `setTarget(MACI_address)` on this instance once.

> **⚠️** Hand this policy's address to the MACI infrastructure deployer task — it goes into MACI's constructor.

### Step B — MACI core deployment (Hardhat, not Remix)

Run the MACI deployer with the policy address from Step A. The output is a JSON file with addresses for `MACI`, `Verifier`, `VkRegistry`, `PollFactory`, `MessageProcessorFactory`, `TallyFactory`, and the deployed Poseidon libraries.

After deployment, in Remix call `CitizenNFTPolicy.setTarget(MACI_address)` on the Step-A policy. The policy is now bound; it will reject any caller that isn't MACI.

### Step C — Shared CitizenNFTVoiceCreditsProxy

Deploy [CitizenNFTVoiceCreditsProxy.sol](CitizenNFTVoiceCreditsProxy.sol). One instance suffices for every poll, forever.

Constructor args:
- `_citizenNFT`: same as Step A
- `_creditsPerNFT`: `1` (1 NFT = 1 voice credit, non-quadratic)

### Step D — Fresh TimelockController (optional)

If you want a separate timelock from the legacy `0xed1680…` one, deploy `@openzeppelin/contracts/governance/TimelockController.sol` via Remix.

Constructor args:
- `minDelay`: `172800` (2 days; tweak to taste)
- `proposers`: `[]` (empty; the Governor will be granted PROPOSER_ROLE post-deployment)
- `executors`: `[address(0)]` (anyone can execute, common pattern)
- `admin`: your deployer EOA (you'll renounce after handover)

### Step E — MaciAttesterGovernor

Deploy [MaciAttesterGovernor.sol](MaciAttesterGovernor.sol).

Constructor takes a single `InitArgs` struct. Fill it with:

| Field | Value |
|---|---|
| `attesterNFT` | `0xa06F09Cb406880512326318fbC09Cdb28631DA73` (mainnet) |
| `citizenNFT` | `0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7` (mainnet) |
| `maci` | from Step B |
| `verifier` | from Step B |
| `vkRegistry` | from Step B |
| `initialVoiceCreditProxy` | from Step C |
| `coordinatorPubKey` | `(x, y)` pair from `maci-cli generateMaciKeypair` (run on the Coordinator Service host) |
| `treeDepths` | `(stateTreeDepth, voteOptionTreeDepth)` matching the zKeys you downloaded — typically `(10, 2)` for the default Base profile |
| `messageBatchSize` | `20` (default) |
| `voteOptions` | `3` (Against / For / Abstain) |
| `mode` | `0` for non-QV, `1` for QV. Use **0** for the Roebel 1-citizen-1-vote model. |
| `timelock` | from Step D, or the existing `0xed1680…` |
| `votingDelay` | `86400` seconds (1 day) |
| `votingPeriod` | `604800` seconds (7 days) |
| `quorumPercentage` | `10` (10% of citizens must cast a ballot) |
| `tallyGracePeriod` | `604800` seconds (7 days for the coordinator to submit the tally) |

### Step F — Wire Timelock roles

If you deployed a fresh Timelock in Step D, grant the Governor `PROPOSER_ROLE` and `CANCELLER_ROLE`, then renounce the admin role:

```solidity
timelock.grantRole(timelock.PROPOSER_ROLE(), maciGovernor);
timelock.grantRole(timelock.CANCELLER_ROLE(), maciGovernor);
timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);
```

### Step G — Frontend address swap

Update `packages/blockchain/addresses.ts` with the new `maciGovernor` address. Both apps will pick it up. The old `0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b` AttesterGovernor stays on-chain for history.

## Per-proposal lifecycle

Once deployed, the flow is fully on-chain:

1. **Attester proposes** → `MaciAttesterGovernor.propose(targets, values, calldatas, description)`. The Governor:
   - reverts if the caller doesn't hold an AttesterNFT
   - calls OZ's `super.propose(...)` to register the proposal
   - deploys a fresh per-poll `CitizenNFTPolicy`
   - calls `MACI.deployPoll(args)` → returns `(poll, messageProcessor, tally)`
   - calls `policy.setTarget(poll)`
   - emits `PollLinked(proposalId, poll, tally, pollId)`

2. **Citizens sign up** (one-time per MACI instance) → frontend generates a Babyjubjub keypair via `@maci-protocol/sdk`, calls `MACI.signUp(pubKey, "")` from the thirdweb smart account.

3. **Citizens vote** → frontend encrypts the ballot to the coordinator pubkey, calls `Poll.publishMessage(message, ephemeralPubKey)`. Voters can re-publish to change their vote until `endDate`.

4. **Coordinator finalizes** → after `endDate`, the Coordinator Service:
   - decrypts all messages
   - generates a ZK-SNARK proof of correct tally
   - submits via `Tally.tallyVotes(...)` then `Tally.addTallyResults(...)`
   - on-chain Tally now has `isTallied() == true` and `tallyResults(0..2)` populated

5. **Anyone executes** → call `MaciAttesterGovernor.queue(...)` then (after timelock delay) `execute(...)`. The Governor's `_quorumReached` and `_voteSucceeded` overrides read directly from the Tally.

If the coordinator misses the `tallyGracePeriod` window, the proposal is `Defeated` and cannot execute — fail-safe.

## thirdweb smart-wallet compatibility

Every user-facing call (`signUp`, `publishMessage`, `propose`) authenticates via `msg.sender`. The thirdweb `inAppWallet + smartAccount` pair makes the smart account `msg.sender`, holds the CitizenNFT, and pays gas via the bundler/paymaster. **Nothing in this contract suite requires an EOA.**

## Verification checklist

Before announcing the new Governor:

- [ ] `npx hardhat compile` clean (warnings only)
- [ ] Step A policy deployed; `trait()` returns `"CitizenNFT"`; `setTarget` callable once
- [ ] Step C voice-credits proxy returns `1` for a known citizen address, `0` for a non-citizen
- [ ] Step E Governor's `quorum(0)` returns `(totalCitizens * 10) / 100`
- [ ] Test proposal on Sepolia: `PollLinked` event fires, `proposalPolls(proposalId).poll != 0x0`
- [ ] 5 test citizens sign up + vote + change one vote
- [ ] Coordinator submits tally → `governor.state(proposalId)` flips from `Active` to `Succeeded`
- [ ] `queue` + `execute` succeed; Timelock fires the proposal action

## Future hardening

- **Multi-attester coordinator** — see plan v1.1: Tally-submitter Safe (3-of-5 founding attesters) and Shamir-split Babyjubjub key. The Governor itself does not change; only the Coordinator Service backend changes.
