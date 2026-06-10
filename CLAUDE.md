# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

The Roebel App is an open-source civic technology platform for Roebel/Mueritz, Germany — designed as a replicable blueprint for small towns. It ships as both a mobile app (Expo/React Native) and a website (Next.js), organized as a Turborepo monorepo.

## Monorepo Structure

```
roebel/
├── apps/
│   ├── web/              # Next.js 15 website (Tailwind CSS)
│   └── expo/             # Expo SDK 55 mobile app (StyleSheet + useTheme)
├── packages/
│   ├── config/           # Shared ESLint, TypeScript configs
│   ├── blockchain/       # Shared contract ABIs, thirdweb utils
│   └── design-tokens/    # Shared color/spacing tokens
├── contracts/
│   ├── governor-contract/    # Hardhat contracts (OpenZeppelin v4.9.6)
│   └── governor-contracts-new/
├── docs/                 # Project documentation
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Commands

```bash
# Root (Turborepo)
pnpm install              # Install all dependencies
pnpm dev                  # Start all apps in dev mode
pnpm dev:web              # Start only web (Next.js)
pnpm dev:expo             # Start only expo (React Native)
pnpm build                # Build all apps
pnpm lint                 # Lint all apps

# Web app
cd apps/web
pnpm dev                  # localhost:3000
pnpm build
pnpm lint

# Expo app
cd apps/expo
pnpm start                # Expo dev server
pnpm ios                  # Run on iOS simulator
pnpm android              # Run on Android emulator

# Contracts
cd contracts/governor-contract
npx hardhat compile
npx thirdweb deploy -k YOUR_SECRET_KEY
```

## Key Architecture Decisions

### Styling (IMPORTANT)
- **Web (apps/web)**: Tailwind CSS — use utility classes
- **Expo (apps/expo)**: `StyleSheet.create()` + `useTheme()` hook — NO NativeWind
  - Token source of truth: `constants/theme.ts` (lightColors/darkColors)
  - Theme context: `context/ThemeContext.tsx`
  - A previous NativeWind migration attempt broke the app and was reverted. Do NOT attempt NativeWind migration without explicit user approval.
- **Shared tokens**: `packages/design-tokens/` — consumed differently by each app

### Blockchain
- Base L2 + Thirdweb Smart Wallets (invisible Web3)
- `inAppWallet` + `smartAccount` (gasless ERC-4337)
- Contract ABIs and addresses in `packages/blockchain/`

### Backend
- Supabase (Postgres, Auth, Realtime, Edge Functions)
- Direct messaging via Supabase Realtime (replaced XMTP)

## Smart Contracts

### Governor Contract (Hardhat — OpenZeppelin v4.9.6)

- **HomeTownVotingNFT.sol** - Soulbound ERC721 NFT (1 NFT = 1 vote)
- **SimpleHomeTownGovernor.sol** - DAO governance (public voting)
- **HomeTownMaciGovernor.sol** - MACI-integrated governance (private voting)

### Deployed Contract Addresses (Base Mainnet, clean-slate rotation 2026-06-08)
- AttesterNFT: `0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb` (governance-mutable thresholds)
- CitizenNFT: `0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB` (1 Attester + 1 Citizen for BOTH attestation and revocation; governance-mutable)
- SignUpTokenGatekeeper: `0xc767fa3bbd9f0934Fb419137d7b6506E44105f74` (FRESH — empty `registeredTokenIds`; bound to CitizenNFT + the MACI core below. Replaces `0xcf12E8da…`.)
- MACI core: `0x76e0097D2F1e0D747B3dd58622c76b278e2f587a` (deploy block 47070186; `MACI_DEPLOY_BLOCK` = 47070086)
- Governor (MaciAttesterGovernor): `0xCd3b0feEE7C7dAEf7976A46627E5a6fE310A4F91` (voting + proposals; 5 governance setters: quorumPercentage, quorumAbsolute, tallyGracePeriod, coordinator, coordinatorPubKey)
- Timelock: `0xc93032B37Fb9409996a943978fFE26852B1c4368` (1h min delay; raise via `timelock.updateDelay()` governance proposal)
- Legacy AttesterGovernor (read-only, public-vote, deprecated): `0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b`
- NOTE: AttesterNFT/CitizenNFT remain owned by the prior Timelock `0xe8B8149F9373a56F55112e5Fc867E58308D014c1`; NFT-threshold governance routes through the prior Governor `0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177`, not the current voting Governor above.

Source of truth: [`contracts/governor-contract/deployments/base.json`](contracts/governor-contract/deployments/base.json) and [`packages/blockchain/src/index.ts`](packages/blockchain/src/index.ts).

## Coordinator privacy — Shamir 3-of-5 federation (fully active 2026-06-10)

The MACI coordinator privkey is no longer a single env var on Fly. It
has been replaced with a **3-of-5 Shamir secret-sharing federation**
across 5 AttesterNFT-holder wallets. As of 2026-06-10 10:54 UTC, the
legacy `COORDINATOR_PRIV` env var has been **permanently removed**
(`fly secrets unset COORDINATOR_PRIV -a roebel-maci-coordinator`).
Decrypting any vote now requires 3-of-5 Attester cooperation. There
is no fallback.

- Conceptual deep-dive: [`docs/SHAMIR_CEREMONY.md`](docs/SHAMIR_CEREMONY.md)
- Operational runbook: [`docs/MACI_SHAMIR_OPERATIONS.md`](docs/MACI_SHAMIR_OPERATIONS.md)
- First Shamir tallies: polls 3 + 4 ran the full pipeline end-to-end
  (3 Attester shares → reconstruct → genProofs → on-chain), BUT both
  recorded **0/0/0** — every ballot was invalid because the Expo app
  encrypted votes to a hardcoded, pre-rotation coordinator pubkey
  (fixed in `4da83fd`: client now reads `Poll.coordinatorPubKey()`
  on-chain at vote time; the constant is deleted). Runbook §10.10a.
  The first poll created+voted AFTER `4da83fd` ships will be the first
  with real Shamir-tallied vote counts.

Key implications when working on coordinator code:
- All polls created after 2026-06-09 18:40 UTC (rotation execution)
  are encrypted to the Shamir-split coordinator pubkey. The legacy
  `finalize-poll.js` path is now dead — it exits 1 with `COORDINATOR_PRIV
  not set` on every invocation. `scan-and-finalize.js`'s
  `useLegacy = !!process.env.COORDINATOR_PRIV` is permanently false.
- Tallying a poll requires opening a Tally-Session via
  `/admin/dashboard/coordinator → Tally-Sessions`, then ≥3 Attesters
  submitting their decrypted shares at
  `/admin/dashboard/coordinator/tally/<pollId>`. The legacy Tally button
  has been removed from the admin Vorschläge page.
- Plaintext privkey exists only in the reconstructor child process's
  RAM for ~10 minutes per tally. Never written to disk. Zeroed after
  use. Between tallies the privkey does not exist anywhere.
- `COORDINATOR_ETH_PRIV` (the ETH-tx-signing key) stays on Fly — it
  only authorizes on-chain state transitions that ZK proofs already
  validate. Compromising it does not enable vote decryption.
- The "production lessons" section (§10) of the runbook documents the
  10 bugs caught during the end-to-end rollout (publicnode RPC null
  receipts, smart-account propose decoding via event log, ethers v6
  `Result.values` collision, manifest `Z`-vs-`+00:00`, CORS on
  submissions endpoint, orphan-session race, ERC-1271 fallback for
  submission verify, GovernorDisabledDeposit on survey proposals, etc).
  Read it before touching the coordinator scripts.

## Environment Variables

Each app has its own `.env.example` showing required variables. Copy to `.env.local` (web) or `.env` (expo) and fill in real values.

**NEVER commit real API keys.** Use environment variables and `.env.example` files with placeholder values only.

## Package Manager

This monorepo uses **pnpm** with workspaces. Do not use npm or yarn.

## Commit Convention

```
feat(web): add proposal page
fix(expo): camera permissions
docs: update forking guide
chore(deps): upgrade Expo SDK
```

## Development Notes

- All UI text in German (primary), English (secondary)
- Primary color: `#194383` (Navy, from Roebel coat of arms)
- Font: Inter family (body), Plus Jakarta Sans (headings)
- Mecky = AI chatbot mascot (Claude-powered, German language)

## Supabase — Use the Supabase MCP (mandatory)

This repo registers the Supabase MCP server at project scope in `.mcp.json`
(project ref: `wwbeqhkslxdxhktqzqti`). Every agent and contributor working in
this project MUST use the Supabase MCP for Supabase operations instead of raw
CLI calls or ad-hoc HTTP. The `supabase` CLI is intentionally not installed
in this environment.

Use the MCP for:
- Deploying / updating Edge Functions (`apps/expo/supabase/functions/*`)
- Running ad-hoc SQL or inspecting tables
- Applying or generating migrations (`supabase/migrations/*`)
- Reading function and Postgres logs
- Listing projects, buckets, secrets, branches

First-time setup per machine:
1. Confirm the server loads: `claude mcp list`
2. Authenticate (interactive OAuth, must run outside the IDE extension):
   `claude /mcp` → select `supabase` → Authenticate
3. Optional Supabase Agent Skills: `npx skills add supabase/agent-skills`

If an MCP tool is available for a given Supabase operation, prefer it over
reaching for a shell command, even if you remember the CLI invocation.
