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

> 📘 **Full architecture reference:** [docs/MACI_E_GOVERNANCE.md](docs/MACI_E_GOVERNANCE.md) — canonical, current source of truth for the MACI v2 stack: live addresses on Base mainnet, identity layer (AttesterNFT + CitizenNFT), privacy layer (MACI core + Poll + MessageProcessor + Tally + VkRegistry), the off-chain coordinator + auto-finalize cron, the citizen onboarding / proposal / voting / tally flows end-to-end, the production zKey parameters, the operational runbook, and the security model.

---

## Smart Contracts & Governance

The Röbel DAO runs on four contracts on **Base Mainnet (chain id 8453)**, all soulbound/non-transferable, all verified on Blockscout + Sourcify.

### Live addresses

| Contract | Address | Purpose |
|---|---|---|
| **AttesterNFT** | [`0xa06F09Cb406880512326318fbC09Cdb28631DA73`](https://base.blockscout.com/address/0xa06F09Cb406880512326318fbC09Cdb28631DA73) | Soulbound NFT for "culture committee" members. Only holders can *propose* in the DAO. |
| **CitizenNFT** | [`0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7`](https://base.blockscout.com/address/0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7) | Soulbound ERC721Votes NFT for verified citizens. 1 NFT = 1 vote. Auto-delegates voting power on mint. |
| **AttesterGovernor** | [`0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b`](https://base.blockscout.com/address/0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b) | OpenZeppelin v5 Governor. Attesters propose, Citizens vote, proposals execute through the Timelock. |
| **RoebelTimelock** | [`0xed1680AFf2A4235421b209A1bf8C7f5760149cc0`](https://base.blockscout.com/address/0xed1680AFf2A4235421b209A1bf8C7f5760149cc0) | OpenZeppelin `TimelockController` with `minDelay = 0`. Queues and executes passed proposals; open executor, Governor-only proposer. |

Source files: [`AttesterNFT.sol`](contracts/governor-contract/contracts/verification-system/AttesterNFT.sol), [`CitizenNFT.sol`](contracts/governor-contract/contracts/verification-system/CitizenNFT.sol), [`AttesterGovernor.sol`](contracts/governor-contract/contracts/AttesterGovernor.sol).

### Governance rules (current)

| Rule | Value |
|---|---|
| Become an Attester | 2 existing Attesters approve your evidence request |
| Become a Citizen | 1 Attester + 1 Citizen approve your evidence request (2 unique signers minimum) |
| Revoke a Citizen | 1 Attester signature |
| Revoke an Attester | 2 Attester signatures |
| Who can propose | Anyone holding an Attester NFT |
| Who can vote | Anyone holding a Citizen NFT (1 NFT = 1 vote) |
| Voting delay | 1 block (~2 s on Base) |
| Voting period | 1,800 blocks (~1 hour) |
| Quorum | 10 % of delegated Citizen votes |
| Timelock delay | 0 (proposals can execute as soon as they pass) |

The "2 unique signers" rule means a wallet holding *both* an Attester and Citizen NFT cannot single-handedly mint a new Citizen: the `signAsAttester` parameter on `CitizenNFT.approveRequest` forces an explicit role choice, and `msg.sender != req.target` prevents self-approval.

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

1. As an Attester, call `AttesterGovernor.propose(targets, values, calldatas, description)`.
2. After 1 block, the proposal enters the `Active` state. Citizens vote by calling `AttesterGovernor.castVote(proposalId, support)` — `support` is `0` (against), `1` (for), or `2` (abstain).
3. After ~1 hour the voting period closes. If quorum is met (10 %) and "for" outweighs "against", the proposal enters the `Succeeded` state.
4. Any wallet calls `AttesterGovernor.queue(…)` to move the proposal into the Timelock.
5. After the Timelock delay (currently 0 s), anyone calls `AttesterGovernor.execute(…)` to run the proposal's calldata.

---

## Contract Migration History

The currently-deployed contracts above replaced an earlier trio that had tighter thresholds. The lower bar was chosen to make citizen onboarding realistic for a civic app that's still growing its verified base.

### What changed

| Rule | Before | After |
|---|---|---|
| Attester minting | 3 Attester signatures | 2 Attester signatures |
| Attester revocation | 3 Attester signatures | 2 Attester signatures |
| Citizen attestation | 1 Attester + 2 Citizens (minimum 3 unique signers) | 1 Attester + 1 Citizen (minimum 2 unique signers) |
| Citizen revocation | 3 Attester signatures | 1 Attester signature |
| Voting period | 5 days (old Governor) | 1 hour |
| Governor-token coupling | Bound to old CitizenNFT `0x78C8…` | Bound to new CitizenNFT `0xe2d3…` |

### Deployment steps taken

1. **Solidity edits** — Updated threshold constants + minimum-unique-approver logic in `AttesterNFT.sol` and `CitizenNFT.sol`; shipped in commit `2bed1dd`.
2. **AttesterNFT redeploy** — Compiled in Remix (OZ v5, optimizer 200 runs) with 3 founding Attester addresses. Deployed to `0xa06F…DA73`.
3. **CitizenNFT redeploy** — Deployed with a reference to the new AttesterNFT and the same 3 founding addresses (who also became founding Citizens). Address: `0xe2d3…b5b7`.
4. **Timelock deploy** — Thin wrapper `RoebelTimelock` around OZ `TimelockController` with `minDelay = 0`, deployer (`0x1C11…d1f9`) as sole proposer + admin, open executors (`address(0)`). Address: `0xed16…9cc0`.
5. **AttesterGovernor deploy** — OZ v5 Governor that takes both AttesterNFT and CitizenNFT in its constructor. Configured for 1-block voting delay, 1,800-block voting period (~1 hour on Base), 10 % quorum. Address: `0x84D8…2a5b`.
6. **Role wiring on the Timelock** (`0xed16…9cc0`):
   - `grantRole(PROPOSER_ROLE, 0x84D8…2a5b)` — Governor can now queue proposals.
   - `grantRole(CANCELLER_ROLE, 0x84D8…2a5b)` — Governor can cancel its own queued proposals.
   - `revokeRole(PROPOSER_ROLE, 0x1C11…d1f9)` — deployer no longer has unilateral proposer rights; only the Governor does.
7. **Client swap** — `packages/blockchain` + `apps/web` + `apps/expo` updated to point at the new contract addresses; shipped in commit `9b2299a`.

### Previous (superseded) contracts

Kept on-chain for historical traceability but no longer referenced by the apps:

| Contract | Address |
|---|---|
| AttesterNFT v1 (3-sig rule) | `0x9b6cc0f9BC74E0a64f662028C4CF52e00bD35D4f` |
| CitizenNFT v3 (1+2 rule) | `0x78C88B01664Df4AA2F026DA68e834B4f33a3d751` |
| AttesterGovernor v1 (5-day voting) | `0x572c97329ACaCBeBA74e28E3998674E9058A095a` |

Pre-2024 legacy contracts (HomeTownVotingNFT era) are listed in [packages/blockchain/src/index.ts](packages/blockchain/src/index.ts) under `legacyNFT` / `legacyGovernor`.

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
