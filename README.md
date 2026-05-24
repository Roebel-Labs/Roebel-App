<img width="1229" height="686" alt="1777224343114-28ylktjcd91 1 (1)" src="https://github.com/user-attachments/assets/aa398c24-560f-472c-af59-d2c906780fdf" />

# Roebel App

Open-source civic technology platform for Roebel/Mueritz, Mecklenburg-Vorpommern, Germany — a replicable blueprint for small towns building digital civic infrastructure.

## What's Inside

This [Turborepo](https://turbo.build/repo) monorepo contains:

### Apps

| App | Description | Stack |
|-----|-------------|-------|
| **[apps/web](apps/web/)** | Roebel Website | Next.js 15, Tailwind CSS, thirdweb v5 |
| **[apps/expo](apps/expo/)** | Roebel Mobile App (iOS + Android) | Expo SDK 55, React Native, thirdweb v5 |

### Packages

| Package | Description |
|---------|-------------|
| **[packages/config](packages/config/)** | Shared ESLint and TypeScript configs |
| **[packages/blockchain](packages/blockchain/)** | Contract ABIs, addresses, thirdweb utilities |
| **[packages/design-tokens](packages/design-tokens/)** | Shared colors, spacing, typography tokens |

### Smart Contracts

| Contract | Description |
|----------|-------------|
| **[contracts/governor-contract](contracts/governor-contract/)** | Hardhat Smart Contracts (OpenZeppelin v5) |

See [Smart Contracts & Governance](#smart-contracts--governance) below for the full on-chain architecture, deployed addresses, and voting rules.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (for the mobile app)

### Setup

```bash
# Clone the repo
git clone https://github.com/Roebel-Labs/Roebel-App.git
cd Roebel-App

# Install dependencies
pnpm install

# Copy environment variables
cp apps/web/.env.example apps/web/.env.local
cp apps/expo/.env.example apps/expo/.env

# Fill in your API keys in the .env files, then:

# Start web app
pnpm dev:web

# Start mobile app
pnpm dev:expo
```

## Architecture

- **Blockchain**: Base L2 + Thirdweb Smart Wallets (invisible Web3 — users never see a wallet)
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Governance**: MACI v2 privacy-preserving voting. Attesters (soulbound NFT) propose; Citizens (soulbound NFT) vote with encrypted ballots that an off-chain coordinator tallies + posts a ZK proof for. Executed through a Timelock.
- **AI**: Claude API powering the Mecky chatbot assistant

> 📘 **Full architecture reference:** [docs/MACI_E_GOVERNANCE.md](docs/MACI_E_GOVERNANCE.md) — canonical, current source of truth for the MACI v2 stack: live addresses on Base mainnet, identity layer (AttesterNFT + CitizenNFT), privacy layer (MACI core + Poll + MessageProcessor + Tally + VkRegistry), the off-chain coordinator + auto-finalize cron, the citizen onboarding / proposal / voting / tally flows end-to-end, the production zKey parameters, the operational runbook, the security model, and the **[roadmap to maximal trustlessness + decentralization](docs/MACI_E_GOVERNANCE.md#11-roadmap-to-maximal-trustlessness--decentralization)** (the honest delta between what's deployed today and what the system needs to carry binding civic decisions).

---

## Smart Contracts & Governance

The Röbel DAO runs on five contracts on **Base Mainnet (chain id 8453)**, all soulbound/non-transferable, all verified on Basescan. Voting is privacy-preserving via [MACI v2](https://maci.pse.dev). The latest rotation (`2026-05-23`) adds governance-tunable thresholds and changes citizen revocation from a 1-Attester rule to a 1-Attester + 1-Citizen rule (symmetric with attestation).

### Live addresses (rotated 2026-05-23)

| Contract | Address | Purpose |
|---|---|---|
| **AttesterNFT** | [`0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb`](https://basescan.org/address/0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb) | Soulbound NFT for "culture committee" members. Only holders can *propose* in the DAO. Owned by the Timelock; thresholds are governance-mutable. |
| **CitizenNFT** | [`0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB`](https://basescan.org/address/0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB) | Soulbound ERC721Votes NFT for verified citizens. 1 NFT = 1 vote (used by MACI signup gating). Owned by the Timelock; both attestation and revocation thresholds are governance-mutable. |
| **SignUpTokenGatekeeper** | [`0xcf12E8da5f7599dd9162e07388715bBa11739F2e`](https://basescan.org/address/0xcf12E8da5f7599dd9162e07388715bBa11739F2e) | MACI v2 gatekeeper bound to CitizenNFT — enforces "only citizens can sign up to vote". |
| **MaciAttesterGovernor** | [`0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177`](https://basescan.org/address/0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177) | OpenZeppelin Governor + MACI-aware `state()` override. Attesters propose, Citizens vote via encrypted MACI ballots, the coordinator submits a ZK tally proof, proposals execute through the Timelock. Quorum/coordinator are all governance-mutable. |
| **TimelockController** | [`0xe8B8149F9373a56F55112e5Fc867E58308D014c1`](https://basescan.org/address/0xe8B8149F9373a56F55112e5Fc867E58308D014c1) | OpenZeppelin `TimelockController` with `minDelay = 3600` (1h) for the initial test phase. Raise to 1 week via a governance proposal calling `timelock.updateDelay(604800)`. |

Source files: [`AttesterNFT.sol`](contracts/governor-contract/contracts/verification-system/AttesterNFT.sol), [`CitizenNFT.sol`](contracts/governor-contract/contracts/verification-system/CitizenNFT.sol), [`MaciAttesterGovernor.sol`](contracts/governor-contract/contracts/verification-system/MaciAttesterGovernor.sol). Address source of truth: [`packages/blockchain/src/index.ts`](packages/blockchain/src/index.ts) and [`deployments/base.json`](contracts/governor-contract/deployments/base.json).

### Governance rules (current)

| Rule | Value |
|---|---|
| Become an Attester | 2 existing Attesters approve your evidence request (mutable via `AttesterNFT.setRequiredSignatures()`) |
| Become a Citizen | 1 Attester + 1 Citizen approve your evidence request (mutable via `CitizenNFT.setAttestationRequirements()`) |
| Revoke a Citizen | **1 Attester + 1 Citizen signature** (mutable via `CitizenNFT.setRevocationRequirements()`) |
| Revoke an Attester | 2 Attester signatures (mutable via `AttesterNFT.setRequiredSignatures()`) |
| Reject a request | Multi-sig with the same role thresholds as approval — a single rogue signer cannot veto. Mutable via the `set…Rejections` setters. |
| Who can propose | Anyone holding an Attester NFT |
| Who can vote | Anyone holding a Citizen NFT, via encrypted MACI v2 ballots |
| Voting period | 604,800 s (7 days) |
| Quorum | `max(10% of MACI signups, 2)` — both terms mutable via `Governor.setQuorumPercentage()` / `setQuorumAbsolute()` |
| Tally grace period | 7 days for the coordinator to publish the ZK tally proof; mutable via `Governor.setTallyGracePeriod()` |
| Timelock delay | 3,600 s (1 h) test setting — raise to 1 week with a `timelock.updateDelay(604800)` governance proposal |
| Coordinator key rotation | Rotate via `Governor.setCoordinator()` / `setCoordinatorPubKey()` — both Timelock-gated |

The "2 unique signers" rule means a wallet holding *both* an Attester and Citizen NFT cannot single-handedly attest or revoke: the `signAsAttester` parameter on `approveRequest` / `rejectRequest` forces an explicit role choice, and `msg.sender != req.target` prevents self-approval.

All threshold values above are stored as state variables on the deployed contracts and writable only by the Timelock — so any of them can be tuned by a single governance proposal, no redeploy needed. See [`docs/MACI_E_GOVERNANCE.md`](docs/MACI_E_GOVERNANCE.md) for the full list of governance-tunable settings.

### How to become an Attester

1. Call `AttesterNFT.createAttestationRequest(evidenceURI)` with an IPFS link to your supporting evidence.
2. Two existing Attesters each call `AttesterNFT.approveRequest(requestId)`.
3. The second approval auto-mints your soulbound Attester NFT.

Bootstrap: three founding Attesters were minted directly in the constructor at deployment.

### How to become a Citizen

1. Call `CitizenNFT.createAttestationRequest(evidenceURI)` with IPFS evidence.
2. One existing Attester calls `CitizenNFT.approveRequest(requestId, signAsAttester = true)`.
3. One existing Citizen calls `CitizenNFT.approveRequest(requestId, signAsAttester = false)`.
4. Once both signatures are in and the two signers are distinct, the CitizenNFT auto-mints and voting power auto-delegates to you.

Bootstrap: three founding Citizens were minted directly in the constructor at deployment.

### How to create and execute a proposal

1. As an Attester, call `MaciAttesterGovernor.propose(targets, values, calldatas, description)`. The Governor automatically deploys a fresh MACI Poll for this proposal.
2. The proposal enters the `Active` state immediately (MACI v2 has no voting delay). Citizens vote by submitting **encrypted MACI ballots** to the per-proposal Poll contract — `Governor.castVote` is disabled (reverts with `VotingHappensOnMaciPoll`).
3. After the 7-day voting period, the coordinator (Fly machine wallet `0x5e6528…D4cF`) decrypts ballots off-chain, generates a Groth16 tally proof, and posts it to the per-poll Tally contract. The `Governor.state()` override holds the proposal in `Active` for up to a 7-day grace period until the tally lands on chain.
4. Once `Tally.totalTallyResults() > 0`, the proposal resolves to `Succeeded` if `forVotes > againstVotes` and `totalSpent ≥ quorum`, otherwise `Defeated`.
5. Any wallet calls `Governor.queue(…)` to move a Succeeded proposal into the Timelock.
6. After the Timelock delay (currently 1 h), anyone calls `Governor.execute(…)` to run the proposal's calldata.

---

## Contract Migration History

### 2026-05-23 — Governance-mutable thresholds + symmetric revocation (current)

A pre-deploy audit found that **a single Attester could unilaterally revoke any CitizenNFT** (the old `REQUIRED_REVOCATION_SIGNATURES = 1` constant), plus three other safety / scalability issues. All four were fixed in a single coordinated redeploy.

| Change | Before | After |
|---|---|---|
| Revoke a Citizen | 1 Attester signature | **1 Attester + 1 Citizen** (symmetric with attestation) |
| Threshold tuning | `public constant` — required full contract redeploy + migration | All thresholds are `owner()`-mutable state vars; one Timelock proposal can change them |
| Rejection veto | Single rejection auto-flipped status to `Rejected` (any one rogue signer could spam-veto) | Multi-sig rejection: needs the same per-role thresholds as approval |
| `tokenOfOwnerByIndex` lookup | O(N) scan over every minted token id; revocation gas grew with mint history | O(1) `mapping(address => uint256) _tokenIdByOwner` |
| Governor quorum / coordinator | `immutable` after deploy — compromised coordinator = full redeploy | 5 new `onlyGovernance` setters: `setQuorumPercentage`, `setQuorumAbsolute`, `setTallyGracePeriod`, `setCoordinator`, `setCoordinatorPubKey` |
| Timelock min delay | 2 days | 1 hour (test setting; raise to 1 week via `timelock.updateDelay(604800)` proposal) |

Five contracts redeployed; existing MACI core / Verifier / VkRegistry / Poseidon stack reused. Both NFTs are owned by the new Timelock; the new Governor holds `PROPOSER_ROLE` + `CANCELLER_ROLE` on the new Timelock; deployer `DEFAULT_ADMIN_ROLE` was renounced post-wire (asserted on chain). Re-runnable deploy + recovery + verify scripts live in [`contracts/governor-contract/scripts/`](contracts/governor-contract/scripts/): `redeploy-verification.cjs`, `finish-redeploy-rewire.cjs`, `verify-redeploy.cjs`. Commits `08bd7e7` + `3236290`.

### Pre-2026-05 rotations (kept on chain for historical traceability)

| Contract | Address | Notes |
|---|---|---|
| AttesterNFT (pre-2026-05-23) | `0xa06F09Cb406880512326318fbC09Cdb28631DA73` | 2-sig threshold as `public constant`, no setters |
| CitizenNFT (pre-2026-05-23) | `0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7` | 1-Attester revocation rule |
| MaciAttesterGovernor (pre-2026-05-23) | `0x5983F6300bCE3D9C1336a858Bd73F259bB8330F3` | `coordinator` was `immutable`; no quorum setters |
| TimelockController (pre-2026-05-23) | `0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe` | 2-day min delay |
| SignUpTokenGatekeeper (pre-2026-05-23) | `0xbf79Fc06C304058cA77Bb718b21D183843e6c8ee` | Bound to the prior CitizenNFT |
| AttesterGovernor v1 (public-vote, deprecated) | `0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b` | Pre-MACI public-vote Governor; never deleted, no longer referenced for new proposals |
| RoebelTimelock v1 (bound to AttesterGovernor v1) | `0xed1680AFf2A4235421b209A1bf8C7f5760149cc0` | Original `minDelay = 0` Timelock |
| AttesterNFT v0 (3-sig rule) | `0x9b6cc0f9BC74E0a64f662028C4CF52e00bD35D4f` | First-ever Attester NFT |
| CitizenNFT v3 (1+2 rule) | `0x78C88B01664Df4AA2F026DA68e834B4f33a3d751` | Required 2 Citizen sigs to attest |
| AttesterGovernor v1 prototype (5-day voting) | `0x572c97329ACaCBeBA74e28E3998674E9058A095a` | First public-vote prototype |

The full rotation log (every MACI Governor + Timelock + VkRegistry rotation since 2026-05-07) is structured in [`apps/web/src/lib/maci-config.ts`](apps/web/src/lib/maci-config.ts) under `ROTATION_HISTORY`. Pre-2024 legacy contracts (HomeTownVotingNFT era) are in [`packages/blockchain/src/index.ts`](packages/blockchain/src/index.ts) under `legacyNFT` / `legacyGovernor`.

---

## Fork for Your Town

This platform is designed to be forked by any small town:

1. Fork this repository
2. Update branding (colors, fonts, mascot) in `packages/design-tokens/`
3. Deploy your own Supabase project
4. Deploy web to Vercel, build mobile with EAS
5. Deploy governance contracts on Base

See [docs/FORKING_GUIDE.md](docs/FORKING_GUIDE.md) for the full guide.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](LICENSE) — following the [Decidim](https://decidim.org/) model for open civic technology.
