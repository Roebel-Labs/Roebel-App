# Docs Index

This folder mixes **current, load-bearing documentation** with **historical engineering notes** kept for context. This index tells you which is which.

> **Rule of thumb for contract addresses:** docs go stale; code does not. The canonical, active contract addresses are always [packages/blockchain/src/index.ts](../packages/blockchain/src/index.ts) and the deployment manifests in [contracts/governor-contract/deployments/](../contracts/governor-contract/deployments/). If a doc below disagrees, the code wins.

## Start Here

| Doc | What it is |
|-----|-----------|
| [FORKING_GUIDE.md](FORKING_GUIDE.md) | **Bring this stack to your own town** — the project's raison d'être |
| [MACI_E_GOVERNANCE.md](MACI_E_GOVERNANCE.md) | Full architecture of the private-voting layer (identity → Governor → MACI → coordinator → apps). *Mechanism walkthrough is current; its example addresses predate the Gnosis move* |
| [AGENTS.md](AGENTS.md) | Guidance for AI agents working in this repo |

## Current Runbooks & State

| Doc | What it is |
|-----|-----------|
| [MACI_SHAMIR_OPERATIONS.md](MACI_SHAMIR_OPERATIONS.md) | Operational runbook for the 3-of-5 Shamir coordinator federation — read §10 (production lessons) before touching coordinator code |
| [SHAMIR_CEREMONY.md](SHAMIR_CEREMONY.md) | Conceptual deep-dive: why and how the coordinator key is split |
| [CIRCLES_ROEBEL_MUENZEN_STATE.md](CIRCLES_ROEBEL_MUENZEN_STATE.md) | **Canonical Circles / Röbel Münzen state** — surfaces, mechanics, gotchas. Read before touching anything Circles |
| [CIRCLES_TOKENOMICS.md](CIRCLES_TOKENOMICS.md) | Currency design: collateral, minting, trust graph |
| [BLOCKCHAIN_DIAGNOSTICS_GUIDE.md](BLOCKCHAIN_DIAGNOSTICS_GUIDE.md) | Debugging on-chain issues |
| [DEPLOYMENT_PLAYBOOK.md](DEPLOYMENT_PLAYBOOK.md) | Deployment procedures |

## Design Docs & Plans

- [superpowers/plans/](superpowers/plans/) — dated implementation plans and design specs. Most useful: [2026-06-24 Gnosis consolidation + Sybil hardening](superpowers/plans/2026-06-24-gnosis-consolidation-and-sybil-hardening.md) (the current identity-threshold model)
- [superpowers/specs/](superpowers/specs/), [superpowers/runbooks/](superpowers/runbooks/), [superpowers/spikes/](superpowers/spikes/)
- [handoffs/](handoffs/) — session handoff notes

## Research & Background

Context that informed decisions; not operational:

- [CIRCLES_V2_CHAIN_STRATEGY.md](CIRCLES_V2_CHAIN_STRATEGY.md), [CIRCLES_V2_FEATURE_VISION.md](CIRCLES_V2_FEATURE_VISION.md), [CIRCLES_V2_INTEGRATION_RESEARCH.md](CIRCLES_V2_INTEGRATION_RESEARCH.md)
- [CIRCLES_DEVREL_INVITE_QUOTA_REQUEST.md](CIRCLES_DEVREL_INVITE_QUOTA_REQUEST.md)

## Historical (kept for context — do NOT follow as instructions)

These describe past deployments, one-time fixes, or superseded approaches. Addresses and steps in them are stale.

- `CITIZEN_NFT_DEPLOYMENT_GUIDE.md`, `CITIZEN_NFT_DEPLOYMENT_READY.md`, `CITIZEN_NFT_FIXED_SUMMARY.md` — pre-v2 NFT deployments
- `COMPLETE_DEPLOYMENT_GUIDE.md`, `SECURE_BOOTSTRAP_DEPLOYMENT_GUIDE.md`, `CONTRACT_UPDATE_SUMMARY.md` — earlier (Base-era) deployment rounds
- `EIP712_ENCRYPTION_FIX.md`, `ENCRYPTION_FIX_COMPLETE.md`, `PRIVACY_ENCRYPTION_IMPLEMENTATION.md` — one-time encryption fixes, since landed
- `SEMAPHORE_README.md`, `SEMAPHORE_USAGE_GUIDE.md` — Semaphore exploration, superseded by MACI
- `PROPOSAL_MIGRATION_ISSUE.md`, `VERIFICATION_SYSTEM_STATUS.md`, `VOTING_DEBUG_IMPROVEMENTS.md`, `QUICK_START_TEST.md` — point-in-time status notes
- `EXPO_MOBILE_IMPLEMENTATION_GUIDE.md`, `GASLESS_TRANSACTIONS_GUIDE.md`, `SMART_ACCOUNT_GASLESS_SETUP.md`, `SMART_ACCOUNT_VOTING_EXPLANATION.md` — early implementation notes; concepts still apply, details may not
