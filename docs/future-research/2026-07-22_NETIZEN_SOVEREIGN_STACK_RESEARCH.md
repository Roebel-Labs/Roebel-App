# Netizen Sovereign Stack — Verified Research Report

> **2026-07-21/22.** Deep-research companion to the [Netizen Stack blueprint](../superpowers/specs/2026-07-21-netizen-stack-design.md).
> Question: to become fully independent of proprietary vendors (esp. thirdweb) and provide account
> abstraction, multisig/treasury, full financial infrastructure, identity, governance, sovereign AI,
> and sovereign data as owned/self-hosted infrastructure — what exists, what must be built, what does it cost?
>
> **Method:** four adversarially verified deep-research passes (each: 5-angle web sweep → source
> fetch → claim extraction → 3-vote adversarial verification per claim) plus one focused
> verification agent (Ocean Protocol). ~430 subagents, ~93 claims confirmed (3-0 unless noted),
> 10 refuted. Every claim below survived verification against primary sources unless marked
> *(unverified)*. Refuted claims are listed in §8 — they are findings too.

---

## 1. Account abstraction + embedded wallets — replacing thirdweb

**The verified vendor-free architecture:**

> **Safe smart account + Safe passkey module (signer) + react-native-passkeys (client, PRF key
> derivation) + self-hosted 4337 rails (Alto or Voltaire bundler + Safe4337Module + self-run paymaster)**

Component status (all on/for Gnosis chain id 100):

| Component | License | Status (verified) |
|---|---|---|
| **Alto** bundler (Pimlico) | GPL-3.0 | Genuinely open — full impl public, official self-host guide, Dockerfile, no gated component; third-party production forks exist |
| **Voltaire** bundler (Candide) | LGPL-3.0 | Active (v1.0.5 2026-07-08, 6 releases in 5 weeks); prebuilt GHCR image; safe mode needs geth/erigon `debug_traceCall` |
| **EIP-7702** | — | Live on Gnosis since Pectra, **2025-04-30** (Gnosis docs say May 7 — wrong; hardfork spec proves Apr 30). Removes per-user smart-wallet deployment; sponsorship still needs 4337 rails (EntryPoint ≥0.8 + bundler + paymaster) |
| **EIP-7951** (secp256r1 precompile) | — | Live on Gnosis since Fusaka, **2026-04-14** (epoch 1714688). Native P-256 at 6,900 gas (~30-40× cheaper than Solidity verifiers) — passkey signatures verify natively onchain |
| **Safe passkey module** (`safe-modules/passkey`) | LGPL-3.0 | Certora audits (v0.2.0/v0.2.1) + Hats Finance competition (all findings fixed); zero-storage (4337-compatible); packs precompile + fallback verifier (worked pre-Fusaka, seamless after). The Feb-2026 FSL relicensing hit Safe's *services*, not this contracts repo |
| **react-native-passkeys** | MIT | Maintained (v0.4.1 2026-04-17); **WebAuthn PRF fully supported** = deterministic wallet-key derivation from a passkey, no seed phrase, no vendor. **Floors: iOS 18+ / Android 14+**; Android largeBlob not implemented; Apple cross-device QR flow doesn't pass PRF |
| Safe{Core} SDK `createPasskeySigner` | — | Real API (verified in source). **But** the official RN tutorial is not gasless and never touches 4337 — no end-to-end passkey+4337+Gnosis reference exists anywhere |

**Every MPC/TSS alternative failed the adversarial openness test:**

- **Web3Auth** — acquired by Consensys (2025-06-02), now "MetaMask Embedded Wallets"; key retrieval structurally depends on the vendor-run Torus DKG network; even the "Self-Host" tier keeps a share on their Auth Network. Eliminated.
- **Turnkey** — only the TEE enclave OS (QuorumOS) is open (genuine AGPL-3.0, active); wallet APIs/policy engine/signing stay proprietary SaaS; only production TEE target is AWS Nitro. A research direction, not a replacement.
- **Lit Protocol** — v3 "Chipotle" (2026-02-26) abandoned threshold MPC for a **single sealed TEE** holding the root key; the "open source" repo **has no LICENSE file** (legally all-rights-reserved). Unusable.
- **Silence Labs dkls23** — the one audited open TSS library (Trail of Bits; 14/15 findings remediated) but under a **non-commercial license**; disqualified for a stack running a community currency/treasury.

**The two engineering gaps Netizen must close** (= its genuine open-source contribution at this layer):
1. The passkey + Safe4337Module + Gnosis gasless assembly — the reference implementation nobody has shipped.
2. A fallback onboarding path for devices below the PRF floors (pre-iOS-18 iPhones, Android ≤13) — sizing the excluded share of ~5,000 citizens is an open design task.

*(Unverified loose end: canonical EntryPoint v0.7/v0.8 addresses on Gnosis + audit status of Pimlico singleton-paymaster / eth-infinitism verifying paymaster — zero surviving claims across two passes; check onchain before the rails design.)*

## 2. Safe / multisig infrastructure

**Decision (2026-07-21, recorded in the blueprint's decision log): build on Safe's trusted hosted infrastructure; own the UX; self-hosting stays a documented fallback.** The research validates it:

- Self-hosting is real but heavy: 4-5 services (Transaction, Events, Client Gateway, Config, + Decoder) + Postgres/Redis/RabbitMQ via `safe-infrastructure` docker-compose.
- **On Gnosis, SafeL2 contracts need only an `eth_getLogs` RPC** — the tracing/archive-node burden applies to non-L2 Safes only (the "Gnosis requires tracing" claim was refuted).
- **FSL-1.1 relicensing (2026-02-17)**: the five backend services are now source-available under Safe Labs GmbH (auto-MIT after 2 years; last MIT snapshot: tag `sef-mit-final`). Self-hosting for one's own community is permitted; **offering it to others** (Netizen Cloud hosting other towns) may cross FSL's restriction → the fallback plan pins `sef-mit-final`.
- **Zodiac Roles Modifier v2** is the agent-budget engine: audited (G0 + Omniscia), maintained (SDK v4.0.0 2026-05-28), **onchain per-role spending allowances**, production-proven (ENS DAO endowment). Gotchas: allowance-management UI is license-gated behind hosted **Zodiac OS** (`enforceLicenseTerms.ts` throws `UNLICENSED_FEATURE`) → drive allowances via the open LGPL SDK/contracts or a de-gated fork; and **Roles v2 presence on Gnosis at the deterministic address failed verification (1-2)** — confirm onchain before relying on it.
- Backend-less fallback UI exists: Eternal Safe (RPC-only).

## 3. Financial infrastructure (EU-legal)

- **Monerium** is a licensed EEA EMI (Central Bank of Iceland, passported); **EURe is MiCA-compliant e-money** (formal white paper; EMT under MiCA Title IV). Verified via independent registries, not vendor pages alone.
- The **self-custody IBAN model** (SEPA-in mints EURe to your own wallet; SEPA-out burns — Monerium never custodies crypto) is exactly the live Gemeinschaftskasse rail. **EURe V2 verified live onchain on Gnosis** (`0x420CA0f9…`, ~€19.9M supply); V1 deprecated (repo already migrated).
- **Gnosis Pay's IBAN layer is Monerium underneath** — a future community card program sits on the same regulated rail.
- Netizen's layer-3 position stands: denomination-agnostic fiscal constitution *above* regulated rails; never compete with the EMI.

## 4. Identity, attestation, governance

**Proof of personhood — what can complement social attestation today:**

| Option | Verdict (verified) |
|---|---|
| **Semaphore v4** | **The one primitive canonically live on Gnosis** — verified bytecode at `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D` (+ Verifier `0x4DeC9E37…`, PoseidonT3 `0xB43122Ec…`), Blockscout-verified. Active releases (v4.14.3 2026-07-08); production ZK artifacts after a trusted-setup ceremony. Caveats: v4 audit is in-house PSE (v3 had external Veridise); recent releases are dependency bumps; the claimed "PSE + EF backing" was **refuted 0-3** — organizational backing is uncertain. Adopt as the anonymity layer (matches the 2026-07-09 ZK/sybil assessment). |
| Self.xyz | **Self-hostable path gone**: the open SDK ("Self Pass") is officially legacy, superseded by managed Self Enterprise → vendor dependency. The claimed attribute set (age/nationality/OFAC/human) was refuted 0-3. Personalausweis support unverified. |
| zkPassport | **Acquired by Aztec Labs 2026-05-27**; protocol + iOS app pledged open source; "any EVM chain" per vendor but no documented Gnosis verifier → would be self-deployed + self-maintained. Watch-list. |
| World ID | **Live German regulatory contest**: BayLDA's Dec 2024 corrective order (EU-wide via Art. 60) is under appeal, unresolved. Do not gate a German civic app on it. |

**Attestation infra:** **EAS is NOT on Gnosis** — verified empty bytecode at all four canonical addresses, no `gnosis` folder in deployments, zero doc mentions. Verax likewise (Linea/Arbitrum/Base/BSC only; last mainnet release Feb 2025 — momentum argues against it). A fresh EAS self-deploy loses the canonical registry/easscan ecosystem and its practicality is unconfirmed (claim refuted 1-2). **Consequence: Netizen's custom soulbound NFT contracts remain the pragmatic membership layer; spec them (NSP-1) rather than migrate to EAS.**

**Private voting:** **MACI v3.0.0 shipped 2026-06-16** (org renamed privacy-scaling-explorations → `privacy-ethereum`; repo active). Architecture vs the live v1 deployment: one MACI contract serving many polls (voters join per-poll via ZK membership proof, same key), **per-poll gatekeeping** (CitizenNFTv2 gate becomes a poll policy) and per-poll voice credits, hash-chains replacing vote merkle trees. A real upgrade candidate that would eliminate the deploy-per-vote pattern. **Unverified: v3 audit status and the migration path from v1 with the Shamir 3-of-5 coordinator federation** (does v3 tooling accept an externally reconstructed key?) — must be answered before any migration decision. Nothing survived on Shutter/Aragon OSx/Snapshot X/Vocdoni/futarchy, so no verified comparison against alternatives exists.

**EUDI / eIDAS 2.0 (from pass 2):** German sandbox opened **2026-01-27** (BMDS/SPRIND); state wallet first stage planned **early 2027** (legal deadline 2026-12-24; Dresden runs a mid-2026 citizen pilot). No real citizens hold PID in 2026. **2026 move: register as sandbox relying party; production EUDI consumption is 2027+.**

**German DAO legal wrappers (e.V./eG Satzung language for binding MACI votes, §32 BGB, MiCA on soulbound NFTs): zero surviving claims across passes — unresearched, not "no issues." This is Fachanwalt territory per the [Legal Masterplan](LEGAL_MASTERPLAN.md) rule.**

## 5. Sovereign AI

**Models (all quality numbers are consortium-self-reported; no independent replication yet):**

| Model | License | Verdict |
|---|---|---|
| **EuroLLM-22B** | Apache-2.0, fully open (weights + data + eval code), shipped 2025-12-14 | **Strongest deployable fully-open European model.** Own report concedes it trails Gemma-3-27B / Qwen-3-32B / Mistral-3.2-24B on most benchmarks (against-interest, credible) |
| **SOOFI-S 30B** (Soofi-S-30B-A3B) | closed-beta, gated, license unfinalized | Germany's flagship (Fraunhofer IAIS/IIS, DFKI, TU Darmstadt +; KI Bundesverband; BMWE/IPCEI-CIS ~€20M; 512 B200s in Telekom's Munich cloud). MoE: 31.6B total / ~3.2B active. Tops German+English aggregates **per its own report only**. Not instruction-tuned. **Final version promised permissive + ungated → the sovereign upgrade path to watch** |
| Teuken-7B | v0.6 CC-BY-NC only; commercial-v0.4 Apache | Leads EU21 21-language average but **loses German-only to Llama-3.1-8B**; OpenGPT-X project ended 2025-03-31, v0.6 still latest → avoid for production |
| OpenEuroLLM | — | Roadmap, not product: only ≤1.7B reference baselines shipped; 8B targeted mid-2026 |

**Hosting (prices verified live 2026-07-22, net):**

- **Hetzner GEX44** (RTX 4000 SFF Ada, 20 GB): **€232.30/mo** + €114 setup → 7B-class serving.
- **Hetzner GEX131** (RTX PRO 6000 Blackwell, 96 GB): **€1,197.30/mo** + €599 setup → 30B unquantized or 70B FP8 on one card. (GEX130 retired; per-DC stock fluctuates.)
- **IONOS AI Model Hub**: managed OpenAI-compatible per-token inference, Berlin DC, vendor-asserted GDPR posture (stateless, no logging/training reuse — not independently audited), built-in vector DB/RAG (bge-m3 available). Mainstream weights only — **it retired Teuken on 2026-04-16**.

**Router:** self-hosted **LiteLLM** natively provides the hybrid control plane — budgets/rate limits at five granularities incl. per-end-user, `tpm/rpm/max_parallel_requests`, auto-resetting budgets (`1mo` for calendar months) — i.e. **per-citizen monthly quotas (Intelligence Dividend metering) need no custom code**, only Postgres + stable citizen IDs.

**Recommended sovereign-AI path:** EuroLLM-22B-Instruct (or a mainstream Apache-class model, accepting the sovereignty trade) behind LiteLLM on a GEX131 (~€1.2k/mo) — or GEX44 (~€230/mo) for a 7B budget entry — with Claude as the frontier fallback rail and data-sensitive queries pinned local; SOOFI-S final release as the upgrade trigger. This instantiates the wealth-study Stage-1 ladder with verified prices.

**Unverified (flagged, not answered): EU AI Act duties** (deployer vs provider when self-hosting / fine-tuning; Art. 50 transparency from 2026-08-02; German implementing law), vLLM/SGLang maturity specifics, German embedding-model comparison, and all agent-infrastructure state (MCP registry/auth maturity, x402 adoption numbers, ERC-8004 registries, Langfuse/OTel-GenAI). The AI-Act item goes to legal counsel with the rest of the Legal Masterplan.

## 6. Sovereign data — Ocean Protocol assessment

(Single-agent verification pass, 2026-07-22.)

- **Token radioactive, code alive.** OPF exited the ASI Alliance (Oct 2025), was sued by Fetch.ai over ~263M FET community-token sales (moved via a Cayman trust), reportedly settling by returning ~$120M. Yet the repos ship: ocean-node 3.2.0 (May 2026), ocean.js 8.6.2 + contracts v2.9.0 (Jul 2026), all Apache-2.0. Python SDK officially dead.
- **The German fork is the relevant lineage**: **deltaDAO (Hamburg) / Ocean Enterprise / Pontus-X** — largest live EU dataspace (production Mar 2025, 180+ institutions incl. Airbus, T-Systems; Gaia-X Lighthouse; euro-stablecoin EURAU settlement). Verifiable-credential identity (walt.id) + policy servers.
- **Chain-100 footgun:** Ocean's manifest entry "chainId 100" is deltaDAO's private **GEN-X testnet**, *not* Gnosis. Nothing Ocean runs on real Gnosis; Pontus-X production is on Oasis Sapphire (23294). A Gnosis deploy = sole-maintainer mode.
- **Recommendation:** adopt the **compute-to-data pattern** — Ocean Node's C2D-V2 "light Docker" single-box engine (GPU-capable, still stabilizing) as optional Netizen-Node plumbing; data assets indexed on Gnosis, revenue in EURe to the Gemeinschaftskasse. **Never the OCEAN token.** Talk to deltaDAO when Gaia-X/procurement credibility becomes relevant. For 5,000 citizens the full platform is likely overkill; the pattern is the point. The federation model (multi-operator), not OPF governance, is the sovereignty pattern to copy.

## 7. The recommended sovereign stack (consolidated)

| Layer | Verified recommendation | Vendor independence |
|---|---|---|
| Chain | Gnosis (EIP-7702 since 2025-04, P-256 since 2026-04) | public protocol |
| Wallet/keys | Safe smart account + Safe passkey module + react-native-passkeys (PRF) | full (audited, LGPL/MIT) |
| 4337 rails | Alto or Voltaire bundler + Safe4337Module + self-run paymaster *(EntryPoint/paymaster addresses on Gnosis: verify onchain)* | full (GPL/LGPL) |
| Multisig backend | Safe hosted infra (decision 2026-07-21); fallback = self-host pinned to `sef-mit-final` | leveraged, hedged |
| Treasury policy / agent budgets | Zodiac Roles v2 via open SDK (allowance UI: de-gated fork if needed); *confirm Gnosis deployment onchain* | full (LGPL) |
| Fiat rail | Monerium EURe V2 self-custody IBAN (+ Gnosis Pay for cards) | regulated partner (by design — never compete with the EMI) |
| Membership/attestation | Custom soulbound NFTs (spec as NSP-1); EAS/Verax not on Gnosis | full (own contracts) |
| Anonymity/personhood | Semaphore v4 (canonical on Gnosis, zero deployment needed); EUDI sandbox relying-party in 2026, production 2027+; zkPassport watch-list; World ID avoided | full / state-rail |
| Private voting | MACI v1 today; **v3 upgrade candidate** pending audit + Shamir-coordinator migration answer | full (open source) |
| Sovereign AI | EuroLLM-22B (Apache) behind self-hosted LiteLLM on Hetzner GEX131 (€1,197/mo net; GEX44 €232/mo entry); Claude fallback; SOOFI-S upgrade trigger | full for local rail; hybrid by policy |
| Sovereign data | Compute-to-data pattern (Ocean Node C2D-V2 light engine as optional plumbing); EURe settlement; no OCEAN token | full (Apache-2.0) |

## 8. Refuted claims (the traps verification caught)

1. "Safe Transaction Service requires tracing nodes on Gnosis" — **false** (SafeL2 event indexing suffices).
2. "Zodiac Roles v2 is at its deterministic address on Gnosis" — **unconfirmed 1-2**; verify onchain.
3. "The entire Zodiac Roles stack is self-hostable ungated" — **false 0-3** (allowance UI is Zodiac-OS-licensed).
4. "Safe's RN passkey tutorial proves a complete vendor-free path" — **overclaim 1-2** (not gasless, no 4337).
5. "Self.xyz supports age/nationality/OFAC/human selective disclosure" — **false 0-3** as stated.
6. "Semaphore v4 is maintained by PSE with EF support" — **false 0-3** (repo active, but backing uncertain).
7. "EAS is trivially self-deployable to Gnosis via built-in tooling" — **unconfirmed 1-2**.
8. Gnosis docs' EIP-7702 date (May 7) — **wrong**; actual activation 2025-04-30.

## 9. Open questions (carried forward)

1. EntryPoint v0.7/v0.8 + open verifying-paymaster status on Gnosis (onchain check — small).
2. MACI v3 audit status + v1→v3 migration with the Shamir coordinator federation.
3. PRF device-floor exclusion share among Röbel citizens + chosen fallback onboarding path.
4. FSL-1.1 legal read: does hosting Safe backend *for other communities* cross the restriction?
5. EUDI sandbox relying-party onboarding requirements for a Verein-run app (the ~115-orgs figure is unconfirmed).
6. EU AI Act deployer/provider duties for a self-hosted, possibly fine-tuned civic model → legal counsel.
7. German legal form + Satzung language binding a MACI tally → Fachanwalt (unresearched, not clear).
8. SOOFI-S final release timing + independent German benchmark replication; head-to-head German civic-RAG eval (EuroLLM vs Gemma/Qwen/Mistral + embedding choice).
9. Ocean C2D-V2 light-engine maturity check before any data-trust build; deltaDAO conversation when relevant.

---

*Companion docs: [Netizen Stack blueprint](../superpowers/specs/2026-07-21-netizen-stack-design.md) ·
[Coordination Protocol thesis](COORDINATION_PROTOCOL_THESIS.md) · [Decade Strategy](DECADE_STRATEGY.md) ·
[Legal Masterplan](LEGAL_MASTERPLAN.md) · [Sovereign-AI wealth study](../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md)*
