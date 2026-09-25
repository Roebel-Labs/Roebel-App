# Ortis: from the Röbel App to a multi-tenant Community OS with real-life payments

> **Research and strategy record, 2026-09-25.** Status: DRAFT for Max's review. Written against the
> live stack (read-only survey of both repos), the Netizen strategy corpus, and eight sourced research
> passes run the same day (accounts and passkeys, Stripe Connect, crowdfunding law, POS and stablecoin
> law, revenue benchmarks, multi-tenant Nostr and org infrastructure, plus two internal digests).
> Nothing here is committed product, and nothing here is legal or tax advice: every legal position
> below must go through a Steuerberater and a Rechtsanwalt before execution.
>
> **Precedence.** `netizen/netizen_labs/docs/STRATEGY.md` wins over this document. The August kickoffs
> (`docs/kickoffs/2026-08-11_*`) define the launch mechanics this document builds on; where it
> extends or contradicts them, §8 says so explicitly.
>
> **Read first:** STRATEGY.md §2, §4a, §5b, §5f, §13 · `docs/kickoffs/2026-08-11_STRATEGY_ORTIS_ONE_CLICK_COMMUNITY.md` ·
> `docs/kickoffs/2026-08-11_K1_NETIZEN_ACCOUNTS_REPLACES_THIRDWEB.md` and `K3`, `K5` ·
> `docs/future-research/2026-07-27_WALLET_SOVEREIGNTY_RESEARCH.md` · `docs/future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md` ·
> `docs/future-research/LEGAL_MASTERPLAN.md` (partial) · `docs/CIRCLES_ROEBEL_MUENZEN_STATE.md`.

---

## 0. What this document is

Max's question, paraphrased: how does the Röbel App become Ortis, a multi-tenant app scaled with Nostr
relays and onchain infrastructure and services, with many treasuries, organisation membership fully
onchain, less dependence on thirdweb (passkeys and social recovery instead of social logins), many
Circles groups with Circles as local bonus points, end-to-end crowdfunding, the full Stripe Connect
surface, and as the end goal a Kassensystem where customers pay businesses and organisations of every
kind with stablecoins, privately, all of it legally sound and scalable. And: which revenue streams let
Ortis sustain itself first and then turn profitable, B2C and B2B.

This document answers in four moves: where the stack already is (§2), the tenant model everything
hangs off (§3), each pillar with its recommended shape, legal position and cost (§4 and §5), and the
money (§6) with a gated roadmap (§7). §8 names the tensions with decisions already on record, §9
lists the research claims that must be verified before anyone relies on them, and §10 lists the
decisions only Max can take.

Two standing facts frame everything, both from STRATEGY.md and unchanged here:

1. **Röbel is the proof engine and is never a revenue line.** Ortis is the cash engine. The Röbel App
   does not get renamed; it becomes tenant #1 of Ortis, and the Röbel orgs become the first paying
   customers of Ortis modules, which STRATEGY §5g already allows through the community door.
2. **One revenue-primary bet per quarter.** The current bet is the Ortis Sign pilot. This document is
   the map, not a new build track. Everything in §7 that competes for Max's selling hours waits for
   its gate.

---

## 1. The answer on one page

### 1.1 The shape

Ortis is the Röbel stack with one level of indirection added: **a community is a manifest**, and the
app, the relay, the contracts, the identity realm, the treasury, the currency and the agent all render
from it. The August kickoffs already decided this (one `community.json` per tenant, `<slug>.ortis.app`
domains, a tenant database on a Netizen node, shared Gnosis plus the existing unowned
`CommunityRegistry`). What was missing on 2026-08-11 is still what is missing today: **the citizen app
itself is single-tenant** (265 Expo files and 325 web files mention Röbel; the database has no tenant
column anywhere). The generic layers underneath are further along than they feel: the protocol and CLI,
the contract factory and registry, the relay, index and federation, the per-community OIDC issuer, the
sovereign account service with a live paymaster, and the Stripe Connect and Gnosis Pay slices are all
either per-community already or env-driven.

Inside a community, the second level of indirection is the **organisation**: Verein, Betrieb,
Kirchengemeinde, Genossenschaft, Amt. An organisation is a Safe (its own treasury), a small set of
public officer roles onchain, a private member list, a Stripe connected account, an optional Circles
sub-group, and an agent seat. Persons are one account with many memberships, never one wallet per
community (ORTIS_KICKOFF §1b).

### 1.2 Verdict per pillar

| Pillar | Verdict in one line | Detail |
|---|---|---|
| Multi-tenant app and backend | Do it as the kickoffs say: tenant manifest, P0 config seam first, database per tenant on a node, one Ortis binary with a community picker plus a PWA per tenant | §4.1 |
| Nostr relays | Pre-seeded towns as virtual relays in one process, sovereign strfry on claim, NIP-77 mirroring gives federation for free; the record stays public | §4.2 |
| Onchain infra and services | Already the most tenant-ready layer; sell paymaster, coordinator ceremonies, relay and index hosting at usage prices; watch GIP-153 | §4.3 |
| Many treasuries | One Safe per community and per org, no Safe Transaction Service, own signature pool, Zodiac Roles only on patched builds; self-custody of an entity's own treasury needs no licence | §4.4 |
| Org membership onchain | "Fully onchain" should mean roles and proofs onchain, identities off: Hats roles on the org Safe, private member attestations, optional burnable membership NFT, Semaphore root for anonymous votes; EDPB 2026 guidelines make public member rosters a liability | §4.5 |
| thirdweb independence, passkeys, recovery | Passkey-rooted accounts are buildable on Gnosis today (P-256 precompile live since April 2026, Safe passkey stack and Candide recovery deployed); thirdweb accounts can only ever be ECDSA-owned, so the path is bridge now (keep address), opt-in re-key later; the accounts spec v2 default must be revised | §4.6 |
| Many Circles groups, bonus points | One group per town from the factory, org sub-groups only where an org wants its own token; bonus points are earned Münzen, never sold or redeemed at par; that keeps them out of e-money and MiCA offer rules | §4.7 |
| Crowdfunding end to end | Build campaigns as sales (tickets, pre-orders, Unterstützer-Beiträge) on direct charges, link out to the Sparkasse and Volksbank portals for tax-deductible donations, and decide by mid-2027 whether to become an AML obliged entity (AMLR applies 2027-07-10 to donation platforms) | §4.8 |
| Stripe Connect, full map | Keep the shipped shape (direct charges, Stripe as loss collector, org pays Stripe fees); add memberships, single-org carts, Tap to Pay, Tax for platforms; never destination or separate charges without a written opinion; DAC7 reporting once goods are sold | §4.9 |
| Ortis Kasse, private stablecoin payments | One Kasse app with a certified cloud TSE from day one (EURe is e-money, so a cashless Kasse still has Kassenfunktion), accepting card (Stripe Terminal), EURe (merchant's own Safe) and Münzen (points); privacy = per-merchant sub-accounts and stealth Safes, amounts public; never pool or convert funds in-house | §4.10 |

### 1.3 Sequence

The order that respects the gates already on record:

1. **Now to Q1 2027 (no new build track):** decision memos only (K1 slice 0 migration memo, K3
   derivation map, the passkey decision memo the accounts spec calls D10, the K5 isolation memo),
   the P0 tenant-config seam for endpoints and contracts (additive, safe, makes the 265-file problem
   visible), Stripe go-live behind the entity gate, the Prototype Fund application (window 1 Oct to
   30 Nov 2026), and the Sparkasse conversation. Ortis Sign stays the bet.
2. **2027 H1:** P0 multi-tenant app (Röbel and one throwaway tenant from one source), K5 slices 1 to 3
   (node data plane), Alto plus paymaster rendered for real, passkey accounts for new users and agents
   first, the first claimed Müritz town, org SaaS self-serve, memberships on Connect.
3. **2027 H2:** Ortis Kasse level 0 and 1 pilot with one Röbel merchant (TSE, card, EURe, Münzen
   points, e-receipt), crowdfunding-as-sales, the AMLR decision, opt-in citizen re-key to passkey
   accounts with guardians.
4. **2028 and later:** per-merchant fiat off-ramp through Monerium contracts, org sub-groups, Insight,
   Exchange, digital-euro readiness (earliest issuance 2029).

### 1.4 Money

Sustain first means the STRATEGY target: €2 to 3k MRR by mid-2027, which is roughly ten times today's
infrastructure bill and covers the token budget. Profitable means covering the founder's time, which
the benchmark pass puts at three to four paying tenants each with an Amt licence and one local sponsor.
The streams that pay, in order of euros per selling hour: an Amt or Gemeinde licence priced at
€0.60 to 1.00 per inhabitant per year (the Crossiety anchor; DorfFunk's €90 to 260 per month is the
other public benchmark), a local sponsor (Sparkasse, Volksbank, Stadtwerke, €3 to 10k per year), org
subscriptions (€9 to 49 per month, self-serve), and settlement fees on tickets, memberships and the
Kasse. B2C stays free; it is the distribution, not the revenue. Public money: Prototype Fund (up to
€158k, deadline 30 Nov 2026) and LEADER Regionalbudget MV, which funds 80 % of a €1 to 20k project and
can be applied for by the Amt or a Verein to buy an Ortis rollout. Details in §6.

---

## 2. Where the stack stands today

Verified 2026-09-25 by a read-only survey of both repositories (file references in the digest are
reproduced where they matter).

| Component | Tenant-ready | What is hard-coded to Röbel | Effort to generalise |
|---|---|---|---|
| NSP manifest, `netizen render/up/deploy/dns`, presets town/verein/genossenschaft/company | yes | example manifest only | S |
| `CommunityRegistry` `0x1c4B…` (unowned) and `community-factory.cjs` | yes | MACI ceremony constants are shared, which is fine | S |
| CitizenNFTv2 contract | partial | `ERC721("Roebel Citizen","ROEBEL-CITIZEN")` and the EIP-712 domain name are literals; every tenant's citizen NFT would be called "Roebel Citizen" | M (v3 contract plus review) |
| `packages/blockchain/src/index.ts` | no | one `CONTRACTS` set, `CHAIN_ID = 100`, no registry lookup; Expo defaults to Röbel addresses (env-overridable) | S to M |
| Wallet and auth (thirdweb) | partial | one client id and one per-domain origin allow-list per tenant; legacy accounts on EntryPoint v0.6 | L (K1) |
| Signature-derived secrets | partial | MACI key message contains "Röbel"; evidence-encryption domain frozen at chain id 8453 by design; Nostr key message already generic | M (per-tenant versioning; never change existing derivations) |
| Expo app shell (`app.config.ts`) | no | name, slug, scheme, bundle ids, about 30 deep-link hosts on `roebel.app` | M (tenant config seam) |
| Expo and web copy, branding, Mecky persona, town coordinates | no | roughly 2,300 lines mention Röbel; "Röbel Münzen"; `sdk.roebel.*` mini-app namespace | L |
| Supabase schema | no | no `community_id` or `tenant_id` anywhere; `accounts` and `account_owners` RLS is `USING (true)`; `roebel_*` tables; global `app_settings` singleton | L (K5: database per tenant) |
| Org and membership model (`accounts`, `account_owners`, `users.tier`) | partial | solid per-org structure; German civic enum types | S to M |
| Stripe Connect tickets (slice A, sandbox) | yes, per org | `webBaseUrl()` defaults to `www.roebel.app` | S |
| Gnosis Pay Konto & Karte | partial | partner ids in env; merchant registry global | M |
| Circles currency | no | group, vault, operator key and CitizenNFT hard-coded in `ADDR` and the `circles-invite` edge function | M (per-tenant group via factory and config) |
| Gemeinschaftskasse dashboard | partial | `GK_SAFE` is the Röbel Attester Safe | S |
| Röbel Card (voucher edition) | retired | whole subsystem | delete when convenient |
| Nostr relay, index, publisher, federation | yes | one relay URL constant in Expo; `index.roebel.app` in four places | S |
| Mecky and AI | partial | persona is Röbel; the Expo chat ships an Anthropic key to the client; the manifest's LiteLLM gateway is not wired | M |
| Netizen Identity keystone | yes | per-community issuer proven at `id.ortis.app`; OIDC scope still named `roebel` | S |
| Netizen Accounts (signer, Kernel v3.1, paymaster `0x11ed…` owner Attester Safe) | yes | lives in `netizen_labs`; first production gasless op landed 2026-08-15 | in place |

Two facts from the survey change plans elsewhere in this document. First, the sovereign workspace
(Nextcloud, Matrix, Buzz) that `STATE_OF_THE_NETIZEN_STACK.md` lists as live no longer runs; the node
is a relay-and-index node on a €6.53 CX23 since 2026-09-04. Second, the Ortis app in `netizen_labs`
(`apps/ortis`) is today the signatures product, built multi-tenant from day one with fail-closed
Postgres RLS keyed on `ortis.org_id`, and it deliberately uses no Supabase. That is the pattern the
civic app's backend should converge on, not the other way round.

---

## 3. The tenant model

### 3.1 Three planes, one manifest

```
Community (a place)                 Organisation (inside a place)          Person
────────────────────                ─────────────────────────────          ──────
community.json (NSP-0)              org record in tenant DB                one account, many memberships
registry record (keccak(slug))      org Safe (treasury)                    Netizen Account (smart account)
AttesterNFT, CitizenNFT, MACI,      Hats roles on the Safe (officers)      passkey or node-held signer
Timelock, Governor (factory)        private member attestations            guardians (recovery)
community Safe (Gemeinschaftskasse) Stripe connected account               Nostr key, MACI key, DM keys
Circles group (optional)            Circles sub-group (optional)           memberships as claims
identity realm (issuer per community) agent seat (Autar community door)   locale belongs to the person
virtual relay → sovereign relay     Kasse (Stripe Terminal, EURe, Münzen)
tenant database on a node           org channels on the relay
PWA at <slug>.ortis.app
```

The public plane (the record) is Nostr, mirrored into the Postgres index. The private plane (persons,
orders, messages, drafts, moderation) is the tenant database only, with RLS. K5 §3 already states why
this split is a legal requirement, not a preference: an append-only replicated log cannot satisfy
erasure, and a pseudonym is still personal data. The EDPB's final blockchain guidelines (02/2025 v2.0,
adopted 2026-07-07) confirm it and go further: public keys, wallet addresses and transaction ids are
personal data where a natural person is identifiable, hashing or encryption does not take data out of
scope, and "technical impossibility cannot justify non-compliance". Every design in §4 keeps names off
chain and puts only burnable tokens, revocable roles and Merkle roots on it.

### 3.2 The citizen app: one Ortis, many communities

Expo remains the only citizen client; the web app has no citizen users. Two forms of the same Expo
code base ship per tenant:

- **One native "Ortis" app** in both stores with a community picker on first launch, deep links per
  tenant (`<slug>.ortis.app`), theming and copy from the tenant manifest, and feature tabs from the
  preset. One store listing, one EAS project, one review queue. Röbel keeps its own native listing until
  the Ortis binary reaches parity, then Röbel's listing becomes a branded shortcut.
- **One PWA per tenant** at `<slug>.ortis.app`, generated per tenant because `manifest.json`
  `id`, `start_url` and `scope` are origin-scoped (kickoff §3a). Store-free, self-serve, installable,
  and the origin boundary doubles as tenant isolation in the browser.

The kickoff's open question "native apps versus PWA-only" (§7.5) gets this answer: PWA-only for
self-serve tenants, native through the shared Ortis binary, never a native build per tenant (each would
need its own Apple account and re-introduce the gate the whole work removes).

### 3.3 The sovereignty ladder and pre-seeding

The operator console's three doors stand: managed by Netizen, own server, adopt an existing node. All
three end at a manifest the community owns. STRATEGY §5f's pre-seeding is the growth engine: towns exist
as namespaces on shared infrastructure before anyone asks, and graduate to a sovereign relay and node
when claimed. §4.2 gives that architecture a concrete, cheap form.

---

## 4. The pillars

### 4.1 Multi-tenant app and backend

**Decided and unchanged:** tenant manifest as single source of truth; `<slug>.ortis.app`; open
self-serve operator signup behind a pluggable policy gate; database per tenant on a Netizen node (K5,
which replaced one-Supabase-project-per-tenant the same day); shared Gnosis plus the existing registry;
English routes, multilingual UI, "translate the interface, never the record".

**What the research adds:**

- *Isolation granularity.* K5 §2a is right that GoTrue is the component forcing one Supabase stack per
  tenant, and that replacing it with Netizen-issued JWTs collapses a tenant to a database, a small
  PostgREST process, RLS policies and a bucket prefix. The infrastructure pass priced the alternatives:
  a full self-hosted Supabase stack idles at 1 to 1.5 GB RAM per project, a shared-schema `tenant_id`
  design costs nothing per tenant, and Nile (free tier, unlimited tenant databases, Pro $15 per month)
  is a credible exit if RLS discipline fails. Recommendation: keep K5's database-per-tenant as the
  *sovereign* shape (it is what makes "export my community" a `pg_dump`), but measure idle RAM per
  tenant on the CX23 before promising a free tier, exactly as K5 §2a demands. If the number is bad, the
  shared cluster with one database per tenant (not one stack per tenant) is the middle path.
- *Edge functions* port by archetype (K5 §5): secret-holding proxies need only a host; privileged
  writers stay on a Deno host; chain signers move to the signer service; scheduled jobs become timer
  units. Keep every function tenant-agnostic (tenant from the JWT) so it ports one to one.
- *The P0 first task* stays the tenant-config seam for endpoints and contracts only (kickoff §8). It is
  additive, it runs under `pnpm smoke:web`, and it turns the 265-file copy problem into a diff.
- *Röbel's own migration off hosted Supabase* is a credibility question the K5 authors already raised
  (§9.3): selling node databases while the reference deployment stays on a US SaaS is a gap. Sequence it
  after tenant #2 runs on a node database, not before.

**Cost per tenant:** the infrastructure pass estimates €1 to 3 per month marginal (relay and database
share, storage, paymaster gas), so 25 towns land at €60 to 120 per month all-in, provided the platform
never runs a Safe Transaction Service or a block explorer per tenant (§4.3, §4.4).

### 4.2 Nostr relays

**Decided and unchanged:** the civic record stays public (NIP-42 read walls were rejected,
ROADMAP_AND_DEFERRED #7); writes are gated to citizens; NSP-9 federation is pull-only negentropy into a
separate mirror; relay-enforced groups (NIP-29) are deferred.

**Architecture for many towns on one small box.** strfry has no tenancy: one process is one database,
and 25 strfry processes would need 3 to 6 GB RAM, more than the CX23 has. The khatru family is
programmable per hostname, and the Zooid line (archived on GitHub 2026-04-13, continued at Coracle's
gitea and in the Unicity fork) implements exactly "virtual relays": one process, one config per tenant,
hostname-routed, roughly 0.5 to 1 GB for 25 hostnames. Recommendation:

1. One virtual-relay process on the CX23 serves `<town>.relay.ortis.app` for every pre-seeded town,
   write-gated per tenant to that town's citizen keys (the existing allow-list policy, NIP-42 AUTH for
   write proofs only; reads stay open).
2. The existing strfry stays the **archive and mirror**: `strfry router` pulls every town relay over
   NIP-77, which is also how towns federate with each other, for free.
3. A claimed town graduates to its own strfry on its own box via `netizen up`; the mirror keeps pulling
   it, so the public index never goes dark during the handover.
4. Blossom (BUD-01/02, BUD-04 mirroring) for public media only; personal media stays in deletable
   buckets on the node (K5 §4).

Per-tenant cost is a hostname and 0.3 to 1.5 GB of disk per year at civic volumes. Paid-relay market
prices (relay.tools 5,000 to 12,000 sats per month, nostr.land 60,000 sats per year) say "€5 per month
per town relay" is market-consistent as a line item inside the managed tier. No municipality or civic
public-record deployment of Nostr was found anywhere in 2026; Röbel's decision record is a first, and
that stays a differentiator worth naming in Insight.

NIP-29 groups per Verein would be the natural next step for org channels, but it re-opens a deferral
and the 2026 client survey found "real divergence" between implementations. Keep it deferred until the
Autar community door needs relay-side groups; then pin one relay implementation.

### 4.3 Onchain infrastructure and services

This is the most tenant-ready layer and the one Netizen Labs already sells in the STRATEGY ladder
(#6, usage-based, small). What exists: unowned registry, factory from presets, `netizen deploy --merge`,
a live verifying paymaster owned by the Attester Safe, Alto rendered per chain in the installer, the
Shamir 3-of-5 coordinator, the coordinator-as-a-service tier design (Tier S shared for Vereine, Tier D
dedicated for towns), x402 metering slice 1 (built, not deployed).

What to add per tenant at launch (all gas is cents on Gnosis): the factory set (Attester and Citizen
NFT, gatekeeper, MACI, Timelock, Governor), the community Safe, an optional Circles group, the registry
record with the community's Timelock as controller (Röbel's is the Attester Safe for bootstrap
reasons, to be handed over later).

What to sell, with the 2026 vendor benchmarks the pass collected:

| Service | Vendor benchmark | Ortis price posture |
|---|---|---|
| Gasless operations (bundler plus paymaster) | Pimlico PAYG about $0.0075 per op plus a 10 % paymaster surcharge; Candide Launch $399 per month | at cost plus 10 %, per tenant, budget fail-closed (already built) |
| Coordinator ceremonies (MACI tally) | PSE's coordinator service holds the key in `.env`; no vendor sells threshold tallies | per poll, Tier S or D; the Shamir flow is the product |
| Relay and index hosting | €5 to 10 per month market | inside the managed tier |
| Shared RPC | $49 per month plans (Dwellir, Chainstack, QuickNode) | resold at €5 to 10 per tenant; never run a Gnosis full node (16 GB RAM, NVMe, a €50 to 80 box, which the cost rule forbids) |
| Indexer | Envio and Ponder free or self-host | one shared instance for all tenants |
| Explorer | Blockscout Autoscout about $349 per month | never; link to the public explorer |
| Governance tooling | Safe API Growth €199 per month; Snapshot Pro crypto-only; Tally became Cactus 2026-06-17 | governance is the product; price per town, not per tool |

Watch item: **GIP-153** moved Gnosis Chain toward a ZK-proven rollup with a centralised sequencer (the
"Ethereum Economic Zone"), Phase 2 approved 2026-07-29 with a December 2026 to January 2027 target.
Tracing semantics and RPC providers may change; another reason to run nothing that depends on
`trace_filter`. The Conduit study's bring-your-own-rollup posture anticipated this; nothing in this
document depends on Gnosis staying a validator chain, and Circles stays on Gnosis regardless.

### 4.4 Many treasuries

**Shape.** One Safe per community (the Gemeinschaftskasse pattern) and one Safe per organisation, each
owned by that entity's officers. The platform is never a signer on an org Safe. The verified legal
finding stands: self-custody of an entity's *own* treasury needs no CASP or custody licence (BaFin
MiCAR Merkblatt 2025-01-03 §II.1); holding assets *for* legally separate members would raise a "für
Kunden" argument, which is exactly why each org holds its own Safe.

**Do not run the Safe Transaction Service.** On Gnosis it needs a tracing node and Safe's own
production sizing is a 4 vCPU / 16 GiB service plus 16 GiB database plus gateway, a €100+ box, exactly
what the cost rule forbids. The lighter path: Protocol Kit only (build, sign, execute), owners and
threshold read from RPC, the pending-transaction and signature pool in the tenant database (the
Gemeinschaftskasse routes `pending`, `propose`, `confirm`, `execute-encode` are already this shape),
history from Blockscout or the shared indexer, and the free Safe API Builder tier (50k calls per month)
for the rare manual check. Interoperability with Safe{Wallet} is lost, which is acceptable because Expo
is the only citizen client.

**Permissioning.** Zodiac Roles v2 for "the Kassenwart may pay up to X EURe per month to allow-listed
recipients", the Delay modifier for a citizen veto window, Hats Signer Gate v2 (§4.5) so the signer set
follows the office, Superfluid streams for recurring grants from the town Safe to org Safes. One
caution: the infrastructure pass reports a **June 2026 security advisory for Zodiac Roles v2 with
Delay 1.1.0** (exploitable when a vulnerable fallback handler is a module or role member). STRATEGY's
D1 phase leans on Roles for scoped agent budgets; use only patched releases and audit the
fallback-handler configuration before D1. This item is in §9 because two research passes describe the
incident inconsistently.

**The fiscal constitution as a module.** The 50/30/20 split with never-spend-principal stays the
Röbel ruleset that other towns fork (wealth study §5); as an Ortis module it is a preset choice on the
treasury block of the manifest, timelocked, not a platform fee. The ban on revenue plans on
Gemeinschaftskasse flows (STRATEGY §9) is untouched.

### 4.5 Organisation membership onchain

The honest reading of "fully onchain with NFTs": put **roles and proofs** onchain and keep
**identities** off. Reasons: the EDPB guidelines above; the Vereinsregister already lists officers, so
officer roles are legitimately public; a general member roster is not, and an immutable list of named
people is indefensible.

Recommended pattern, all deployed on Gnosis (bytecode checked by the pass):

| Layer | Mechanism | Public? |
|---|---|---|
| Org account | Safe 1.4.1 or 1.5.0 owned by officers | address yes, owners are pseudonymous accounts |
| Officer roles (Vorstand, Kassenwart, Schriftführer) | Hats Protocol tree per org (`0x3bc1…d137`, same address on all its chains), non-transferable ERC-1155 hats with eligibility and toggle modules; Hats Signer Gate v2 (Zodiac module and guard, audited 2024-12) lets hat wearers claim signer seats on the Safe with thresholds that follow the hat | yes, by design |
| General membership | signed membership attestation from the community issuer (the keystone already issues org-role claims), stored in the tenant database; optional **soulbound MembershipNFT** minted to the member's smart account, burnable on request, name-to-address mapping only in the database; the CitizenNFTv2 pattern (quorum attestation, revocation) is the template with the Vorstand as attesters | pseudonymous, revocable |
| Anonymous votes | a Semaphore or MACI gatekeeper Merkle root of member commitments onchain, so members vote without a public roster | root only |
| Membership across nodes | the `netizen:communities` claim from the registry (identity kickoff I4) as context, never as authorisation | claims |

Not usable on Gnosis without your own deployment: EAS (no official deployment; contracts are open
source), Aragon OSx v1.4 (not in its address list), Colony (Arbitrum only). Unlock Protocol *is* on
Gnosis (`0x1bc5…317f`) and fits expiring memberships and ticket keys; its protocol fee is DAO-set and
must be read before pricing on it. ERC-6551 is redundant once the org is a Safe.

GDPR consequence to write into the DPIA: the Verein is controller of its member data, Netizen Labs is
processor for the tenant database, and the manifest names both. Memberships as tokens are minted to
the smart account, never to a named person, and every token has a burn path the member can trigger.

### 4.6 Independence from thirdweb, passkeys, social recovery

This is where the research moved the most, and where a decision on record must be revised.

**What is already decided.** The accounts service spec v2 (approved 2026-07-31) chose a **node-held,
envelope-encrypted signer with silent signing and no passkey ceremonies**, recovery by re-login, and
passkeys as an optional later upgrade needing its own decision memo (D10). The bake-off chose ZeroDev
Kernel v3.1; Phase B shipped it in production with a live paymaster. The wallet-sovereignty research
ordered the exit from thirdweb as SDK, bundler, paymaster, accounts, custody last, and said custody
should not start in 2026 until recovery is designed and the device floor sized. K1 requires a
migration memo before any code; K3 requires a derivation map.

**What the research established (live-checked on 2026-09-25):**

- **P-256 is native on Gnosis.** EIP-7951 (P256VERIFY at `0x100`) shipped with Fusaka on Gnosis on
  2026-04-14; an `eth_call` with a fresh P-256 signature returned `1`, a tampered hash returned empty.
  A passkey signature costs about 7k gas instead of about 330k through a Solidity verifier.
- **The whole Safe passkey stack is deployed on chain 100** with bytecode present: Safe4337Module
  v0.3.0, SafeWebAuthnSignerFactory and SharedSigner v0.2.1 (precompile first, FreshCryptoLib and Daimo
  fallbacks), Safe7579 adapter and launchpad, the Rhinestone registry with SocialRecovery, WebAuthn,
  Ownable and MultiFactor modules, the Candide SocialRecoveryModule (audited by Ackee and Nethermind,
  formally verified by Certora, used for Worldcoin's Safes; 3-day and 14-day variants), Kernel v3.1
  and v3.3 with the recovery executor, EntryPoint v0.6 and v0.7. Gnosis's own wallet (the former Metri)
  is a passkey Safe on this chain, and so is Max's Circles inviter `0x1f14…`. Chain 100 is not yet in
  the official `safe-modules-deployments` registry for the Candide module, so verify the code hash or
  redeploy from source.
- **thirdweb is a wall for passkeys.** The default Account is a non-upgradeable EIP-1167 clone whose
  userOp and ERC-1271 checks are `hash.recover()`, ECDSA only, no nested ERC-1271, no modules, no
  recovery hooks. thirdweb's "passkey login" only authenticates to the enclave that holds an ECDSA
  key. The single in-place move is `addAdmin` (SDK `addAdmin` and `removeAdmin`).
- **WebAuthn cannot replace the signature-derived secrets.** MACI keys, the citizen commitment, the
  evidence-encryption key, the Nostr key and the XMTP identity all rely on deterministic ECDSA
  signatures; WebAuthn signatures are non-deterministic. PRF (the WebAuthn extension that derives a
  symmetric secret) is per-credential, so a lost passkey loses every derived key; Corbado's matrix
  (updated 2026-09-22) has PRF on iOS 18.4 and later, Android Google Password Manager, macOS 15,
  Windows Hello builds from February 2026, with older 18.x builds carrying data-loss bugs. Conclusion
  from the pass and the spec co-editor: **PRF is an enhancement, not a foundation.**
- **CitizenNFTv2 has no admin re-mint path left:** `migrationMint` is finalised, the contract is not a
  proxy, transfers revert. A new address needs either the regular attestation quorum (join = 30 % of
  attesters, floor 2, plus one citizen; revoke the old one at 67 %, floor 3) or a v3 contract with a
  dual-signed `rebind`. Circles avatars cannot move; balances can. MACI keys signups by token id, so a
  new NFT allows a new signup and the old leaf persists until the old NFT is revoked.

**Recommended design (the D10 decision memo, in outline):**

1. **Two custody tiers behind one SDK.** *Passkey tier* for citizens on capable devices: a
   passkey-rooted smart account with guardians. *Assisted tier* (the existing node-held signer with
   re-login recovery) for older devices, for people who cannot manage a passkey, and for agents, which
   have no device at all. The device floor is a product requirement, not an edge case, and the
   assisted tier is already built and live.
2. **Account implementation for the passkey tier: a decision, with a lean.** The bake-off chose Kernel
   v3.1 for the silent-signer requirement (guardians in CREATE2 init data, same address on every
   chain). For passkey citizens the pass recommends Safe 1.4.1 plus Safe4337Module plus the WebAuthn
   signer plus the Candide SocialRecoveryModule, because it is the only audited recovery with a grace
   period and owner veto, it is what Gnosis's own wallet runs on this chain, and Safe is already the
   governance root. Kernel v3 can also carry a WebAuthn validator and the Rhinestone SocialRecovery
   executor, but that module has no built-in delay. Lean: Safe stack for passkey citizens, Kernel v3.1
   stays for the assisted tier and for agents; one Alto plus one paymaster serve both (both are
   EntryPoint v0.7). The memo must cost the second account encoder in the SDK honestly.
3. **Guardians.** Two personal guardians plus the community's Attester Safe, 2-of-3, 14-day grace
   period, owner can cancel, guardian identities hashed, enrolment enforced within N days of account
   creation, a yearly recovery drill. Attestation-based recovery through the citizen contracts
   (revoke and re-attest) remains the recovery of last resort, which is what the contracts already
   imply.
4. **Root secret, not derived secret.** An app-level secret generated once, stored in Keychain or
   Keystore, wrapped by PRF where available, escrowed under a guardian-recoverable envelope
   (encrypted to the account plus guardians), with largeBlob as an iOS-only extra copy. MACI, Nostr,
   DM and evidence keys derive from that secret, versioned per tenant. K3's derivation map is the
   artefact that makes this safe; produce it before any code.
5. **One platform rpId.** Passkeys are bound to their relying-party domain forever. Use `id.ortis.app`
   (the keystone) as the single rpId so a passkey survives community renames and serves every
   membership of the person; never a per-community rpId.
6. **Migration of the roughly 52 Röbel citizens, in two steps.** *Bridge now:* generate a secp256k1
   device key (Keystore, optionally PRF-wrapped), `addAdmin(deviceKey)` from the enclave signer, then
   `removeAdmin(enclaveSigner)`. The address, the NFT, the Circles avatar, the MACI signup and every
   derived secret stay intact; thirdweb custody is gone; recovery is attester re-attestation to a new
   account. *Re-key later, opt-in:* deploy the passkey account, have the old account sign an EIP-712
   link that the new one countersigns, sweep balances (CRC over the Hub, EURe, xDAI), file an
   attestation request with the link as evidence (2 attesters plus 1 citizen at Röbel scale), revoke
   the old NFT, invite the new avatar into Circles (96 CRC from the inviter, personal mint history
   restarts), add the new identity to the existing XMTP inbox, publish a Nostr re-key note. At scale,
   ship CitizenNFTv3 with a permissionless dual-signed `rebind` and re-point the gatekeeper, Governor
   and Circles condition, which the Base-to-Gnosis runbook already rehearsed.
7. **Order of work, unchanged from the sovereignty research:** SDK and RPC, bundler, paymaster,
   accounts, custody last; agents first, citizens inherit a stack that has run in production.

**Cost.** Self-hosted Alto (safe-mode off is fine for a permissioned civic app), an own
SingletonPaymaster instance staked in the EntryPoint (the existing NetizenVerifyingPaymaster covers
this), hosted PAYG RPC: about €25 to 60 per month at 1,000 users, €150 to 500 at 50,000, versus
thousands per month at Pimlico or ZeroDev volume pricing and thirdweb's 2.5 % gas surcharge plus
$0.015 per monthly active wallet beyond the free thousand. Gas on Gnosis: a 250k-gas passkey userOp is
about 0.00006 xDAI at today's fees.

### 4.7 Circles: many groups, bonus points

**State that constrains design.** Röbel Münzen are the Röbeltaler group's token: a `BaseGroup` with a
`BaseTreasury`, which burns any group token it receives, so there is **no redemption path** and the
collateral is locked forever (verified 2026-09-13). Münzen are freely minted (24 per day per citizen,
7 % demurrage), which is why fixed-rate euro redemption was rejected as an unbounded liability, and why
the exchange spec's three rails are the epoch dividend auction (citizens), the merchant desk
(Chiemgauer model, 95 %, under the limited-network exemption) and coupons first. Invites cost the
inviter 96 raw personal CRC; the community quota path is still structurally unusable; 40 of 52
citizens have no human truster. Metri is sunset and Circles now lives inside the Gnosis App; the
`circles-inviter` mini-app depends on the Circles host, which needs a check.

**Many groups.** Circles v2 supports it natively: a group's collateral "can be personal CRC, other
group tokens, or any Circles tokens", and groups can trust groups. So: one BaseGroup per town from the
factory (membership condition = that town's CitizenNFT, service address = the auto-invite worker), a
region group that trusts town groups when towns want to interoperate, and an org sub-group only where
an org genuinely wants its own token (a "Vereinstaler" backed by the town token). The tenant flag
`circlesCurrency` stays `false` by default; the currency noun is per tenant; "CRC" never appears in any
UI. The affiliate mechanic the docs describe (2 of a member's 24 daily CRC flow to an affiliated
group) is new and worth a test before any org-group design relies on it.

**Bonus points.** The user's ask is answered without a new token: merchants *earn* Münzen by accepting
them (the merchant desk is their euro exit) and *award* Münzen from their own balance as rewards for
purchases, the Payback pattern with a community token. Legally, the POS pass is precise: a Circles
group token is not e-money (not issued against funds, no par claim, no redemption); under MiCA it is
an "other crypto-asset", and protocol-minted rewards fall under the Art. 4(3) "offered for free"
exemption as long as the operator never sells it for euros or fixes a par. VAT of points follows the
Payback rulings: granting is not a taxable event, redemption against the granting merchant's goods is
a retrospective price reduction (§17 UStG), cross-merchant reimbursement is consideration from a third
party. Three red lines: never sell Münzen for euros, never promise par, never market them as
Zahlungsmittel; the merchant desk's floating trailing-auction rate respects all three.

The lesson from every regional currency the pass looked at: Chiemgauer still runs in 2026 (347
merchants, about 974k in circulation, 5 % redemption fee), the Bristol Pound died when the council
withdrew support, Bristol Pay died for lack of funding. Never let Münzen be the P&L; they are the
loyalty layer of a Kasse that earns on cards, EURe and subscriptions.

### 4.8 Crowdfunding end to end

**Regulatory map (Germany, verified by the pass unless marked):**

| Type | Regime | Ortis structure |
|---|---|---|
| Donation to a gemeinnütziger Verein | §10b EStG, AO, BMF letter 2017-12-15 (platform as Treuhänder or Förderkörperschaft), ZAG via PSP, DSA Arts 16 and 17, AMLR from 2027-07-10 | direct charge into the Verein's own connected account; the Verein issues the Zuwendungsbestätigung; Ortis exports donor data |
| Donation to a private person or non-gemeinnützig org | ErbStG (€20,000 per donor per recipient per 10 years, §13 exemptions), UWG wording | "Unterstützung", no receipt, gift-tax notice, beneficiary KYC, 14-day hold |
| Reward pre-sale | BGB Fernabsatz (14-day Widerruf from campaign end, the *starter* must give the Belehrung), UStG (7 or 19 % on rewards, tax at payment receipt), ProdHaftG | starter is seller; all-or-nothing as pledge-then-charge at campaign end |
| Bürgerbudget and matching | KV M-V §§16 and 17 (no Bürgerhaushalt provision; results are recommendations), Zuwendungsrichtlinie, VgMinArbV M-V (Direktauftrag up to €100,000 net since 2026-03-03) | Richtlinie plus advisory Meinungsbild; the Kommune pays Vereine directly; Ortis is a SaaS Direktauftrag |
| Community-owned projects (eG, energy, village shop) | GenG, §2 Abs. 1 Nr. 1 VermAnlG (no success fee) or §2a VermAnlG (Genossenschaftsanteile added 2026-02-10), ECSP if loans or securities | link out to the eG's own subscription; no money, no fee |
| EURe and onchain | MiCA (EMT), AO (Sachspende at market value), AMLR Art. 79 | recipient-owned Safe; Ortis shows a QR only, never custodies or forwards |

Good news: the Sammlungsgesetz M-V was repealed in 2010, so no collection permit is needed; donation
and reward crowdfunding are outside the ECSP Regulation; the BaFin ZAG position is clean as long as
each party contracts separately with the PSP and the platform has no way to act on the money flow,
which direct charges satisfy and destination or separate charges do not.

**The finding that changes the plan.** The EU Anti-Money-Laundering Regulation (EU) 2024/1624 applies
from **2027-07-10** and lists "crowdfunding service providers and crowdfunding intermediaries" as
obliged entities, defining an intermediary as anyone matching project owners ("including fundraising
for a particular cause or event") with funders "through loans, equity or donations, including where
such donations entitle the donor to a non-material benefit". Recital 17 names humanitarian causes and
family or social events. A donation campaign feature makes Ortis an obliged entity from mid-2027:
customer due diligence on campaign owners and, above thresholds, donors; a written risk assessment; a
money-laundering officer; suspicious-transaction reporting. Manageable, but not free, and not for a
sole proprietor.

**Recommended posture, in two phases.**

1. **2026 to mid-2027: campaigns as sales, donations by partner.** Build the campaign surface on the
   ticket rail that already exists: "Unterstützer-Ticket", pre-orders, memberships, seat sponsorships,
   all direct charges with the org as merchant of record and a 14-day Widerruf handled by the org's
   AGB. For tax-deductible donations, integrate rather than compete: the Sparkassen portal
   (WirWunder on betterplace, 2.8 % fee often paid by the Sparkasse, doubling campaigns) and the
   Volksbank portal ("Viele schaffen mehr", 0 % to the Verein, bank co-funding, over €100m and 17,000
   projects by April 2026) are free for Vereine and sponsored by exactly the institutions §6 names as
   Ortis's most liquid local sponsors. Ortis lists the campaign, links out, and shows the result in the
   record. All-or-nothing on Ortis itself uses Stripe SetupIntents (pledge now, charge at deadline on
   the org's account), never a platform-held balance.
2. **Mid-2027 decision:** become an obliged entity (budget the AML programme, likely with the GmbH)
   only if campaign volume across tenants justifies it, or keep donations partner-routed for good. A
   gemeinnütziger Träger with a §58 Nr. 1 AO clause (a Bürgerstiftung) is the second lawful route to
   receipts for Vereine without a Freistellungsbescheid; an own gUG as Förderkörperschaft is the third
   and latest.

Red lines, from the pass: never let money touch an Ortis balance; never broker loans, Nachrangdarlehen,
securities or Genossenschaftsanteile; never claim "Spende" or "steuerlich absetzbar" for a recipient
that is not steuerbegünstigt; never make a Bürgerbudget vote binding; never take a success fee on eG
share placements.

### 4.9 Stripe Connect, the full map

**Decided and unchanged (2026-09-21, do not re-litigate):** accounts with `losses.payments = stripe`,
`fees.payer = account`, `requirement_collection = stripe`, `stripe_dashboard = full`; direct charges
only; platform fee 2 % plus €0.10 via `application_fee_amount`; refunds reverse the fee; never Münzen,
the retired Röbel Card or crypto through Stripe; never "Spende". Slice A (tickets) shipped 2026-09-23
in sandbox; go-live waits on Stripe platform approval, the live key and webhook, and the entity gate.

**What the research confirms and adds:**

- *Legal position.* With direct charges the payment is a transaction between the buyer and the org's
  own Stripe account (Stripe Payments Europe, a licensed EMI) and Ortis only receives a fee: technical
  service provider, outside ZAG. Destination charges and separate charges and transfers put money in
  Ortis's balance first and let Ortis instruct transfers, economically the Lieferheld pattern even
  though Stripe holds the funds. Treat them as a licensing question, not a feature toggle. Do not build
  on the Handelsvertreter exemption; the PSR (agreed 2025-11-27, applies about 18 months after
  publication) narrows it further.
- *Fees to expect (Germany, 2026-09-25):* EEA standard cards 1.5 % plus €0.25, premium 2.8 %, SEPA
  Lastschrift €0.35 flat, Wero (giropay's successor) €0.29, PayPal 0.2 % plus €0.10 plus PayPal's own
  fees, Apple and Google Pay at card rate, Billing 0.7 % of volume, Tax 0.5 %, Terminal 1.4 % plus €0.10
  EEA. Because the org pays Stripe, Ortis pays no Connect fees (no €2 per active account, no payout
  fees). The application fee carries VAT as Ortis's own B2B service: decide net versus gross before
  pricing goes public and issue a proper Gutschrift per org.
- *Read-across of 2 % plus €0.10:* on a €20 ticket the buyer's all-in cost is 5.25 %, identical to
  pretix plus Stripe and about Eventbrite's 5.5 %; on a €5 ticket fixed fees dominate (10.5 %), so add
  a lower fixed component or a cap for cheap tickets. Donations should carry 0 % plus an optional tip;
  betterplace at 2.8 % and GoFundMe at 2.9 % plus €0.25 leave no room above Stripe's cost.
- *Product coverage on Connect, all available in Germany:* Checkout and Payment Links (with
  `application_fee_amount`, org branding), **Billing on Connect** for memberships and course fees
  (subscriptions on the org account with `application_fee_percent`; only full-dashboard accounts can
  self-manage subscriptions, which the shipped `full` choice preserves), **Stripe Tax for platforms**
  (org liable; German specifics such as Kleinunternehmer and the 7 % Zweckbetrieb stay the org's
  responsibility), **Terminal with Tap to Pay on iPhone and Android, both GA in Germany**, through the
  React Native Terminal SDK (relevant for Expo), with the org owning readers and locations under
  direct charges; Instant Payouts in Germany; Capital for connected accounts. Not for this platform:
  Treasury and Issuing for connected accounts (need platform loss liability and v1 capabilities;
  Eurozone Treasury is preview with GA announced for Q4 2026), stablecoin payments (EU is private
  preview only, USD presentment), stablecoin financial accounts (no EU country in the preview list).
- *Multi-seller carts* are only possible through separate charges and transfers, which needs platform
  loss liability and re-opens ZAG. Keep carts per org, or one Checkout per org inside a cart. If a true
  mixed cart is ever required, Mollie Connect for Marketplaces (Mollie, a licensed PI, holds the funds)
  is the one alternative that maps one to one onto direct-charge semantics; Adyen, Mangopay and
  Lemonway (€5,490 setup plus €840 per month) are out of range.
- *Stored value is prohibited* on Stripe (gift cards, prepaid cards, restricted-business list updated
  2026-09-22), and it is the e-money trigger anyway. Vouchers must be single-purpose product vouchers
  redeemable only with the issuing org. This also closes the Röbel Card question for good.
- *DAC7 / PStTG.* A German platform operator that facilitates the sale of goods or personal services is
  a reporting platform operator (no registration needed for a German seat), reporting by 31 January
  for the prior year and collecting name, address, Steuer-ID, VAT id, bank account and register number
  per reportable seller. There is no exemption for Vereine; the small-seller threshold is under 30
  activities *and* under €2,000 per year. Ordinary public events are likely out of scope (FAQ 2.24),
  donations carry no consideration, but a marketplace for goods is squarely in. Capture the seller data
  at onboarding from day one.
- *Branding option for later:* `dashboard = none` plus Connect embedded components would keep orgs
  entirely inside Ortis; the dashboard type is immutable per account, so it would mean new Account
  objects. Not worth re-opening for slice A.

### 4.10 Ortis Kasse: real-life payments with stablecoins, privately

**The product.** One Kasse app (Expo, the phone is the Kasse) that records every sale, accepts three
tenders and prints or sends one receipt: card and Apple or Google Pay through Stripe Terminal or Tap to
Pay on the org's own connected account; EURe into the merchant's own Safe by QR (the stablecoin
acceptance rail already built, EIP-681, Gnosis Pay Safe or any Safe); Münzen as points. The Kasse is
the thing every organisation "of all types" needs and nobody in Germany sells with an onchain rail: the
pass found no German "Blockchain-Kasse" with a certified TSE, BTCPay Server has no KassenSichV plugin,
and the only crypto POS with card-acquirer distribution in DACH is Salamantex. White space, and it
also answers the 2027 draft duty to offer at least one digital payment option (BMF Eckpunkte,
2026-09-11, technology-neutral; Vereine and temporary events exempt).

**The legal fact that shapes it.** The AEAO zu §146a AO (BMF 2023-06-30, Nr. 1.2) defines
Kassenfunktion as the *capability* to record "zumindest teilweise bare Zahlungsvorgänge", explicitly
extended to "vergleichbare elektronische, vor Ort genutzte Zahlungsformen (elektronisches Geld wie z. B.
Geldkarte oder virtuelle (Kunden-)Konten)" and to vouchers or points accepted "an Geldes statt". EURe
is e-money by law (MiCA Art. 48(2)), paid on site from a virtual account, and Münzen are accepted in
place of money. So an Ortis Kasse has Kassenfunktion even with zero cash and needs a certified TSE,
DSFinV-K export, a receipt per transaction and the ELSTER Kassenmeldung. The "card-only needs no TSE"
folklore rests on a separate card terminal not being the recording system; it does not transfer to an
app that *is* the recording system. Build it in from day one: a cloud TSE (fiskaly SIGN DE, Swissbit,
D-Trust) costs about €8 to 20 per Kasse per month, DSFinV-K 2.3 is the required export, an in-app or QR
receipt is legal with the customer's consent (§6 KassenSichV, QR per DSFinV-K Anhang I), and the
onboarding flow should emit the ELSTER data set (system type, serial, TSE serial, dates) because new
systems must be reported within one month. GoBD record-keeping for crypto receipts means the on-chain
transaction must map to the Kassenbeleg (BMF 2025-03-06, Rn. 87 ff.). B2B sales through the Kasse will
need XRechnung or ZUGFeRD output by 2027 or 2028.

**Tax for the merchant.** Payment in an EMT is payment in money, not a barter: the Entgelt is the
nominal euro amount, no FX, no valuation problem; the disposal gain on a par-pegged EMT is about zero.
Merely accepting EURe needs no licence (a payee is a Zahlungsempfänger under ZAG; BaFin's MiCAR
Merkblatt keeps software without a custody promise out of scope). Münzen taken as consideration are a
Tausch at market value unless structured as bonus points (§4.7).

**The compliance ladder (from the POS pass, adopted as policy):**

| Level | Ortis does | Licence or partner |
|---|---|---|
| 0 Software only | Kasse with certified TSE, DSFinV-K, e-receipt, ELSTER helper; merchant's own Safe receives EURe; payer signs from own Safe | none (technical service provider §2 Abs. 1 Nr. 9 ZAG; no CASP service); TSE vendor contract; GoBD Verfahrensdokumentation |
| 1 Rewards | Münzen awarded and accepted in-network, never sold or redeemed for euros | none; VAT as price reduction or third-party consideration |
| 2 Fiat off-ramp per merchant | each merchant holds its own Monerium account; EURe burned to the merchant's IBAN by Monerium; Ortis never touches funds | Monerium partnership (Monerium does KYB); alternatively Ortis as E-Geld-Agent of the issuer (§1 Abs. 10 ZAG) if it distributes or redeems on Monerium's behalf; Monerium's public material describes no agent programme, verify contractually; note Monerium declined Max's entity as a direct API customer, so merchant-held accounts are the realistic shape |
| 3 Full platform | pooling EURe, converting, paying merchants, moving funds from user Safes, cards or IBANs under own brand | MiCA CASP (BaFin, transition ended 2025-12-30) plus a PSD2 payment or e-money licence (the EBA no-action period for EMT transfers ended 2026-03-02), travel rule, AMLR; or a licensed white-label with Ortis as its agent |

Ship level 0 and 1, reach level 2 through contracts, never build level 3 in-house. Anything that
initiates transfers from users' Safes on their behalf (session keys, platform-signed relays that move
EURe) risks being "transfer of crypto-assets for clients" under MiCA and a payment service under the
EBA reading; a paymaster that only pays gas is fine.

**Privacy, honestly.** The goal is that a merchant does not learn the customer's whole history and the
chain does not expose purchase history. What is lawful and deployable on Gnosis today:

| Technique | On Gnosis | Hides from merchant | Hides from chain | Risk |
|---|---|---|---|---|
| Spending account separate from the identity account (already the case: the Gnosis Pay Safe is not the citizen account) | yes | history tied to the citizen identity | no | none |
| Fresh Safe per merchant (CREATE2 sub-accounts, funded by minting EURe straight into the sub-Safe, gas by paymaster) | trivial | the payer's other merchants and history | amounts and merchant address visible; funding path can link Safes | none; consolidation re-links |
| Stealth addresses (ERC-5564/6538): Fluidkey live on Gnosis (self-custodial, a Safe per stealth address), Umbra historically | yes | mainly protects the payee; inverted, the payer pays into a fresh stealth Safe | amounts visible; unlinkability only | low |
| Privacy Pools (0xbow, Ethereum mainnet, association sets, EF Kohaku integration) | no | yes | yes | compliance-oriented, but an obliged entity may still screen it |
| Railgun, Aztec, FHE confidential tokens (Zama, Inco), Circle Arc confidential transfers | no | yes | yes | not on Gnosis; alpha or issuer-bound; collides with Monerium's screening at redemption |
| Tornado-style mixers | legacy only | yes | yes | high: de-risking, AMLR "obfuscation", Storm precedent |

The realistic design on Gnosis: per-merchant sub-account Safes, stealth Safes where the wallet supports
them, EURe minted directly into the paying sub-account, gas by paymaster. That hides the payer's
cross-merchant history from each merchant and from casual chain analysis; amounts stay public. This is
unlinkable, not confidential, and the app must say so. On law: AMLR Art. 79 (from 2027-07-10) binds
obliged entities, not self-custody users; the travel rule binds CASPs, with self-hosted verification
above €1,000 for a CASP's own customers. Privacy tooling is lawful for a non-custodial platform, but
every licensed touchpoint (Monerium at redemption, a card issuer, an exchange) screens source of funds
and may refuse obfuscated history; EURe carries an issuer blacklist. Amount-hiding on Gnosis would need
a new deployment and a legal pass; STRATEGY §12b's posture (watch, contained experiments) stands.

**Fee benchmarks the Kasse competes with:** girocard 0.25 to 1.4 %, credit 1.3 to 2.9 % plus €0 to
0.25, software €0 to 69 per month, TSE €8 to 20 per month (SumUp 1.39 % or 0.79 % with a €19 plan,
Zettle 1.39 % with a free TSE, Stripe Terminal 1.4 % plus €0.10, orderbird €22 to 69 software). The
Kasse's price is a software subscription plus the TSE pass-through; the EURe rail carries no fee
(stablecoin spec D6, "no fee on acceptance, ever"), the card rail carries the org's Stripe fee plus the
Ortis application fee.

**Gnosis Pay after 2026-12-20.** The consumer card and web app shut down on 2026-12-20 (announced
2026-09-24); Gnosis Pay continues as a B2B white-label platform (Visa, EUR IBAN and SEPA Instant, Pix,
custom pricing) with no merchant-acquiring product. The shipped Konto & Karte surface was built on the
partner API, so it should survive, but whether partner-issued cards continue through the consumer
wind-down must be confirmed with Gnosis Pay before the surface is widened beyond the pilot gate. The
digital euro (Parliament mandate 2026-07-09, adoption targeted end-2026, pilot from H2 2027, earliest
issuance 2029, mandatory acceptance with small-business exemptions, offline privacy) is the long-run
euro rail; design the Kasse so the settlement asset is swappable.

---

## 5. The legal ladder in one table

| Pillar | Regime | Position | Entity or partner | Never |
|---|---|---|---|---|
| Own treasuries (community, org) | MiCA custody definition, BaFin Merkblatt 2025-01 | self-custody of an entity's own Safe is unlicensed | each entity owns its Safe | custody for members; platform as signer on org Safes |
| Tickets, memberships, deals | ZAG (via PSP), UStG, DAC7 | direct charges; org is merchant of record; Ortis fee with VAT | Stripe Payments Europe; Kleinunternehmer then UG/GmbH | destination or separate charges without opinion; stored value |
| Crowdfunding | BMF 2017, ErbStG, BGB Fernabsatz, ECSP (out), AMLR 2027 | sales on Ortis, donations by partner or Träger | Sparkasse and Volksbank portals; Bürgerstiftung with §58 Nr. 1 AO; later gUG | money in an Ortis balance; brokered loans or shares; "Spende" for non-steuerbegünstigte recipients |
| Bürgerbudget | KV M-V §§16, 17; VgMinArbV M-V | advisory Meinungsbild; Kommune pays directly; SaaS Direktauftrag up to €100k | Amt or Gemeinde as customer | binding votes; running municipal money |
| Kasse | §146a AO, KassenSichV, DSFinV-K, GoBD, E-Rechnung | certified TSE from day one; e-receipt with consent; ELSTER Meldung | fiskaly or Swissbit or D-Trust | "cashless needs no TSE" |
| EURe acceptance | MiCA EMT, EBA opinion 2025-06, ZAG | merchant accepts into own Safe, unlicensed; payer signs | Monerium for per-merchant off-ramp | pooling, converting, moving user funds |
| Münzen and points | MiCA Art. 4(3), ZAG limited network, UStG §17 | earned and awarded, never sold, no par | community group owner Safe | euro sale or par redemption; "Zahlungsmittel" |
| Identity and membership | GDPR, EDPB 02/2025 v2.0, DSA Arts 16 and 17 | roles and roots onchain, names off; burnable tokens; Verein as controller, Netizen as processor | per-tenant DPIA, AVV, Impressum | public member rosters onchain |
| Payer privacy | AMLR Art. 79 (2027-07-10), TFR | sub-accounts and stealth Safes; amounts public | none | mixers; amount-hiding without a legal pass |
| Platform status | DSA (micro or small exemptions for Arts 15, 19, 29), PStTG, AMLR | notice-and-action, contact point, DAC7 capture from day one | GmbH before volume | sole proprietor as platform at scale |

Entity sequencing, unchanged from STRATEGY §7 and the business plan: Einzelunternehmen with
Kleinunternehmerregelung for invoice #1 (after the Nebentätigkeit check), UG or GmbH before Stripe
platform volume and before AMLR, gemeinnütziger e.V. for the Röbel experiment and for receipts, never a
CASP or e-money institution.

---

## 6. Revenue: sustain first, then profit

### 6.1 Streams ranked (benchmarks fetched 2026-09-25; 12-month net figures are estimates)

Assumptions: a tenant is an Amt-sized unit or a town of 3 to 10k inhabitants with about 60 Vereine and
100 businesses; Max has about 10 selling hours per week, which yields 4 to 6 new tenants per year
without a channel partner.

| # | Stream | Customer | Price point | 1 tenant | 5 tenants | 25 tenants | Effort and legal | Selling hours |
|---|---|---|---|---|---|---|---|---|
| 1 | Amt or Gemeinde licence (the managed Community OS, STRATEGY ladder #3) | Amt, Stadt, later Landkreis | €0.60 to 1.00 per inhabitant per year, minimum €2,400; support add-on €2 to 4k (DorfFunk's support package is €4,000 per year) | €6 to 12k | €30 to 60k | €150 to 300k | AVV, BITV accessibility, German hosting; no tender below €100k in MV | high (6 to 12 month political cycle) |
| 2 | Local sponsor | Sparkasse, Volksbank, Stadtwerke; 1 to 2 per tenant | €3 to 10k per year "präsentiert von", including the crowdfunding link-out | €5k | €20k | €75k | sponsoring contract, ad labelling | one or two meetings, annual renewal |
| 3 | Org subscriptions (profile, events, members, cards, Kasse software, Mecky für Betriebe, Autar community door) | Vereine, Betriebe | Verein €9 to 19 per month; business €19 to 49; NPO discount (market band: easyVerein €7 to 19, campai €30, Vereinsplaner €0 to 599 per year; AI chatbot SaaS $29 to 150) | €4 to 6k | €20 to 30k | €100 to 150k | self-serve billing, VAT | medium, then low |
| 4 | Settlement fees: tickets, memberships, Kasse card rail | Vereine, venues, Betriebe | 2 to 3.5 % plus €0.10 on tickets; 1 to 2.5 % plus €0.20 on membership collection; card rail via Stripe Terminal | €2 to 5k | €10 to 25k | €50 to 125k | Stripe direct charges, no MoR | low after onboarding |
| 5 | Grants (non-recurring) | Prototype Fund, LEADER, ESP, Gnosis ecosystem | €20 to 158k per year | one per year | same | same | reporting, open-source obligations | 40 to 80 hours per application |
| 6 | Sponsored deals and promoted posts | Betriebe | €49 to 99 per deal, packs; annual business profiles | €3 to 5k | €15 to 25k | €75 to 125k | "Anzeige" labelling | medium, self-serve possible |
| 7 | Ortis Sign (STRATEGY ladder #1) | Ämter | €1.2 to 2.4k per Amt per year | one Amt | region | state | ISV contract with the QTSP first | the current bet |
| 8 | Tourism module (Gästekarte, Kurtaxe, Meldeschein) | Kurverwaltung, Tourismusverband ("Müritz rundum" is financed by €0.50 per guest night; Röbel is in it) | €5 to 20k per year per region | €0 to 10k | €10 to 40k | €50 to 150k | Meldeschein law, incumbents AVS and feratel | high, few buyers |
| 9 | Bonus-points programme (Münzen) | Betriebe | programme fee €29 to 49 per month plus merchant-funded points (Payback merchants fund 1 to 3 % of basket) | €2 to 5k | €10 to 25k | €50 to 125k | keep non-redeemable | medium |
| 10 | Node services (paymaster, ceremonies, relay hosting; STRATEGY ladder #6) | node operators, tenants | usage-based, at cost plus 10 % | small | small | €10 to 30k | already built | low |
| 11 | Crowdfunding fee | Vereine, supporters | 0 % plus tip on donations; 3 to 5 % on non-charitable campaigns | €0.5 to 1k | €2 to 5k | €10 to 25k | AMLR from 2027 | low |
| 12 | POS acquiring referral | Betriebe | 20 to 50 bps residual via a SumUp-type partner (unverified split) | €0.5 to 3k | €3 to 15k | €15 to 75k | referral only | medium |
| 13 | Stablecoin Kasse rail | Betriebe | 0 % on acceptance (decided); revenue is the Kasse subscription and, later, the card programme's interchange share | 0 | 0 | €5 to 20k | levels 0 to 2 only | none |
| 14 | x402 record access (STRATEGY ladder #7) | AI labs, agents | cents | symbolic | symbolic | symbolic | built | none |

Realistic recurring sum (streams 1 to 4 and 6): **about €20 to 30k per tenant-year at one tenant, €95
to 160k at five, €450 to 800k at 25**, plus one grant per year. The scarce selling hours go furthest on
streams 1 and 2 (one decision-maker, four- to five-figure tickets); streams 3, 4 and 6 must be
self-serve. Past about five tenants per year, only a channel partner scales it: a Landkreis, a
Sparkasse, or GovTech Kommunal (tiered municipal fee model, operations from Q1 2026).

### 6.2 A tenant P&L at the Amt Röbel-Müritz scale

Amt Röbel-Müritz is the Stadt plus 18 Gemeinden, about 15,000 residents, one shared administration:
the natural single buyer. A hypothetical year, all estimates:

| Line | Assumption | Per year |
|---|---|---|
| Amt licence | €0.80 per inhabitant, 15,000 | €12,000 |
| Sponsor | one Sparkasse or Volksbank "präsentiert von" | €5,000 |
| Org subscriptions | 25 Vereine at €12, 20 businesses at €29, monthly | €10,560 |
| Ticketing fee | 6,000 paid tickets at €12 average, 2.5 % plus €0.10 | €2,400 |
| Membership collection | 1,500 members at €60 per year, 1.5 % plus €0.20 | €1,650 |
| Sponsored deals | 60 at €69 | €4,140 |
| Kasse software | 10 merchants at €29 per month (TSE passed through) | €3,480 |
| **Total** | | **about €39,000** |
| Marginal infrastructure | €1 to 3 per month per tenant plus TSE pass-through | under €500 |

Röbel itself is the proof engine and does not buy the licence; the Röbel figure that matters is the
org and settlement half (about €22k), which the Röbel orgs can generate as Ortis customers through the
community door. That is the first non-zero revenue that does not need a new tenant.

### 6.3 Cost side and the sustain threshold

Today's infrastructure is small: a €6.53 CX23, a Supabase project, Vercel, a few Fly apps, EAS, plus
the Anthropic token budget that Max funds from his salary under a hard monthly cap (STRATEGY §13b).
The passkey and bundler stack adds about €25 to 60 per month at 1,000 users. A tenant adds €1 to 3 per
month. So **sustain** (infrastructure plus tokens) is the STRATEGY target of €2 to 3k MRR, reachable
with the Röbel orgs plus one Amt licence plus one sponsor. **Profitable** means covering the founder's
time (€40 to 60k per year at the benchmark pass's assumption), which needs three to four tenants each
with a licence and a sponsor, or five tenants on the mixed model above. Break-even is a low bar because
burn is a Hetzner invoice and tokens; the risk is not cost, it is selling hours, which is why streams
3, 4 and 6 must not need Max at all.

### 6.4 B2C, B2B, B2G

- **B2C is free and stays free.** In a 5,000-person town, paid consumer features do not reach the
  founder's time cost, and the citizen app is the distribution asset (identity converts, the record
  reaches). The only B2C euros worth taking: pass-through ticket fees, an optional Mecky quota upgrade
  once the sovereign AI rail exists, and a physical card if a white-label card programme ever makes
  sense (the consumer Gnosis Pay card is gone). Never a paywall before the first task (STRATEGY §5g
  pricing doctrine).
- **B2B pays monthly.** Org subscriptions, the Kasse, sponsored deals, memberships, and Autar's
  community door (operated outcomes: "deine Werbung läuft, deine Anträge sind gestellt"). Self-serve,
  try first, pay after.
- **B2G pays yearly and slowly.** The Amt licence, Ortis Sign, the tourism module, Insight for the
  Gemeindevertretung. Direktauftrag up to €100k in MV since March 2026 removes the tender question;
  the political cycle does not go away. Framework agreements and the Landkreis channel open only after
  the first paid invoice (distribution doctrine). Every B2G surface obeys the register rules: never
  "Blockchain-Verwaltungsprojekt", never network-state vocabulary, votes are a Meinungsbild.

### 6.5 Grants with dates

| Programme | Size | Window | Fit |
|---|---|---|---|
| Prototype Fund (BMFTR / OKF) | up to €158,000, teams of up to 4, open source | **1 Oct to 30 Nov 2026** | best fit for the founder profile; the Fördermittel agent writes it |
| LEADER Regionalbudget MV (LAG Mecklenburgische Seenplatte-Müritz) | €1 to 20k per project, 80 % funded, public and private applicants | annual call; 2026 pending a ministry decision | the Amt or a Verein applies to fund an Ortis rollout; this is the B2G on-ramp with a budget line |
| Sovereign Tech Fund | from €50,000, rolling, about six months to contract | excludes user-facing apps and prototypes | only for infrastructure pieces (relay, identity, signer) |
| NGI Zero Commons Fund | €5 to 50k first grant | final call closed 2026-06-01 | stale; watch for successor calls |
| MV Digitalisierungsförderung (LFI / TBI) | SME digitalisation | sketches well before 30 June 2026 | for an Ortis GmbH as SME, maybe |
| Gnosis ecosystem | Circles Garage (closed 2026-06-29), Mini Apps Launchpad ($500 per week, $1,000 per month, open source), direct GIPs | rolling | small, token-denominated |
| Ethereum Foundation ESP | $5 to 200k, wishlist-driven since 2025 | rolling | only for the governance and ZK research angle |

Realistic: one €20 to 158k grant per year at 40 to 80 hours of application work. Smart Cities
Modellprojekte are closed to new entrants; "Zukunft Region" could not be verified as a programme.

### 6.6 Sequencing under the one-bet rule

| Quarter | Revenue-primary bet (Max's hours) | Standing tracks (agents) |
|---|---|---|
| Q4 2026 | Ortis Sign pilot conversion (unchanged) | Prototype Fund application; Stripe go-live after the entity gate; P0 config seam; the four decision memos (§7) |
| Q1 2027 | first Amt licence conversation (Röbel-Müritz), LEADER application with the Amt or a Verein | P0 multi-tenant app; K5 slices 1 to 3; org SaaS self-serve; memberships on Connect |
| Q2 2027 | one Sparkasse or Volksbank sponsor | passkey accounts for new users and agents; first pre-seeded Müritz towns claimed; Kasse level 0 spike with one Röbel merchant |
| Q3 2027 | Kasse pilot as a paid subscription | AMLR decision (by 2027-07-10); crowdfunding-as-sales; opt-in citizen re-key |
| Q4 2027 | second tenant with licence plus sponsor | Monerium per-merchant off-ramp contracts; Insight packaging |

The €2 to 3k MRR target by mid-2027 is unchanged and now has a composition: Röbel orgs (§6.2) plus one
licence or one sponsor.

---

## 7. Roadmap with gates

**Phase A, now to Q1 2027: decide, don't build.**
- Write the four memos, all read-only work: K1 slice 0 (migration route: bridge now, opt-in re-key
  later), K3's derivation map (every secret derived from a signature, its consumer, what breaks), the
  D10 passkey memo (§4.6, two tiers, account implementation, rpId, guardians), the K5 isolation memo
  (database per tenant, measured idle cost). Gate: Max signs the memos.
- P0 tenant-config seam for endpoints and contracts (kickoff §8). Gate: `pnpm smoke:web` green; Röbel
  behaviour unchanged.
- Stripe go-live (approval, live key, live webhook, entity, VAT decision). Gate: the Steuerberater
  conversation STRATEGY §11.5 already requires.
- Prototype Fund application by 30 Nov 2026; Sparkasse conversation booked.
- Verify the §9 items that gate later phases (Zodiac advisory, Gnosis Pay partner cards, Candide code
  hash, Circles host).

**Phase B, 2027 H1: the platform becomes real.**
- P0: Röbel and one throwaway tenant from one source, both installable, no code changes between
  them; CitizenNFTv3 with parameterised names and the `rebind` path designed alongside.
- K5 slices 1 to 3: self-hosted stack rendered by the installer, one tenant end to end on a node
  database, then GoTrue out and Netizen JWTs in.
- Accounts: Alto plus paymaster rendered and funded per chain (owner Safe or Timelock); passkey
  accounts for agents first, then new citizens; the bridge for legacy citizens.
- Relay: virtual-relay process for pre-seeded towns; strfry as mirror; the first Müritz claim.
- Org layer: Hats roles on org Safes, private membership attestations, memberships on Connect, org
  subscriptions self-serve. Gate for the next phase: the first non-Röbel community live (STRATEGY's
  mid-2027 milestone) or the kill trigger fires (narrow the entry SKU to relay plus record).

**Phase C, 2027 H2: money in real life.**
- Ortis Kasse level 0 and 1 with one Röbel merchant: cloud TSE, DSFinV-K, e-receipt, ELSTER helper,
  Stripe Terminal or Tap to Pay on the org's account, EURe into the merchant's Safe, Münzen as points.
  Gate: a Kassen-Nachschau-ready export exists before the second merchant.
- Crowdfunding as sales, donations by partner link-out; AMLR posture decided before 2027-07-10.
- Opt-in citizen re-key with guardians; guardian enrolment enforced; first recovery drill.
- Payer privacy: per-merchant sub-Safes and stealth Safes where the wallet supports them.

**Phase D, 2028 and later.**
- Level 2 off-ramp through Monerium contracts per merchant; Circles org sub-groups; Insight and
  Exchange when three real nodes exist; digital-euro readiness; hardware only past ten paying
  communities (STRATEGY §12e).

What this roadmap explicitly does not do: no destination or separate charges, no platform-held
balance, no CASP or e-money licence, no NIP-29 before the community door needs it, no Safe
Transaction Service, no per-tenant native builds, no tracing node, no amount-hiding privacy without a
legal pass, no revenue plan on Gemeinschaftskasse flows, no new build track before its gate.

---

## 8. Tensions with decisions already on record

1. **Passkeys versus the accounts spec v2.** The spec's default (silent node-held signer, no passkey
   ceremonies) was the thirdweb-UX requirement. Max's question asks for passkeys and social recovery
   as the primary path. §4.6 resolves it as two tiers, with the passkey tier needing the D10 memo the
   spec already anticipates. The bake-off's Kernel choice stays for the assisted tier; the passkey tier
   may end on the Safe stack. This is a revision, and it needs Max's signature.
2. **"Fully onchain membership" versus GDPR.** The EDPB's final guidelines make public rosters a
   liability. §4.5 keeps the ambition (roles, proofs, treasuries onchain) and moves identities off.
3. **Direct charges only versus marketplace carts.** Mixed carts need separate charges and transfers,
   which the 09-21 decision rightly excludes. Per-org carts, or Mollie's marketplace product if ever
   needed.
4. **Crowdfunding end to end versus AMLR 2027.** The ring-fence in STRATEGY §6.3 (donations fund the
   Röbel experiment, not the company) and R5 (no forwarded donations) already point the same way as
   the partner-first posture in §4.8. Becoming an obliged entity is a mid-2027 decision, not a default.
5. **Stablecoin acceptance "no fee, ever" versus Kasse revenue.** Both hold: the EURe rail stays free,
   the Kasse earns as software and on the card rail.
6. **Relay-enforced groups deferred versus org channels.** Kept deferred; the Autar community door is
   the trigger.
7. **Pricing ranges** are still unreconciled across the corpus (€29 to 99, €99 to 500, €199 to 499,
   €500 to 800). §6 anchors the Amt licence on the two public benchmarks (Crossiety per inhabitant,
   DorfFunk per month) and leaves the managed-node tier where STRATEGY put it (€99 to 500). Reconcile
   after customer #2, as the Conduit study says.
8. **Circles is core in the thesis but off by default for tenants.** Both are right: the town group
   comes from the factory when the preset asks for it; the currency noun is per tenant; the loyalty
   layer is where Circles earns its place in the Kasse.
9. **K5 says database per tenant; the infrastructure pass says shared schema with `tenant_id` is
   cheapest.** K5 stands for sovereignty reasons; the pass's numbers make "measure before promising a
   free tier" a hard gate, not a note.
10. **Gnosis Pay.** The stablecoin spec's D1 ("Gnosis Pay end to end") was written before the consumer
    wind-down. The acceptance rail never depended on the consumer product; the card surface does. §4.10
    and §9 make the partner-card question a verification item before the surface widens.

---

## 9. Verify before relying (claims from the research passes that need a second look)

| Claim | Why it matters | How to verify |
|---|---|---|
| June 2026 security advisory for Zodiac Roles v2 with Delay 1.1.0, attributed by one pass to a Gnosis Pay incident and a "shutdown 2026-06-01"; another pass dates the consumer shutdown to 2026-12-20 | D1 agent budgets and org permissioning lean on Roles | read the Gnosis Guild advisory and the Roles v2 release notes; confirm patched versions and the fallback-handler condition |
| Gnosis Pay partner-issued cards survive the consumer wind-down of 2026-12-20 | the shipped Konto & Karte surface | ask Gnosis Pay support with the partner id; also the open Startup-tier pricing and IBAN questions |
| Candide SocialRecoveryModule bytecode on Gnosis matches the audited source (chain 100 not in the official deployments registry) | recovery is the one component where bugs are permanent | compare code hash against the repository release; or redeploy from source |
| Monerium agent or distributor programme (none described publicly) and per-merchant account eligibility | Kasse level 2 | Monerium partnership conversation; Monerium declined Max's entity as a direct customer |
| Circles host after Metri's sunset; the `circles-inviter` mini-app and the playground URL | the invite path | open the Gnosis App and the sideload URL; re-run the inviter preflight |
| Circles "core members" concept and the affiliate mechanic (2 of 24 daily CRC to an affiliated group) | org sub-group design | docs.aboutcircles.com and a testnet trial |
| AMLR application date 2027-07-10 (secondary sources also print 1 July) and the exact Art. 2(1)(16) wording | the crowdfunding decision | read the OJ text of Regulation (EU) 2024/1624 |
| DAC7 scope for event tickets (BZSt FAQ 2.24) and the "no exemption for Vereine" reading | onboarding data capture | BZSt FAQ and a Steuerberater |
| Unlock Protocol's current DAO-set protocol fee on Gnosis | if memberships or tickets use Unlock | read the Unlock contract's fee on chain 100 |
| Mixed-seller carts through Mollie Connect for Marketplaces as the only direct-charge-compatible alternative | only if a mixed cart is ever required | Mollie docs and a ZAG opinion |
| EIP-7951 gas price on Gnosis (6,900) and Alto with safe-mode off for a permissioned bundler | cost model | Gnosis Fusaka spec; Alto docs |
| strfry idle memory figures and the Zooid/Unicity fork's maintenance state | relay architecture | run it on the CX23 for one week |

---

## 10. Decisions for Max

1. **Two custody tiers** (passkey with guardians, assisted node-held) as the revised default of the
   accounts spec, with the D10 memo as the next artefact. Yes or no.
2. **Account implementation for the passkey tier:** Safe stack (lean) or Kernel v3 with a WebAuthn
   validator. The memo costs both; you choose.
3. **rpId = `id.ortis.app`** for all passkeys, platform-wide, forever. Yes or no.
4. **Legacy citizens: bridge now (address kept), opt-in re-key later.** Is losing Circles mint history
   on re-key acceptable, and is re-attestation by two attesters plus one citizen the process at Röbel
   scale?
5. **Org membership: roles onchain, identities off** (Hats roles plus private attestations plus an
   optional burnable MembershipNFT). Or do you want member rosters onchain despite the EDPB position?
6. **Crowdfunding posture:** campaigns as sales on Ortis, donations by partner link-out until the
   mid-2027 AMLR decision. Or become an obliged entity from the start (needs the GmbH and an AML
   programme)?
7. **Ortis Kasse with a certified TSE from day one**, positioned as the "Blockchain-Kasse that passes a
   Kassen-Nachschau". Yes or no, and which Röbel merchant pilots it.
8. **Pricing anchor for the Amt licence:** €0.60 to 1.00 per inhabitant per year with a €2,400 floor.
   And is the 2 % plus €0.10 fee net or gross of VAT?
9. **Prototype Fund application** by 30 Nov 2026 (the Fördermittel agent drafts; you sign). Go?
10. **Sparkasse or Volksbank as the first sponsor and crowdfunding partner** (instead of a competitor).
    Which one do you approach first?
11. **K5 stands** (database per tenant on a node), with idle cost measured before any free tier. Confirm.
12. **NIP-29 stays deferred** until the Autar community door needs relay-side groups. Confirm.
13. **The native Ortis binary with a community picker plus a PWA per tenant**, and Röbel's listing
    folded in later. Confirm the store strategy.
14. **Gnosis Pay after 2026-12-20:** keep the partner integration and confirm partner cards, or park the
    card surface until a white-label programme is priced.

---

## 11. Sources

### Internal (both repositories)

- `netizen/netizen_labs/docs/STRATEGY.md` (§0 to §13), `ORTIS_KICKOFF.md` §1b and §1c,
  `ORTIS_COMMUNITY_KICKOFF.md`, `ORTIS_OPERATOR_KICKOFF.md` §0a, `ORTIS_DECISIONS.md`,
  `superpowers/specs/2026-08-11-distribution-strategy-design.md`,
  `superpowers/specs/2026-09-10-ortis-signaturen-youtrust-design.md`.
- `docs/kickoffs/2026-08-11_STRATEGY_ORTIS_ONE_CLICK_COMMUNITY.md`, `K1`, `K2`, `K3`, `K4`, `K5`.
- `docs/future-research/2026-07-22_NETIZEN_BUSINESS_PLAN.md`, `2026-07-27_WALLET_SOVEREIGNTY_RESEARCH.md`
  (with the 2026-07-31 on-chain addendum), `2026-07-31_ACCOUNT_IMPL_BAKEOFF.md`,
  `2026-07-31_CONDUIT_RAAS_STRATEGY.md`, `2026-07-31_PRODUCT_ARCHITECTURE_DECISION.md`,
  `2026-09-21_STRIPE_CONNECT_ASSESSMENT.md`, `DECADE_STRATEGY.md`, `LEGAL_MASTERPLAN.md`.
- `docs/SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md` §5 to §7, `docs/CIRCLES_ROEBEL_MUENZEN_STATE.md`,
  `docs/MONERIUM_FIAT_TREASURY_RESEARCH.md`, `docs/STATE_OF_NOSTR.md`, `docs/PUBLIC_DATA_ON_NOSTR.md`,
  `docs/ROADMAP_AND_DEFERRED.md`, `docs/buergerrat/2026-09-18_APP_CONTRIBUTION_STRATEGY.md` (rules R1 to R6),
  `docs/superpowers/specs/2026-07-31-netizen-accounts-service-design.md` (v2.2),
  `docs/superpowers/specs/2026-08-05-muenzen-stablecoin-exchange-tokenomics-design.md`,
  `docs/superpowers/specs/2026-09-04-stablecoin-acceptance-rail-design.md`.
- Code: `apps/expo/constants/wallets.ts`, `apps/expo/app.config.ts`, `apps/expo/context/MaciContext.tsx`,
  `apps/expo/lib/encryption.ts`, `apps/expo/lib/nostr/identity.ts`, `packages/blockchain/src/index.ts`,
  `contracts/governor-contract/contracts/verification-system/CitizenNFTv2.sol` and `CommunityRegistry.sol`,
  `contracts/governor-contract/scripts/community-factory.cjs`, `apps/web/src/lib/stripe-connect.ts`,
  `apps/web/src/lib/muenzen/constants.ts`, `supabase/migrations/005_accounts_system.sql`.

### External (fetched 2026-09-25 unless dated; grouped by pillar)

**Accounts, passkeys, recovery.** Gnosis Fusaka announcement (EIP-7951 included, 2026-04-02):
blog.validategnosis.com/p/gnosis-chain-fusaka-hard-fork-announcement · Ethereum Fusaka (2025-11-06):
blog.ethereum.org/en/2025/11/06/fusaka-mainnet-announcement · Safe passkeys: docs.safe.global/advanced/passkeys/passkeys-safe
and the React Native tutorial · safe-modules passkey README and safe-modules-deployments on GitHub ·
Candide recovery overview (updated 2026-09-22): docs.candide.dev/wallet/recovery/overview, pricing and
supported networks · Rhinestone social recovery: erc7579.com/tooling/module-sdk/using-modules/social-recovery ·
ZeroDev passkeys, recovery and pricing: docs.zerodev.app, zerodev.app/pricing · Pimlico pricing, supported
chains, Alto self-host: docs.pimlico.io · thirdweb in-app wallet how-it-works, FAQs, pricing; thirdweb
contracts (AccountCore, AccountExtension, AccountPermissions) on GitHub · react-native-passkeys 0.4.2
(2026-08-05), react-native-passkey 3.6.2 (2026-09-08), expo-passkey 0.3.15 (2026-05-20) · PRF support
matrix (updated 2026-09-22): corbado.com/blog/passkeys-prf-webauthn · Gnosis app wallet is a passkey Safe:
help.gnosis.io/en/articles/15655330 · Gnosis node requirements: docs.gnosischain.com/node.

**Stripe Connect and payments law.** docs.stripe.com: migrate-to-controller-properties, connect/risk-management,
connect/accounts-v2, connect/charges, connect/separate-charges-and-transfers, connect/subscriptions,
connect/instant-payouts, tax/tax-for-platforms, terminal/features/connect, terminal Tap to Pay (iOS and Android),
payments/stablecoin-payments, treasury/stablecoins · stripe.com/de/pricing, /de/connect/pricing, /de/terminal,
/de/legal/restricted-businesses (2026-09-22), /de/legal/connect-account (2025-11-18), stripe.com/legal/ssa
(2025-11-18), stripe.com/resources/more/zag-law (2024-02-12) · BaFin ZAG Merkblatt (rev. 2023-02-14) ·
PSD3/PSR status: mzs-recht.de (2025-09-01), Dudkowiak (2026-04) · BZSt FAQ PStTG (Stand 2025-02-24);
gesetze-im-internet.de PStTG §§4, 5 · ViDA: Grant Thornton (2025-06-17) · Benchmarks: eventbrite.de help
755615, pretix.eu pricing, eventim-light.de/preise, ticket.io/preise, patreon.com/pricing, steady.page/de/pricing,
support.betterplace.org, gofundme.com/de-de pricing, starting-up.de Crowdfunding-Vergleich 2026 (2026-03-18) ·
Alternatives: docs.mollie.com connect-overview, mollie.com/de/pricing, mangopay.com/pricing, lemonway.com/en/pricing,
sumup.com/de-de/preise, Adyen for Platforms overview (Sharetribe, updated 2026-09-18), Unzer marketplace pages.

**Crowdfunding law.** BaFin Schwarmfinanzierung page · Crassula ECSP guide (2026-04-23) · Deloitte ECSP
(2023-04-11) · Advant Beiten (2023-10-04) · §2a VermAnlG (gesetze-im-internet.de; version history buzer.de) ·
energiezukunft.eu on the Genossenschaft exemption · Sammlungsgesetz M-V repeal (2010-10-28, umwelt-online.de);
Wikipedia "Spendensammlung" · juraforum (2026-07-31), VLH (2026-04-09), §13 ErbStG · BMF 2017-12-15 via Haufe ·
skala-campus.org on reward VAT; Startnext tax blog (2021) · Startnext fees and ANB; Kickstarter fees
(2024-03-13); Leetchi (crowdinform 2026); WirWunder (sparkasse.de); 99 Funken fees; Viele schaffen mehr
(vvr-bank.de; viele-schaffen-mehr.de 2026-04-27); betterplace (givingplatforms 2026-06-02); GoFundMe pricing and
Terms (eff. 2026-06-23), Giving Guarantee (2025-09-24) · Bürgerstiftungen Wegweiser Bd. 7 (2018) · KV M-V §16
(Fassung 2024-06-09), §17; Landtag M-V Drs. 8/3388 · bpb Bürgerhaushalt FAQ (2022); demokratie.today Röthenbach
(2026-08-25); Bayerische Staatszeitung (2025-05-18); msg.group on Consul (2024); liqd.net adhocracy+ ·
Vergabe M-V (cosinex 2026-03-04; vergabeblog 2026-03-10) · Monerium MiCA explainer (2025-10-08); casptracker.eu
EMT list · gatewaycrypto.io (2026-04-23); Crassula MiCA CASP (2026-04-23); BaFin Kryptowerte-Dienstleistungen ·
AMLR (EU) 2024/1624 (eur-lex; FIAU Malta mirror) · Giveth ToS; Gitcoin Foundation manual; Endaoment (GuideStar) ·
DSA Arts 15, 19, 29 (cms-digitallaws.com); IHK Dortmund DSA overview · OLG München 4 StRR 184/13 (burhoff.de);
OLG Celle 1 Ws 248/12.

**POS, stablecoins, privacy, digital euro.** AEAO zu §146a (BMF 2023-06-30, lfst.rlp.de PDF; Haufe Nr. 1.2);
IWW (2020-08-06); flatpay (2026-05-11) · §6 KassenSichV; BZSt DSFinV-K · Kassenmeldepflicht: finanzamt.nrw.de,
steuertipps.de, dihk.de · TSE costs: kassensystemevergleich.de (2026), quill-kasse.de, fiskaly.com/signde ·
E-Rechnung: e-rechnungen.org, IHK Frankfurt · Digitale Bezahlpflicht (zdfheute 2026-09-11) · BMF 2025-03-06
Kryptowerte (bundesfinanzministerium.de PDF); BMF 2018-02-27 (KMLZ newsletter 11/2018) · BaFin MiCAR Merkblatt
(2025-01-03); BaFin Fachartikel (2025-01-22) · EBA Opinion EBA/Op/2025/08 (2025-06-10); EBA Opinion on the end of
the no-action period (2026-02-11) · Lindemann Law on EMTs (2024-02-13); FIN LAW on e-money agents (2025-10-13) ·
Monerium partners, docs, business terms · Gnosis Pay B2B (gnosis.io/pay, 2026-08-28); consumer shutdown
(cryptobriefing 2026-09-24) · AMLR text; LeoDex (2026-07-14); thirdweb AMLR explainer (2026-06-21); EBA travel
rule guidelines; yannakas.me on self-hosted wallets (2026-01) · Privacy Pools deployments; 0xbow seed
(2025-11-18) · Railgun docs; Aztec blog; CoinDesk on Aztec Ignition (2025-11-20); Zama mainnet (2026-01-24);
Circle Arc mainnet (2026-09-16) · Fluidkey FAQ; Umbra (GitHub) · Tornado delisting (CoinDesk 2025-03-21); Storm
verdict (hodder.law) · Fees: de.mobiletransaction.org (2026-07-21), zettle.com/de/pricing, stripe.com/de/pricing,
noda.live on Adyen, hellocash.de, orderbird.com · Crypto POS: newsbit.de (2026), eco.com stablecoin POS guide,
WalletConnect Pay and Ingenico (onekey.so 2026-04-29), BTCPay plugin directory, universaltill/ut-plugin-tax-de,
cypherhq.io · Digital euro: Freshfields (2026-07-15), EP legislative train (2026-08-01), CoinDesk (2026-06-23) ·
Chiemgauer (chiemgauer.info); awiti.com on §2 Abs. 1 Nr. 10 ZAG; Haufe on Payback VAT; IHK Konstanz on Gutscheine.

**Multi-tenant Nostr, org infrastructure, Circles, backend.** strfry router and sync docs (GitHub) · khatru
maintenance notice · Zooid (archived 2026-04-13), Unicity relay fork, Caravel (gitea.coracle.social) · NIP-29
comparison (nostrbook.dev/groups); NIPs 29, 42, 65, 77, 98 · relay.tools pricing; OpenSats relay report
(2026-03-26); nostr.land; d-central.tech implementations survey (2026-06-19); usenostr.org relay sizing ·
Blossom (hzrd149), bloom, hubstr-blossom · Hats supported chains and HSG v2 docs; hats-zodiac (GitHub) · Unlock
networks and fee docs · EAS deployments (GitHub) · Aragon OSx addresses.json · Zodiac Roles v2 docs and repo;
June 2026 advisory coverage (cryptotimes.io 2026-06-03) · EDPB Guidelines 02/2025 v2.0 (2026-07-07, PDF);
Dudkowiak and Bird & Bird summaries · Safe transaction service docs and production sizing
(safe-infrastructure); Safe API plans; Safe 1.5.0 (2025-07); Safenet (Messari) · GnosisDAO summaries (May and
July 2026: GIP-152, 153, 154, Circles Garage) · Circles docs: technical group details, group currencies,
validation and use cases, invitations and referrals, group avatars; circles-groups (GitHub); Mini Apps Launchpad ·
Supabase branching pricing; Nile pricing; Neon pricing (vela.run 2026); self-hosted Supabase sizing
(supascale.app; learnwithhasan.com) · Infra: Pimlico pricing; Dwellir Gnosis RPC comparison (2026-04-15);
Envio pricing; The Graph on Gnosis; Blockscout Autoscout; MACI coordinator service (2025-09-05) and roadmap;
Snapshot Pro docs; Tally to Cactus (2026-06-17).

**Revenue benchmarks and funding.** Crossiety (st-georgen.de 2020; support.crossiety.ch; crossiety.de 2024-06) ·
DorfFunk price list (2023-12 PDF); digitale-doerfer-niedersachsen.de FAQ (from 2025-07-01); echzell.de ·
Heimat-Info (Ahorntal Ratsinformation) · gemeinde-app.de (2026-07); fraglokal.de (2026-06); communiapp.de;
buerger-stimme.com; hey.bayern; muni.bayern; lokalportal.de · nebenan.de (Wikipedia; crossvertise; Trustpilot) ·
Go Vocal plans and UK G-Cloud listing; LeadIQ estimate · adhocracy+ news; Consul free instance (2025-07); Decidim
partners · easyverein.com, vereinsplaner.com, campai.com, clubdesk.de, Spond help · MV Wertgrenzen (cosinex
2026-03-04; vergabeblog 2026-03-10) · Amt Röbel-Müritz (Wikipedia; amt-roebel-mueritz.de) · kommunal.de (2021-08);
derneuekaemmerer.de · sparkasse.de WirWunder; berliner-volksbank.de (2026) · mueritzrundum.de; 1000seen.de
Modellregion Gästekarte; welcmpass.info · Nordkurier (pryntad.com; mein.nordkurier.de) · Prototype Fund
(starthub-hessen.de; startupport.de 2024-11); sovereign.tech/programs/fund; nlnet.nl/commonsfund;
leader-mse.de; leader-nordvorpommern.de Regionalbudget; bmwsb.bund.de Smart Cities and RegioStrat (2026-01);
interreg-baltic.eu calls; fl-pro-consulting.de MV Förderung · GECO (GitHub); GnosisDAO summaries;
esp.ethereum.foundation; gitcoin.co; Octant · pretix, eventim-light, eventbrite, reservix, ticket.io fee pages ·
starting-up.de crowdfunding comparison 2026; givingplatforms betterplace; steady pricing; Patreon fee notice
(2025-08) · kartenkosten.de SumUp; eco.com stablecoin processor fees 2026; docs.stripe.com stablecoin payments ·
chiemgauer.info FAQ; Wikipedia Bristol Pound; sardexpay.net; Wikipedia Payback · sitegpt.ai and tidio.com chatbot
pricing · discourse.org/pricing; masto.host; docs.oscollective.org GitHub Sponsors; kommune21.de GovTech Kommunal
(2025-12); govdigital.de.

---

*Written 2026-09-25 from eight sourced research passes and a read-only survey of both repositories.
Revise when a gate fires or a §9 item is verified, not on a calendar.*
