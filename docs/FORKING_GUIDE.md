# Forking Guide — Bring This to Your Town

The Roebel App is built as a **replicable blueprint**: a small town of ~5,000 people running verified digital identity, private on-chain voting, and its own community currency. Everything here is open source (AGPL-3.0) and designed to be forked.

This guide walks you through what it takes to stand up the stack for your own community. It is honest about effort: this is not a one-command deploy (yet). If you seriously want to fork this for your town, **open a GitHub Discussion first** — we will actively help you.

## What You Get

| Pillar | What it is | Powered by |
|--------|-----------|------------|
| **Identity** | Soulbound citizen + attester NFTs with Sybil-resistant, scale-aware attestation thresholds | Custom contracts (OpenZeppelin), Gnosis Chain |
| **Governance** | Proposals + privacy-preserving encrypted voting with ZK-verified tallies | MACI v2, Governor + Timelock |
| **Currency** | A collateral-backed community group currency with an on-chain trust graph | Circles v2 |
| **Apps** | iOS/Android app + website + admin dashboards, with an AI assistant | Expo, Next.js, Supabase, Claude |

Users never see wallets, gas, or seed phrases — smart accounts (ERC-4337) make Web3 invisible.

## What You Need

**Organizationally** (this matters more than the tech):

- A committed local partner — a town administration, citizens' association (Verein), or similar
- A small trusted committee to act as **attesters** (we use 5; they verify residents and jointly guard the vote-decryption key, 3-of-5)
- A process for verifying residency (in-person verification works fine at small scale)

**Technically:**

- One developer comfortable with TypeScript and willing to learn some Web3 tooling
- Accounts: [Supabase](https://supabase.com) (free tier is fine to start), [thirdweb](https://thirdweb.com), [Vercel](https://vercel.com), [Expo/EAS](https://expo.dev), Anthropic API (for the AI assistant)
- A small amount of xDAI on Gnosis Chain for contract deployment (a few euros)

## Step 0 — Fork and Rename

1. Fork this repository
2. Global-replace the town branding: app names in [apps/expo/app.config.ts](../apps/expo/app.config.ts) (the live Expo config — `app.json` is ignored), web metadata in `apps/web/src/app/layout.tsx`
3. Swap the design tokens in [packages/design-tokens/](../packages/design-tokens/) — primary color, fonts. Röbel uses navy `#00498B` from its coat of arms; use your town's identity
4. Replace icons/splash assets (`apps/web/public/`, `apps/expo/assets/`)
5. Rename or rebrand the mascot — "Mecky" (a heron) is Röbel's AI assistant; give yours a local personality in the Mecky prompt files

## Step 1 — Backend (Supabase)

1. Create a Supabase project
2. Apply the migrations in [supabase/migrations/](../supabase/migrations/)
3. Deploy the Edge Functions in [apps/expo/supabase/functions/](../apps/expo/supabase/functions/)
4. Copy `.env.example` → `.env.local` / `.env` in both apps and fill in your Supabase URL + anon key

This alone gets you a working "town app" (feed, events, orgs, messaging, AI assistant) with **no blockchain at all**. That is a perfectly valid v1 — Röbel ran this way first.

## Step 2 — Identity Contracts

When you are ready for verified civic identity:

1. Deploy `AttesterNFTv2` and `CitizenNFTv2` from [contracts/governor-contract/](../contracts/governor-contract/) (Hardhat; `npx hardhat compile`, deploy via thirdweb or a script)
2. Mint attester NFTs to your committee via the migration-mint path, then finalize
3. Configure the attestation thresholds — they are percentage-band based and scale with community size (see the [Sybil-hardening design doc](superpowers/plans/2026-06-24-gnosis-consolidation-and-sybil-hardening.md))
4. Put NFT ownership behind a Gnosis Safe owned by your attesters
5. Update the addresses in [packages/blockchain/src/index.ts](../packages/blockchain/src/index.ts) — this file is the **single source of truth** both apps read

We deployed on **Gnosis Chain** (cheap, stable, EU-aligned, and home of Circles). The contracts are standard EVM — any chain works, but Circles (Step 4) requires Gnosis.

## Step 3 — Governance (start simple!)

Two tiers, in increasing complexity:

1. **Public voting** — deploy the plain Governor + Timelock. Votes are on-chain and public (like most DAOs). Simple, robust, no coordinator needed. **Start here.**
2. **Private voting (MACI)** — encrypted ballots, ZK-verified tallies, and a coordinator key that is Shamir-split 3-of-5 across your attesters so no single person can decrypt votes. This is the most operationally complex part of the whole stack. Read, in order:
   - [MACI_E_GOVERNANCE.md](MACI_E_GOVERNANCE.md) — the full architecture (note: its example addresses predate our Gnosis move; mechanisms are current)
   - [SHAMIR_CEREMONY.md](SHAMIR_CEREMONY.md) — the key-splitting ceremony
   - [MACI_SHAMIR_OPERATIONS.md](MACI_SHAMIR_OPERATIONS.md) — the operational runbook, including §10, the production lessons we learned so you don't have to

Do not attempt MACI before public voting works end-to-end for your community.

## Step 4 — Community Currency (optional)

Röbel Münzen is a [Circles v2](https://aboutcircles.com) group currency gated on the CitizenNFT: only verified residents can mint, and every holder is visible in an on-chain trust graph.

- Requires Gnosis Chain
- Read [CIRCLES_ROEBEL_MUENZEN_STATE.md](CIRCLES_ROEBEL_MUENZEN_STATE.md) (canonical state + gotchas) and [CIRCLES_TOKENOMICS.md](CIRCLES_TOKENOMICS.md) first
- You will create a Circles group, set its membership condition to your CitizenNFT, and wire the group address into the apps' env

In the UI, never expose Circles/CRC jargon — name the currency after your town.

## Step 5 — Ship the Apps

- **Web**: deploy `apps/web` to Vercel (or any Next.js host). Watch the env list in `apps/web/.env.example`
- **Mobile**: build with EAS (`eas build`). Icon/splash/plugins live in `app.config.ts` and bake at build time
- OTA updates for JS-only changes ship via EAS Update (see [CONTRIBUTING.md](../CONTRIBUTING.md) → CI/CD)

## Step 6 — Language

All UI text is currently **German, inline in the components** (no i18n framework yet). For a non-German fork you will need to translate strings as you encounter them. An extraction into a proper i18n layer is a welcome contribution — if you start a fork in another language, coordinate with us in a Discussion so the work benefits everyone.

## Launch Checklist

- [ ] App boots against your own Supabase (no blockchain) — feed, events, messaging work
- [ ] Attester committee formed; attester NFTs minted and finalized behind a Safe
- [ ] Residents can get verified in the app and receive their CitizenNFT
- [ ] A test proposal runs end-to-end: propose → vote → tally → execute
- [ ] (If MACI) Shamir ceremony completed; a test poll tallied by 3 attesters
- [ ] (If Circles) group live, first residents minting
- [ ] `.env` secrets nowhere in git; deployment manifests updated

## Known Gaps (honesty section)

- No one-command bootstrap script — deployment is guided-manual. The manifests in `contracts/governor-contract/deployments/` show exactly what a complete deployment looks like
- Some docs in `docs/` are historical and reference superseded deployments — check [docs/README.md](README.md) for what is current
- The env surface is large (~70 vars for web); many are optional per-feature but this is not yet cleanly documented

## Getting Help

Open a [GitHub Discussion](https://github.com/Roebel-Labs/Roebel-App/discussions) or an issue. A town seriously attempting a fork gets our active support — that is the whole point of this project.
