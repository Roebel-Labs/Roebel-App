# The Netizen Stack — Technical Blueprint (Design)

> **Status:** DRAFT for review · 2026-07-21 · brainstorming output, not a commitment to build.
> **What this is:** the missing *technical* layer of the strategy corpus. The vision
> ([`COORDINATION_PROTOCOL_THESIS.md`](../../future-research/COORDINATION_PROTOCOL_THESIS.md)), the business arc
> ([`DECADE_STRATEGY.md`](../../future-research/DECADE_STRATEGY.md)), the legal path
> ([`LEGAL_MASTERPLAN.md`](../../future-research/LEGAL_MASTERPLAN.md)) and the prosperity engine
> ([`SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md`](../../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md)) all exist.
> This document answers the remaining question: **what is Netizen as software, which layers adopt existing
> protocols vs. build our own, and how does the Röbel app migrate onto it.**

---

## 0. The goal, restated precisely

Turn the Röbel project into a globally deployable, decentralized stack — **Netizen** — such that:

1. The entire Röbel app runs on it (Röbel = Genesis Node, the living proof).
2. Any builder, community, or ordinary person can stand up the same thing — identity, governance,
   treasury, currency, feed, mini-apps, AI — securely, without asking us.
3. It is a *protocol* in the meaningful sense: open specs, forkable software, credibly neutral,
   with Netizen Labs as maintainer/standards body/host, not owner.

## 1. The central insight — what "decentralize this" actually means here

The project is **already decentralized where it matters, and centralized where nobody sees it.**

| Axis | State today | Conclusion |
|---|---|---|
| **Trust** (who can cheat) | Identity, governance, treasury, currency all run on public Gnosis protocols: CitizenNFTv2/AttesterNFTv2, MACI + Governor + Timelock, Safe, Circles v2. Keys are Shamir-federated. | **Done. Rent it, don't rebuild it.** Credible neutrality is free on Ethereum/Gnosis. |
| **Operations** (who runs the backend) | One Supabase project, one Vercel account, two Fly apps, thirdweb infra, Cloudflare Stream — all Max's accounts. | **This is the real gap.** "Decentralized" here means *self-hostable and repeatable*, not "on-chain". |
| **Interoperability** (how communities compose) | Nothing. There is exactly one deployment and its shape lives in code + a live DB. | **This is the protocol gap.** Needs specs + a manifest + (later) a registry. |

Corollary on scale: a community backend is *small* (a town of 5,000 is a few GB of Postgres). Global
scalability is **horizontal — thousands of cheap, identical deployments — not vertical**. So the
architecture optimizes for *deployment cost and repeatability* ("deployment #2 is config, not
rewrite"), not throughput. That is Mastodon/Discourse/Decidim economics, not hyperscaler economics —
and it is exactly the Decidim adoption path the decade plan already commits to.

**Therefore: Netizen is not a new chain.** It is three things:

```
┌─────────────────────────────────────────────────────────────────┐
│  NETIZEN PROTOCOL      thin, versioned specs (NSP-0 … NSP-6)    │
│                        manifest · contract interfaces · node    │
│                        API · mini-app contract · agent charter  │
├─────────────────────────────────────────────────────────────────┤
│  NETIZEN NODE          self-hostable community backend          │
│                        (the packaged Supabase layer + chain     │
│                        indexer + coordinator + AI gateway)      │
├─────────────────────────────────────────────────────────────────┤
│  NETIZEN SDK + APPS    @netizen-labs/* client packages,         │
│                        white-label Expo/web apps, mini-app      │
│                        platform, reference contracts            │
└─────────────────────────────────────────────────────────────────┘
        anchored to existing trust rails: Gnosis · Safe · MACI ·
        Circles · XMTP · ERC-4337  (adopted, never rebuilt)
```

Plus **Netizen Cloud** — managed node hosting — as the business (the Discourse/Ghost/Supabase
model: open core, paid convenience). Röbel App = reference deployment #1.

## 2. Approaches considered

**A. Appchain / protocol-first ("Netizen Chain", own L2 + own protocols).** Maximum sovereignty
narrative; but a rollup is a permanent ops burden, fragments liquidity/trust away from Gnosis
(where Circles *must* live), and rebuilds credible neutrality we already get for free. The decade
strategy explicitly stays above the chain layer. **Rejected for now** — kept open by making every
spec chain-agnostic (`chainId` lives in the manifest), so a future migration is a manifest change,
not an architecture change.

**B. Thin protocol + community node (recommended).** Adopt the trust rails wholesale; spec the
boundaries (manifest, contract interfaces, node API, mini-app contract, agent charter); package the
existing backend as a deployable node; extract clients into SDKs; federate only once ≥2 real nodes
exist. Decidim's adoption model × Discourse's one-node-per-community economics × Farcaster's
SDK/spec discipline × Safe/MACI/Circles as trust layer. **This document details approach B.**

**C. Adopt a big existing data protocol (AT Protocol / Farcaster) for the data layer.** Instant
"decentralized" credibility and global interop. But ATProto is architected around *personal* data
servers plus a *global public* firehose; civic reality is community-scoped, largely private,
GDPR-erasable, org-structured data — a poor fit, and it couples the roadmap to Bluesky PBC.
Farcaster's snapchain is public-broadcast-only. **Rejected as foundation; adopted as pattern
source** (DID-addressed accounts, signed manifests, lexicon-style schemas, mini-app shape — the
miniapp-sdk is already deliberately Farcaster-shaped).

*(Anti-goal D, named so we don't drift into it: quietly becoming a multi-tenant SaaS on the current
Supabase project. Fastest business, but it abandons the sovereignty goal that is the entire point.)*

## 3. Layer-by-layer: adopt vs. build

The six-layer coordination stack from the thesis, made concrete. **Bold** = where Netizen's own
engineering goes. The rule everywhere: *adopt the cryptography and the rails; build the opinionated
integration, the packaging, and the specs.*

| # | Layer | Adopt (existing protocol/standard) | **Build (Netizen's own)** | Explicitly do NOT build |
|---|---|---|---|---|
| L0 | Settlement | Gnosis Chain, ERC-4337 (+ EIP-7702 later), EIP-1271 | thin infra abstraction so bundler/paymaster/wallet vendors are swappable (thirdweb is today's SPOF, not a spec) | a chain, a bundler, a wallet |
| L1 | Identity & membership | smart accounts, SIWE (EIP-4361) for node auth, Semaphore, eIDAS 2.0 EUDI VCs as future admission input, did:pkh for cross-node identity | **`INetizenMembership` interface** generalizing CitizenNFT/AttesterNFT (member/attester roles, swappable admission policy: social attestation · VC-gated · token-gated · allowlist); attestation ceremony UX | global personhood — *personhood is a policy, not a protocol*; communities choose their proof, Netizen consumes it |
| L2 | Governance | MACI, OZ Governor, timelocks | **governance config schema** (weighting: 1p1v/quadratic/token · privacy: MACI/public · execution: timelock/Safe); **Coordinator Service as a product** — the Shamir 3-of-5 tally-session server is genuinely unique infra nobody ships | new voting cryptography |
| L3 | Treasury | Safe, Zodiac (Roles Modifier, Delay), Monerium/Stripe rails, Gnosis Pay | **Fiscal Constitution modules**: constitutional splitter (50/30/20), epoch dividend distributor, **scoped agent budgets** (Zodiac Roles templates + audit indexer), donation router (RBL codes — exists) | banking, custody-for-others, payment rails |
| L4 | Value | Circles v2 group currencies, EURe/USDC, x402 | group-currency lifecycle tooling: create/trust-gate (auto-invite worker exists — productize), redemption policy, merchant tools | a stablecoin, an exchange |
| L5 | **Data & social** | Postgres, PostgREST/Realtime (Supabase OSS), ideas from ATProto (signed manifests, schema discipline) | **THE NETIZEN NODE** — see §4. The community data server: feed, orgs, events, news, points, notifications, mini-app registry, conversation registry | a novel decentralized database; local-first sync (YAGNI at town scale) |
| L6 | Messaging | XMTP v3/MLS (E2E personal), node realtime as org/support rail (dual-rail exists) | conversation-registry spec so the dual-rail is reproducible | a messaging protocol |
| L7 | Intelligence | model APIs + open weights behind a router (LiteLLM tiers per the sovereign-AI doc), **MCP as the tool bus** (server exists), x402 agent payments; watch ERC-8004 for agent identity/reputation | **AI gateway** in the node (sovereignty-tier routing, per-member quotas = Intelligence Dividend metering, audit log); **Agent Charter** — agents as members: registered identity + Zodiac-scoped budget + mandatory audit trail + governance kill switch; Mecky as the configurable reference community agent | models, agent frameworks |
| L8 | Interface & distribution | web/Expo platforms, WebView/iframe sandboxing | **white-label apps** driven by the community manifest (branding, modules on/off); **mini-app platform** (SDK, store, AI builder, MCP publishing) formalized as spec — this is Netizen's app-store moat and it already exists | app stores of our own beyond the mini-app registry |

Two build-items deserve emphasis because *nobody else ships them* and they fall straight out of
what already runs in production:

- **The Fiscal Constitution layer (L3)** — "money with a constitution": identity-gated,
  MACI-governed, rule-split, timelocked, with scoped auditable *agent* budgets. The decade plan
  already identifies this as Product B; in stack terms it is a Zodiac module set + an indexer + a
  dashboard, all generalized from the live Gemeinschaftskasse.
- **The Coordinator Service (L2)** — threshold-key private-vote tallying as deployable software.
  Every other MACI deployment on earth has the single-coordinator-key problem this repo already
  solved with the Shamir federation.

## 4. The Netizen Node

One node = one community's sovereign backend. What today is "Max's Supabase project + edge
functions + two Fly workers" becomes a versioned, deployable distribution:

**Services inside a node** (v0 = packaged from what exists, not rewritten):

1. **Postgres + API + Realtime + Storage** — v0 engine is the open-source Supabase stack
   (managed cloud *or* self-hosted; both are instances of the same migrations). The **Node API
   spec (NSP-4) is the contract; Supabase is an implementation detail** behind it, swappable later.
2. **Auth = SIWE** (wallet-native, EIP-1271-aware for smart accounts) issuing node JWTs — replaces
   both Supabase Auth coupling and the `x-wallet-address` MVP auth flagged as tech debt.
3. **Chain indexer** — watches the community's four contracts + Circles group; feeds
   `citizen-registry`-style self-healing views (pattern already live for `is_verified_citizen` drift).
4. **Functions runtime** — today's ~14 edge functions, versioned in the distribution.
5. **Coordinator service** — MACI tally sessions (Shamir share submission, reconstruction, proofs);
   optional per node, or rented from a shared coordinator (small communities shouldn't need to run ZK infra).
6. **AI gateway** — model router with sovereignty tiers, per-member quotas, audit log; hosts the
   community agent (Mecky) and the MCP endpoint.
7. **Media** — pluggable (Cloudflare Stream today; storage-backed fallback for full self-host).
8. **Push/notifications hub** — the existing `notifications`-table + trigger architecture.

**Tenancy model (decided):** *hybrid.* One node hosts one **community** plus its **org mesh** — the
schema already models Vereine/orgs as tenants inside Röbel's node, and the decade plan's H1 target
("onboard 3–5 Röbel Vereine") maps to *tenants*, not new nodes. A new **town/major community** gets
its **own node** (own origin, own DB, own manifest). GDPR falls out cleanly: each node's operator
is the data controller for exactly its community — locality as a compliance *feature* for the
German civic market.

**`netizen init`** — the CLI that makes "deployment #2 is config" literal: provision node
(cloud or self-host) → apply migrations → deploy or connect the four contracts → write + sign the
community manifest → hand back a running community with white-label apps pointed at it.

## 5. The Netizen Protocol — spec set v1

Numbered, versioned, markdown-first, in a public repo. Written by *describing what already runs*,
not by inventing. (Naming note: "NSP" = Netizen Stack Proposal; NIP/NEP are taken by Nostr/NEAR.)

| Spec | Name | Content | Source today |
|---|---|---|---|
| NSP-0 | **Community Manifest** | one signed JSON doc = the community: id, `chainId`, four contract addresses, node endpoints, admission/governance/treasury policies, branding, module flags. The unit of forkability — the DNS record of a community. Later anchored in an on-chain **CommunityRegistry** on Gnosis (discovery, federation root). | `packages/blockchain/src/index.ts` + `deployments/*.json` + scattered env |
| NSP-1 | Membership interface | `INetizenMembership` + admission-policy registry; attester semantics; revocation | CitizenNFTv2 / AttesterNFTv2 |
| NSP-2 | Governance config | weighting · privacy · execution matrix; coordinator interface incl. threshold-key ceremony | MaciAttesterGovernor + Shamir runbook |
| NSP-3 | Fiscal Constitution | splits, timelock, dividend epochs, **agent budget scopes** (Zodiac Roles policy format + audit events) | Gemeinschaftskasse + 50/30/20 design |
| NSP-4 | Node API | SIWE auth handshake; REST + realtime surface the SDK/apps/mini-apps consume; versioning | today's implicit Supabase/API-route surface |
| NSP-5 | Mini-app contract | postMessage bridge (`{netizen:1,…}`), manifest, ready/splash, rewards, CMS, notifications, subdomain serving | `packages/miniapp-sdk` + docs — de-facto spec, needs formalizing |
| NSP-6 | Agent Charter | agent identity registration, scope grant, audit-trail requirements, kill switch, x402 payment bounds | scoped-agent-budget experiment (decade plan H1) |

The protocol is *deliberately thin*. Everything else — UI, AI models, media, hosting — is
implementation, competitive and swappable.

## 6. Repo & package architecture

**Stay in the Röbel monorepo through Phase 1** (premature repo splits kill momentum; the repo is
already public AGPL). Extraction inside `packages/`:

```
packages/
  protocol/        NSP specs + zod schemas + TS types (manifest parsing)   [new]
  core/            @netizen-labs/core — SIWE client, node API client,
                   wallet/identity glue, points/rewards client             [extracted from apps/*/lib]
  contracts/       interfaces + reference implementations (generalized
                   from governor-contract) + deploy factory               [refactor of contracts/]
  node/            the distribution: versioned migrations, RLS, edge
                   functions, seeds, indexer, `netizen init` CLI          [new — packaged from live Supabase]
  miniapp-sdk/     stays (already @netizen-labs/miniapp-sdk on npm)
  blockchain/      dissolves into protocol/ + core/ over time
```

Apps (`apps/expo`, `apps/web`) become **consumers** of these packages — the white-label references.
Split `netizen-*` packages into their own repo only when the first *external* deployment needs it.

**Licensing:** node/apps AGPL-3.0 (inherited, and correct for the anti-extraction stance);
specs + SDKs MIT or Apache-2.0 (adoption must be frictionless). Protocol governance: Netizen Labs
maintains; hand spec stewardship to the e.V./foundation when it exists — the corpus's unsolved
neutrality question gets a structural answer there.

## 7. Migration plan — strangler fig, every phase ships Röbel value

Hard rule: **never pause the Röbel app to build infrastructure.** Each extraction rides on
something Röbel needs anyway; the app is the forcing function and the proof.

| Phase | What | Röbel value shipped (the forcing function) | Exit test |
|---|---|---|---|
| **0. Specs + inventory** (weeks) | Draft NSP-0/4/5 by describing what runs. Dump the live Supabase schema/policies/functions into versioned migrations under `packages/node`. | **The live DB schema finally lives in git** — today it has drifted from the repo and is a real single point of failure. | A fresh Supabase project stood up from migrations serves the app in staging. |
| **1. Core extraction** | `@netizen-labs/core` (SIWE auth, typed node-API client generated from schema), apps consume packages. | kills `x-wallet-address` MVP auth; deduplicates web/expo lib code; first *typed* API client (chips at the ~431-error untyped-Supabase debt). | Both apps run entirely through `core`; no direct Supabase-client scatter. |
| **2. Deployment #2** | `netizen init` v0. Two instances: (a) a Röbel Verein as *tenant* (org mesh — decade plan H1), (b) one clean-room second *node* (e.g. a demo town / Sommercamp community). | Verein onboarding is a committed H1 goal anyway — the mesh test and the platform test are the same work. | Second node stood up from manifest + CLI only — config, not code. |
| **3. Contracts generalized** | interfaces per NSP-1/2/3, deploy factory, CommunityRegistry on Gnosis; Fiscal Constitution modules (splitter, agent budgets). | 50/30/20 on-chain + first scoped-agent budget = decade-plan next-90-days items 2–3. | A new community deploys its full contract set in one guided flow. |
| **4. Federation + Cloud** | cross-node identity (manifest lookup + SIWE), shared mini-app store, inter-community Circles settlement; **Netizen Cloud** managed hosting. | Röbel's mini-app store gains reach; hosting revenue funds maintenance. | Two nodes interoperate: a member of one is verifiable at the other; a mini-app ships once, runs on both. |

Gating (imported from the decade plan's kill conditions): **if Röbel's own Vereine won't adopt in
Phase 2, stop generalizing** — the platform has no proof and further extraction is vanity
engineering. Phases 0–1 are justified regardless (schema-in-git, typed client, SIWE are pure debt
paydown for Röbel itself).

## 8. Risks & honest limits

- **N=1 platformization** is the top risk — mitigated by the forcing-function rule and the Phase-2 gate.
- **Vendor SPOFs persist in v0** (thirdweb, Supabase cloud, Vercel, Cloudflare). Answer: specs
  abstract them; self-host paths exist; replacement is deferred, not denied.
- **Coordinator ops are heavy** for small communities → governance tiers (public Governor votes for
  low stakes, MACI where it matters) + coordinator-as-a-service.
- **Not everything decentralizes**: push (Apple/Google), app-store distribution, fiat rails, legal
  wrappers. The protocol is the OS; the e.V./eG/GmbH remains the jurisdictional wrapper (thesis limit, upheld).
- **Standards drift**: eIDAS 2.0 wallets, ERC-8004, MACI v3, EIP-7702 all move — the manifest/spec
  versioning is what lets the stack track them without breaking deployments.
- Everything legal remains gated by the Legal Masterplan rule: Fachanwalt + Steuerberater before
  real-money phases.

## 9. Open decisions for Max

1. **Naming surface:** "Netizen Protocol / Node / SDK / Cloud" as used here — confirm, or bless an
   alternative ("Netizen Stack" as umbrella brand)?
2. **Spec home:** new public repo `netizen-protocol` from day one (visibility, credible neutrality)
   vs. `packages/protocol` in the monorepo until Phase 2 (this doc assumes the latter)?
3. **Phase-2 second node candidate:** demo/Sommercamp community vs. waiting for a real second town?
4. **SDK licensing:** MIT vs. Apache-2.0 for specs + SDKs (node stays AGPL)?
5. **Coordinator-as-a-service posture:** run one shared coordinator for all early nodes (pragmatic,
   centralizing) vs. per-node from the start (pure, heavy)?

## 10. Decision log

- **2026-07-22 — Vendor-independence research completed.** The adopt-vs-build table in §3 is now
  backed by an adversarially verified research report:
  [`docs/future-research/2026-07-22_NETIZEN_SOVEREIGN_STACK_RESEARCH.md`](../../future-research/2026-07-22_NETIZEN_SOVEREIGN_STACK_RESEARCH.md).
  Headline confirmations: thirdweb is replaceable vendor-free (Safe + passkey module +
  react-native-passkeys PRF + Alto/Voltaire + self-run paymaster; Gnosis has EIP-7702 since
  2025-04 and native P-256 since 2026-04); every MPC/TSS vendor route failed the openness test;
  Semaphore v4 is canonically live on Gnosis; EAS is not; MACI v3 (2026-06) is the upgrade
  candidate pending audit/migration answers; sovereign-AI entry costs €232–€1,197/mo net on
  Hetzner behind self-hosted LiteLLM; sovereign data adopts the compute-to-data pattern (Ocean
  Node plumbing, never the OCEAN token).

- **2026-07-21 — Safe infrastructure: use, don't self-host (Max).** Netizen builds on Safe's
  trusted hosted infrastructure (transaction service, client gateway, official deployments) rather
  than running its own. Netizen's contribution at this layer is **scaling it and owning the UX** in
  our own products and services (Gemeinschaftskasse dashboard, Fiscal Constitution modules, agent
  budget tooling) — plus upstream contributions where Safe's infra needs them. Self-hosting
  `safe-transaction-service` stays a *documented fallback only*, kept warm as a vendor-risk hedge
  (Safe's client-gateway uses a time-delayed license — terms can shift), not a roadmap item.

---

*Next step after approval: superpowers writing-plans for Phase 0 (spec drafts + schema inventory) —
deliberately small, pure debt-paydown for Röbel, no new surface area.*
