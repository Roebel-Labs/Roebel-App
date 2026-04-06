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
| **[contracts/governor-contract](contracts/governor-contract/)** | Hardhat Smart Contracts (OpenZeppelin v4.9.6) |

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
- **Governance**: Soulbound NFT Voting + MACI Privacy-Preserving Voting
- **AI**: Claude API powering the Mecky chatbot assistant

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
