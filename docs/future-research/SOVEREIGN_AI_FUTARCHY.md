# Sovereign Local AI + Agent Futarchy Layer

**Status:** RESEARCH. Prior art exists and must be studied before building: Robin Hanson's futarchy ("vote on values, bet on beliefs"), Gnosis Conditional Token Framework (CTF — on our own chain), MetaDAO (futarchy in production since 2023).
**Thesis in one line:** The org funds a swarm of its own AI agents to trade conditional markets on proposal outcomes — solving futarchy's thin-market problem — while humans keep metric choice and the binding vote.

## 1. Sovereignty is a spectrum (be honest about the capability tax)

Tiers, weakest to strongest sovereignty:
1. Frontier API, standard terms
2. Frontier API, zero-retention / EU endpoint
3. Open-weight models (Qwen / Llama / Mistral class) on rented EU hardware (current Hetzner + LiteLLM setup)
4. On-prem hardware we own (see compute container in `PHYSICAL_INFRA_ENERGY_SHARING.md`)

Honest capability assessment (2026): local 70B-class ≈ frontier-minus-one-generation. Irrelevant for ~90% of town/Mittelstand workloads (RAG over private corpus, drafting, summarization) because the value is *corpus access*, not raw IQ. Real for hard reasoning (proposal generation, forecast analysis).

**Key architecture: the routing tier.** LiteLLM proxy enforces data-class policy:
- Citizen-linked / IP-sensitive data classes → pinned to local inference, physically cannot egress.
- Non-sensitive reasoning → may burst to frontier under zero-retention terms.
- **The routing policy itself is governance-controlled**: the DAO votes on which data class gets which sovereignty tier. This turns a sysadmin config into a unique product feature: cryptographically governed data-egress policy.

### Sovereign Mecky (first concrete deliverable)
Current state: Mecky runs on the Claude API (per README). Upgrade path: mid-size open model on a Hetzner GPU box + RAG over town documents (Ratsprotokolle, budgets, Satzungen), LiteLLM routing rule pinning citizen-linked queries local. Scope estimate: days of proxy config + weeks of RAG plumbing. Prototype-Fund-shaped deliverable (Klasse 03 window Oct–Nov 2026, KommunalStack framing).

## 2. Futarchy layer — design that survives known failure modes

Honest framing first: a market traded only by our own subsidized agents is **not** a market discovering external information. It is a *structured ensemble forecast with skin-in-the-game scoring*. Still valuable — diverse models forced to commit to probabilities, scored against outcomes, compounding a track record — but name it correctly to avoid futarchy mystique.

### The loop
1. Sovereign AI drafts proposal: plan + budget + **measurable target KPI**.
2. Conditional markets open (Gnosis CTF pattern): P(KPI | executed) vs P(KPI | not executed).
3. Agent swarm trades. Requirements:
   - Diverse base models and data slices (monoculture = correlated errors).
   - **One funded red-team agent** whose sole mandate is to short every proposal and profit from finding failure modes.
   - Agents scored on calibration over time; scores public.
4. Market probability displayed as **advisory signal inside the MACI voting UI**.
5. Humans vote (binding). Timelock. Execution via Safe.
6. **AttesterNFT holders act as the outcome oracle** — multi-sig attestation of "did the KPI land?" This reuses our sybil-resistant verified-human set to solve prediction markets' hardest problem (resolution). Slashing/dispute design TBD.
7. Payouts resolve; agent scores update; history accrues.

### Guardrails (non-negotiable)
- **Humans choose the KPI before markets open.** Goodhart's law is futarchy's classic death: "increase signups" gets gamed; "net merchant EURe settlement volume" is harder to fake. Metric choice is a values question → humans.
- **Market output is advisory; MACI vote is binding.** This is not a compromise — see §3.
- Play-money / points scoring first. Real-value markets raise MiCAR/gambling-law questions → Legal Masterplan territory, Fachanwalt before any real-stakes version.

### Calibration honesty
Current LLMs are mediocre forecasters: better than chance, worse than good human superforecasters, improving per generation. Year-one value is NOT oracle-grade probabilities. It is: every proposal passes an adversarial stress test with a permanent scored record — already better than "one person's gut defended in a meeting." The compounding asset is the outcome-labeled forecast history, which competitors cannot buy retroactively.

## 3. EU AI Act — the load-bearing legal fact

AI systems influencing public administration decisions and access to public services fall into high-risk territory under the AI Act (Annex III direction); meaningful human oversight is mandatory, not optional. **Our architecture (AI proposes → agents forecast → humans decide → timelock delays) is the only version of this vision that is legally deployable in a German Rathaus or GmbH.** Compliance is baked into the protocol, not bolted on — this IS the German/EU legal-wrapper edge from the Product B Market Scan. Verify current AI Act implementation timelines and Annex III scoping with counsel before any public-sector deployment claim.

Corporate variant of the same pitch: DSGVO + "your IP never leaves your hardware, and every AI action has a human authorization trail" — gets past the Geschäftsführer's lawyer AND the works council.

## 4. Minimal first experiment (attach to work that must happen anyway)

One toy market on one real e.V. decision — e.g. "will the Weihnachtsmarkt stand generate > €X in Münzen redemptions?" Three agents, play-money, manual-ish resolution via two Attesters. Purpose: build the resolution pipeline + the track-record UI, nothing more. No smart-contract work required for v0 (off-chain scoring table is fine).

## 5. Explicit non-goals (for now)

- No real-money markets.
- No autonomous execution (agent never touches the Safe without human quorum + timelock).
- No fine-tuning on private data (RAG first; fine-tuning is usually unnecessary and adds leakage risk).
- No build-out before the e.V. exists.
