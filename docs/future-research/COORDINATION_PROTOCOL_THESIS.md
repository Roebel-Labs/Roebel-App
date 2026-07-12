# The Coordination Protocol

**Netizen Labs · Thesis v0.1 · 2026 — durable copy of the [interactive artifact](https://claude.ai/code/artifact/5d2307c7-8f75-4fb8-aa7e-dabe21886209).**

> A strategy thesis, not an offer of securities or investment advice. Röbel/Müritz is a live civic experiment;
> the generalization below is a direction of development, not a shipped product. Companion field study:
> [`../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md`](../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md).

## Thesis

**Every organization runs on the same four contracts. We turned them into a protocol.** Membership, governance,
treasury, and work — for centuries you rented each from a separate, jurisdiction-bound institution. We made them
programmable, composable, and open, and proved it on the hardest customer that exists: a real democracy with real
money.

## The coordination stack

The same six layers sit under any organization, human or agentic:

| # | Layer | What it is | Röbel primitive |
|---|---|---|---|
| — | **Interface** | Apps, mini-apps, conversational agents — how humans and machines touch the stack | Expo/web app, mini-apps, Mecky |
| 05 | **Agent runtime** ⟵ *the unlock* | AI agents with scoped identity, budget, and bounds — acting *as* the organization | agentic commerce (x402) |
| 04 | **Value** | Currency and accounting — pricing contribution, ownership, exchange | Circles / Röbel Münzen |
| 03 | **Treasury** | Shared capital, custody, programmable allocation | Gnosis Safe multisig |
| 02 | **Governance** | Collective decisions — private, capture-resistant, verifiable | MACI |
| 01 | **Identity** | Provable, privacy-preserving membership — sybil-resistant, pluggable attributes | CitizenNFT / personhood |

## The pattern

Strip away "civic" or "corporate" and every organization is the same machine: a bundle of four contracts plus a way
to get work done — **who belongs, how it decides, what it owns, how it rewards contribution, and who does the
work.** Historically those five answers came from five incumbents (the state & HR; boards & parliaments; banks &
auditors; central banks & payroll; the labour market). This stack provides all five as programmable primitives.

## The unlock — agents are members too

To act economically, an AI agent needs exactly what a human member needs: a **verified identity**, **governance
bounds**, a **scoped treasury**, and a **currency** to transact in. The existing institutional stack cannot onboard
it — no registry lists it, no bank scopes it an account, employment law has no category for it. This stack can,
because it was built human-*and*-agent-agnostic from the first line.

So the organization of the future stops being a company with AI bolted on; it becomes a **hybrid human+agent
collective**: goals, a constitution, a treasury, a swarm of agents executing within bounds, and human members who
set direction and hold the upside. Goals + rules + capital + executors + owners = **a program with a runtime.**

> The corporation was the organizing technology of the industrial era.
> The **coordination protocol** is the organizing technology of the AI era.

## The wedge — hardest customer first

Röbel is a real German town running its community layer on the full stack today. A town demands the highest bar on
*every* primitive at once — real people you can't fake, real democracy whose legitimacy is non-negotiable, real
money, real neutrality. **Every other organization is a strict subset of that.** Starting at the summit also buys a
credential no B2B tool can purchase: *the protocol that runs a real democracy* beats *the protocol that runs a
Discord.*

## Why now

Two curves cross this decade: AI agents move from assistants to **actors** that hold budgets and transact, while
the incumbents that could offer neutral coordination infrastructure (banks, big platforms, states) structurally
can't, because they are extractive or captured. Vacuums in infrastructure get filled by whoever is credibly neutral
and already running.

## The moat & the model

- **Credible neutrality** — rules on-chain, forkable, owned by no one: the exact property that let Linux, Ethereum,
  and email become shared infrastructure where an extractive incumbent never could.
- **Composability** — orgs on the same stack trust each other's members, settle in shared currency, compose
  governance (federations, supply chains). Value compounds with every org that joins.
- **A thin protocol fee** — small, capped, governed, on the flows that pass through (treasury moves, agentic
  commerce, settlement, membership). Coordination's gas; scales with use without extracting.

The software is forkable and will be commoditized. The moat is the **shared trust-and-settlement layer** and the
network that speaks it. Netizen Labs' role is maintainer, standards body, and hosting — a foundation-plus-company
shape, not the owner.

## What we don't claim (the honest limits)

- **We don't replace the state.** Courts, force, fiat, and legal personhood stay with it. The honest end-state is
  interoperation: the protocol is the **operating system**, a GmbH / e.V. / cooperative is the **jurisdictional
  wrapper** that gives an org standing. Institutional functions get eaten one at a time by being a better default.
- **We haven't solved who governs the protocol.** If we control it, it isn't neutral; if no one does, who maintains
  it? Needs a real answer (foundation/company split, on-chain protocol governance) or it becomes another platform.
- **We won't boil the ocean.** "Run any organization" is the vision, not the roadmap. Nail one hardest instance
  (Röbel), then one adjacent high-trust org, and let the network layer emerge once real nodes share primitives.
- **Not everything should be a market.** Some coordination is trust, not transaction. Hide the machinery, preserve
  the human institution — over-financializing an organization corrodes it.

## The bet

Prove the substrate on a democracy, then let every organization run on it. Röbel is **Genesis Node #1** — the
reference implementation and the legitimacy engine. The primitives are built generic beneath a civic surface, so
the second deployment is a configuration, not a rewrite.

**Design rule:** build every module (identity, governance, treasury, value, agent runtime) generic from the first
line — swappable membership (citizen → shareholder → employee → union member), swappable governance (1p1v →
token-weighted → quadratic → delegated), swappable currency — with the civic case as the surface, not the ceiling.
