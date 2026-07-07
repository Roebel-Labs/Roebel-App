# Röbel Suite — Product Portfolio & Wave Roadmap

**Date:** 2026-07-07
**Status:** Strategy companion to [2026-07-05-sovereign-community-os-design.md](2026-07-05-sovereign-community-os-design.md)
**Purpose:** the full product catalog for the sovereign community suite. The foundation spec covers *how* the substrate works and *what ships first*; this doc covers *everything the suite becomes* and in what order. Each product gets its own brainstorm → spec → plan cycle when its wave arrives.

---

## Thesis

One sovereign suite with Notion-grade UX under one brand: **wallet-verified local identity + a local AI agent woven through every product.** The suite is the *integration* of best-in-class open source (fork/embed editors, integrate open protocols), not a reimplementation. We build only the differentiators: the workflow engine, the agent logic, the identity fabric, and the shell.

**The engine, not a product:** "AI infra that connects processes and automates redundant work" is the Agent + Flows layer of the foundation. Every product below is a *surface* where that one engine shows up. That is what makes this a suite instead of ten disconnected apps.

**Personas are open-ended by design.** Program runner, teacher, business, Verein, Amt clerk, citizen, tourist were examples. The foundation is persona-agnostic; each new actor type is configuration plus (sometimes) a new module — not a new platform.

---

## Product catalog

| # | Product | What it is | Base (build/fork/integrate) | Differentiator | Wave |
|---|---------|-----------|------------------------------|----------------|------|
| 1 | **Flows** | AI workflow engine: forms fill themselves, cross-party filings, status tracking, process automation | **Build** (the moat) | Agent acts *across verified local actors*, not inside one user's silo | **1** |
| 2 | **Calendar** | Notion-Calendar-grade calendar | Integrate CalDAV (Radicale/Nextcloud); build the UI | Agent schedules, preps meetings, drafts reports from calendar data | **1** (lite — the cockpit needs it), standalone in 2 |
| 3 | **Mini App Builder** | AI-assisted builder; apps deploy into the community app | **Already live** (Sommer Camp hackathon, /editor + Expo host) | The community builds its own modules — ecosystem seeding | **1** |
| 4 | **Present & Design Studio** | AI presentation builder + event-poster designer | Embed open canvas (Polotno / Excalidraw / tldraw) + Agent generation | One prompt → branded poster/deck, auto-filled from Vault + events data | 2 |
| 5 | **Docs** | Decentralized Google Docs | Fork/embed **Fileverse dDocs** (license check first) | E2E encrypted, wallet-keyed, Agent as co-writer | 2 |
| 6 | **Public Events** | Community-facing event discovery, RSVP, attendance | Reuse existing events system + cockpit | Verified actors; Münzen ticketing later | 2 |
| 7 | **Sheets** | Decentralized Google Sheets | Fileverse dSheets-like (fork carefully — sheets are far harder than docs) | Formulas read chain + Vault data | 3 |
| 8 | **AI Phone** | Voice agent answering/making calls for businesses and the Amt | Integrate voice/telephony infra; build agent logic | Kills Amt phone-tag and small-business missed calls | 3 |
| 9 | **B2B / Commerce rails** | Local sourcing, orders, payments | Build on Münzen (Circles) + verified business identity | **Transaction-fee revenue starts here** | 3 |
| 10 | **Mail** | The Notion-Mail-but-sovereign play | Two-lane client (see below); never run a mail server | Agent triage/drafting + a genuinely private community lane | 4 |
| 11 | **Messenger** | Sovereign upgrade of existing DMs | Integrate Matrix or XMTP/Nostr | E2E, wallet-native | 4 |

### Mail: the two-lane architecture

You cannot make classic email private, and you cannot get reach with a closed private protocol — so one client, two lanes:

- **Reach lane:** IMAP/JMAP client over the user's existing mailbox (Gmail, GMX, Amt mail). The Notion Mail model — our UX, our brand, Agent triage and drafting on top. Interoperable with the whole world.
- **Private lane:** wallet-to-wallet E2E messages between community actors (XMTP/Matrix under the hood). True P2P privacy where both ends are ours.

Same inbox UI, clearly labeled lanes. Wave 4 because mail clients are the highest-grind, lowest-differentiation build on this list — by then users already live in the shell.

---

## Wave logic

```
WAVE 1  Flows + Calendar-lite + Mini App Builder     ← proves foundation; forced usage;
        (pilots: town program runner + school teacher)   institutions start paying for AI
WAVE 1b Sovereignty hardening                         ← encrypted Vault impl + self-hosted
                                                         German AI; gates all sensitive data
WAVE 2  Present/Design + Docs + Public Events        ← visible, viral, low-sensitivity;
                                                         reuses engine + events
WAVE 3  Sheets + AI Phone + B2B/Commerce             ← transaction fees begin; deeper data
WAVE 4  Mail + Messenger                             ← hardest grind, done when suite has gravity
```

Ordering rules: (1) each wave reuses the previous one's machinery; (2) forced-usage products before nice-to-have ones (the Mecky lesson); (3) revenue in realistic order — **AI subscriptions from institutions first (town, school), transaction fees only once Wave-3 volume exists**; (4) data sensitivity rises with waves, so sovereignty hardening (1b) gates the sensitive ones.

---

## Business model (sustainability)

- **AI fees:** institutions (Verwaltung, school, later businesses) pay subscriptions for agent-boosted workflows. This is B2G/B2B SaaS revenue that exists from Wave 1.
- **Transaction fees:** small fees on value flows (commerce, ticketing, B2B orders — Münzen rails). Real but volume-dependent; do not lean on it before Wave 3.
- **Blockchain's role:** verified identity and coordination/truth — the trust layer that makes cross-party workflows and fee-bearing transactions legitimate. Infrastructure, not decoration.
- **Scale path:** product-first, protocol-ready — a working Röbel becomes a forkable blueprint; other towns are deployments, then a federation, then a protocol.

---

## Discipline

Every product above enters through the same gate: its own brainstorm → spec → plan when its wave arrives, built on the foundation interfaces, license diligence before any fork/embed. No product jumps its wave without a forced-usage reason.
