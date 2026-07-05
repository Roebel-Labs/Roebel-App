# Security Policy

The Roebel App handles three things that must never break: **civic identity** (soulbound citizen NFTs), **private votes** (MACI-encrypted ballots), and **community money** (Röbel Münzen and the Gemeinschaftskasse treasury). We take every report seriously and appreciate the work of security researchers.

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Use one of these private channels instead:

1. **GitHub private vulnerability reporting** (preferred): [Report a vulnerability](https://github.com/Roebel-Labs/Roebel-App/security/advisories/new)
2. **Email**: max.brych03@gmail.com with `SECURITY` in the subject line

Please include: a description of the issue, steps to reproduce (or a proof of concept), the affected component, and your assessment of the impact.

### What to expect

- **Acknowledgment within 72 hours** of your report
- A status update within **7 days** with our assessment and planned next steps
- Credit in the release notes once the fix ships (unless you prefer to stay anonymous)

There is currently **no bug bounty program** — this is a volunteer-run civic project — but we will credit you and are genuinely grateful.

## Scope

In scope:

- **Smart contracts** ([contracts/](contracts/)) — identity NFTs (AttesterNFTv2, CitizenNFTv2), the MACI-aware Governor, Timelock, SignUpTokenGatekeeper, and the Circles membership condition
- **MACI coordinator infrastructure** — Shamir share handling, tally sessions, share submission endpoints, proof generation
- **Web app and admin dashboards** ([apps/web/](apps/web/)) — especially verification, treasury, and coordinator surfaces
- **Mobile app** ([apps/expo/](apps/expo/)) — especially wallet, voting, and identity flows
- **Circles mini-app** ([circles-roebel-mini-app/](circles-roebel-mini-app/))
- **Supabase Edge Functions and RLS policies** ([supabase/](supabase/), [apps/expo/supabase/functions/](apps/expo/supabase/functions/))
- Secrets handling in CI/CD workflows

We are **especially** interested in:

- Vote privacy compromises (anything that lets someone other than 3-of-5 attesters decrypt ballots)
- Identity bypass — minting a CitizenNFT without meeting the attestation thresholds (Sybil attacks)
- Unauthorized treasury movements (Gemeinschaftskasse Safe, Röbel Münzen collateral vault)
- Privilege escalation in the admin dashboards

Out of scope:

- Denial-of-service / volumetric attacks
- Vulnerabilities in third-party platforms themselves (thirdweb, Supabase, Circles protocol, MACI upstream) — please report those upstream, though we appreciate a heads-up if they affect us
- Social engineering of town residents or attesters
- Stale contract addresses in historical docs (the canonical address source of truth is [packages/blockchain/src/index.ts](packages/blockchain/src/index.ts))

## Supported Versions

Only the latest `main` branch and the currently deployed contracts are supported. The active contract set is marked in [packages/blockchain/src/index.ts](packages/blockchain/src/index.ts); older deployments listed in the manifests are archived and out of scope.

## Coordinated Disclosure

Please give us a reasonable window (90 days) to ship a fix before public disclosure. For anything touching live funds or live votes, we will treat it as an emergency and aim to move much faster than that.
