# Business Governance Product (working name: none yet)

**Status:** RESEARCH. No code should be written against this document until the Röbel e.V. exists and runs its own governance on the existing stack.
**Thesis in one line:** The civic stack is not civic tech — it is a general pattern (verified-human identity → role-gated proposal rights → privacy-preserving voting → timelocked execution against a treasury). Röbel is tenant #1. Organizations are tenants #2..N.

## 1. Role mapping from the existing stack

| Civic contract | Business role | Notes |
|---|---|---|
| AttesterNFT | AdminNFT (HR / leadership) | Can verify members, can propose. Thresholds tunable per org via existing setters. |
| CitizenNFT | VerifiedMemberNFT (employees / co-op members) | 1 human = 1 vote. Soulbound, revocable, multi-sig on/offboarding. |
| — (new) | **OperatorNFT (AI agent)** | Proposal rights, **zero voting rights**. Carries a mandate: spend cap, scope, expiry, revocation path. |
| MaciAttesterGovernor | Same | MACI mode for anonymous votes, plain ERC721Votes mode for public/auditable votes. Per-proposal choice. |
| TimelockController | Same | Functions as the **human veto window** on agent-initiated actions. |
| Gnosis Safe treasury | Company budget Safe | EURe (Monerium) settlement; Gnosis Pay as euro exit per Legal Masterplan Phase 2. |

Existing differentiator vs. all incumbent DAO tooling: **verified-human membership + coercion-resistant anonymous voting.** Snapshot/Tally/Aragon assume token weight = legitimacy and votes are public. For organizations of humans, neither assumption holds. An employee voting against a manager's proposal needs MACI-grade secrecy; the org needs sybil-resistant one-person-one-vote. This combination is currently unoccupied space and is the concrete form of the Product B gap (agent *authorization*, while everyone else builds agent *payments*).

## 2. The legally clean product shape (Germany)

Companies cannot be DAO-ified at the core:

- A GmbH Geschäftsführer carries personal, non-delegable legal liability (Geschäftsführerhaftung). An anonymous vote cannot replace corporate governance.
- Employee voting on company money touches Betriebsverfassungsgesetz / works-council territory.

**The sellable version is the delegated-budget model:** leadership formally allocates a scoped envelope (e.g. €5k/month for "team tooling"). *Within* the envelope, the on-chain process is binding and enforced (agent proposes → humans reach quorum → timelock → Safe pays). The vote executes a pre-authorized spending policy; it does not replace the Geschäftsführung. Pitch language: "policy engine with cryptographic approval workflows," never "let the AI and an anonymous vote spend your money."

## 3. Beachhead market: NOT GmbHs

Priority order:

1. **Genossenschaften (eG).** ~7,000+ registered co-ops in Germany. One-member-one-vote is *legally mandated* by the GenG; current tooling is paper ballots and annual assemblies. Verified-member identity + anonymous voting + treasury is their statutory governance model, digitized. (Cross-link: the planned Bürgerenergie eG in `PHYSICAL_INFRA_ENERGY_SHARING.md` is a first customer we control.)
2. **Vereine.** The Röbel e.V. itself is customer zero at marginal cost — its internal governance runs on the stack from day one, producing the reference audit trail.
3. **DAO-native startups / web3 orgs** that need verified-human membership.
4. **Family businesses / holacracy-style startups** for participatory budget scopes.
5. **Classic GmbHs last** — longest sales cycle, heaviest legal objections.

Shared insight: an e.V., an eG, and a Gemeinde are all "verified humans governing shared money." One codebase, three markets.

## 4. Hard problems (do not hand-wave these)

- **DSGVO / GDPR:** a soulbound NFT tied to an identifiable employee is personal data on an immutable ledger. Design: pseudonymous wallets on-chain; identity mapping lives off-chain in the *tenant's own* database; revocation is the on-chain analogue of erasure. The written solution to this is itself part of the sellable legal-wrapper playbook. Needs Fachanwalt review before any B2B sale.
- **Coordinator ops = the hidden business.** One Fly.io machine per… what? Multiplying the MACI coordinator across N customers turns us into a coordinator-as-a-service company: key management, proof generation, SLAs. Real recurring revenue; real operational weight for one person. Multi-tenant factory contracts on Gnosis are easy; running 50 coordinators reliably is the moat and the pain. Shamir key-split roadmap becomes a product requirement, not a nice-to-have.
- **Anonymity is not always wanted.** Many approvals need audit trails. Both modes must be first-class; the org chooses per proposal type.

## 5. Business model sketch

- Per-seat SaaS (verified member/month) + per-org base fee.
- Coordinator-as-a-service tier (we run MACI infra) vs. self-hosted (they run it, we support).
- Legal-wrapper playbook as paid onboarding/consulting (eG statutes + DSGVO design + delegated-budget policy templates). This layer does not commoditize the way code does.

## 6. Competition snapshot (as of 2026-07)

Aragon, Tally, Snapshot (public, off-chain, token-weighted), Colony, Safe ecosystem treasury tools (e.g. former Utopia/Parcel category). None combine: verified-human identity + coercion-resistant voting + agent mandates + German/EU legal wrapper. Re-scan before any build decision — this is a race-not-moat space per the Product B Market Scan.

## 7. Trigger condition to actually build

Do not build on speculation. Trigger: Röbel e.V. has operated its internal governance on the stack for ≥6 months AND at least one external org (ideally the Bürgerenergie eG or a Verein) has asked to use it. Until then this document only accrues edits, not commits.
