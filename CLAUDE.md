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

### Deployed Contract Addresses (Base Mainnet)
- AttesterNFT: `0xa06F09Cb406880512326318fbC09Cdb28631DA73`
- CitizenNFT: `0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7`
- Governor (AttesterGovernor): `0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b`
- Timelock: `0xed1680AFf2A4235421b209A1bf8C7f5760149cc0`

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
