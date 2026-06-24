# Gnosis Consolidation + Sybil-Resistance Hardening — Design & Migration Plan

**Status:** APPROVED (thresholds frozen 2026-06-24) — building v2 contracts + tests. On-chain deploy gated on the burner key.
**Date:** 2026-06-24
**Author:** Claude (design pass) + Max
**Scope decisions locked with Max:**
- **Full consolidation** — CitizenNFT + AttesterNFT + MACI + Governor + Timelock all native on **Gnosis (chainId 100)**. Retire Base.
- **Percentage-based thresholds** (with absolute floors) for all attestation / revocation / rejection gates, so they auto-scale as the attester & citizen sets grow.
- **Revocation** intentionally hard (protects against malicious de-citizenship), kept governance-mutable.
- **eID / proof-of-personhood = Self protocol (self.xyz) only**, as a **Phase 2** add-on. No EUDI/BundID/zkPassport/Rarimo alternatives.
- **No on-chain PII** — keep the existing Poseidon-commitment design; preimage stays in device secure-store.
- Deploy via a **disposable burner wallet** (key provided out-of-band, used only for deploy txns, swept after).

> Sections marked **[research-pending]** will be enriched with citations + current-status confirmation from the in-flight deep-research pass. Everything else is grounded in the current codebase.

---

## 0. TL;DR

1. The privacy design is already good — **PII never touches chain or server**; only a one-way Poseidon commitment is stored. We keep that untouched.
2. The real Sybil weakness is the **trust root**: a CitizenNFT mints on **1 attester + 1 citizen**, which cannot resist a single attester+citizen collusion. **AttesterNFTs** mint at a flat 2-of-N.
3. **Production still runs on Base** (the "Gnosis migration" only re-minted identity to gate Circles; the app never switched chains). That's why 2–3 new citizens kept landing on Base.
4. **Fix both at once** with a clean re-deploy on Gnosis: fresh contracts with **percentage-based, auto-scaling thresholds**, harder attestation (the actual Sybil lever), hard revocation, native MACI/Governor, and a one-shot `migrationMint` of the full citizen set (15 + Base stragglers).
5. **Phase 2:** layer **Self.xyz** as an optional one-human-one-identity nullifier that does **not** depend on trusting attesters at all.

---

## 1. Current system (as-built, from code)

### 1.1 Citizen verification — privacy model (keep as-is)
- Flow: [`apps/expo/hooks/useVerification.ts`](../../../apps/expo/hooks/useVerification.ts), [`apps/expo/lib/citizen-commitment.ts`](../../../apps/expo/lib/citizen-commitment.ts), form at [`apps/expo/app/verification/request-citizen/form.tsx`](../../../apps/expo/app/verification/request-citizen/form.tsx).
- The app computes `commitment = Poseidon(keccak(firstName), keccak(lastName), keccak(birthdate), keccak(address), salt)`; `salt` is deterministically derived by signing a fixed EIP-712 message with the wallet key.
- **On-chain:** only `evidenceURI = "commit:0x…"` via `CitizenNFT.createAttestationRequest()`. **Supabase `request_evidence`:** the same commitment + `redacted: true` metadata. **Device secure-store:** the plaintext preimage (`citizen-preimage:<wallet>`), never transmitted.
- **Verdict:** GDPR-clean, one-way, future-proof for zk uniqueness proofs. **No change needed.**

### 1.2 On-chain identity contracts
- [`CitizenNFT.sol`](../../../contracts/governor-contract/contracts/verification-system/CitizenNFT.sol) — soulbound `ERC721Votes`. Mint requires `requiredAttesterSignatures` (1) + `requiredCitizenSignatures` (1). Revocation requires `requiredRevocationAttesterSignatures` (1) + `requiredRevocationCitizenSignatures` (1). Rejection requires `requiredAttesterRejections` (1) + `requiredCitizenRejections` (1). All six are `onlyOwner`-mutable (`setAttestationRequirements` / `setRevocationRequirements` / `setRejectionRequirements`, lines 323-345), floored at ≥1. O(1) burn via `_tokenIdByOwner`. `migrationMint` + one-way `finalizeMigration` (lines 142-163).
- [`AttesterNFT.sol`](../../../contracts/governor-contract/contracts/verification-system/AttesterNFT.sol) — soulbound. Mint/revoke at a flat **2-of-N** (`requiredSignatures=2`, `requiredRejections=2`).
- **No live count of attesters/citizens is exposed today** — the contracts track `hasX` mappings but no aggregate counter. Percentage thresholds need one (see §3.2).

### 1.3 Governance + privacy voting
- [`MaciAttesterGovernor.sol`](../../../contracts/governor-contract/contracts/verification-system/MaciAttesterGovernor.sol) — only AttesterNFT holders `propose()`; voting is MACI v2 (encrypted ballots, Groth16-proven tally). 1 CitizenNFT → 1 MACI signup → 1 vote via the immutable `SignUpTokenGatekeeper`. Coordinator key is **Shamir 3-of-5** across attesters. Quorum = `quorumPercentage` (10%) with `quorumAbsolute` floor (2) — **this is the percentage+floor pattern we mirror for the NFT thresholds.**

### 1.4 Circles v2 "Röbel-Münzen" (second Sybil layer)
- Group `0xAc2C…470c` (RCRC), vault `0x0476…8763`, gated by [`CitizenMembershipCondition.sol`](../../../contracts/governor-contract/contracts/verification-system/CitizenMembershipCondition.sol) → `citizenNFT.hasCitizenNFT(avatar)`.
- Adds **economic Sybil cost** (96 personal CRC burned per `registerHuman`) + a **transparent on-chain trust graph**. But entry still requires a CitizenNFT → **inherits the attester trust root**. State doc: [`docs/CIRCLES_ROEBEL_MUENZEN_STATE.md`](../../CIRCLES_ROEBEL_MUENZEN_STATE.md).

### 1.5 Deployed addresses (split today)
| | Base (8453) — **production** | Gnosis (100) — Circles only |
|---|---|---|
| CitizenNFT | `0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB` | `0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4` (migration **finalized**) |
| AttesterNFT | `0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb` | `0x7bD6Fd97385BCCf6000380ADd3BF19737c6063C4` |
| MACI / Governor / Timelock | live (`0x76e0…`, `0xCd3b…`, `0xc930…`) | **none** |
| Owner | Timelock (governance) | 3-of-5 Attester Safe `0x3A08…BFDEa` |

Manifests: [`deployments/base.json`](../../../contracts/governor-contract/deployments/base.json), [`deployments/gnosis.json`](../../../contracts/governor-contract/deployments/gnosis.json), [`packages/blockchain/src/index.ts`](../../../packages/blockchain/src/index.ts).

---

## 2. Goals & the Sybil reframe

**Primary goal:** strengthen *one-human-one-identity* without on-chain PII and without the guarantee resting solely on trusting attesters.

**Critical reframe (informs every threshold choice):**

| Action | What it does | Effect on Sybil resistance |
|---|---|---|
| **Attestation** (mint) ← *the Sybil lever* | Adds a new citizen | **Harder = more Sybil-resistant.** Stops fakes entering. |
| **Revocation** (burn) | Removes a citizen | **Harder = slightly *less* Sybil-resistant** (fakes harder to evict) **but** protects honest citizens from malicious removal. |
| **Rejection** (veto a pending request) | Blocks a bad request | Harder = easier to push questionable requests through; easier = a small clique can censor good requests. |

So: **raise attestation**, **harden revocation deliberately (for censorship-resistance, not Sybil)**, and **tune rejection** so a minority can flag-but-not-unilaterally-block. All three become percentage-based.

---

## 3. Hardened contract design (fresh Gnosis deploy)

### 3.1 Threshold model: percentage-band **(floor + cap)** OR fixed; creation-time snapshot
Each gate is either a **percentage band** `(percentBps, floor, cap)` or a **fixed count**, computed against the **set size snapshotted when the request is created** (so the bar can't move mid-request):

```
band(setSize, percentBps, floor, cap) = clamp(ceilDiv(setSize * percentBps, 10000), floor, cap)
ceilDiv(a, b) = (a + b - 1) / b         clamp(x, lo, hi) = min(hi, max(lo, x))
```

**Gate type is chosen by how often the gate fires** (the scaling insight):
- **Fixed count** — for *high-throughput* gates where onboarding cost must stay constant as the population grows (the **citizen co-sign** — a % here would mean 100 signers at 1,000 citizens; a killer for adoption).
- **Percentage band, no cap** — for *rare, must-stay-strict* gates (citizen **revocation**) so the bar scales up with the set.
- **Percentage band, with cap** — for *mid* gates (attester-side of onboarding, rejection) so they scale but never explode beyond an operationally sane number of signers.

Other rules:
- `percentBps` in basis points (6700 = 67%) to avoid integer-division loss.
- `floor` governs while the set is small; `cap` bounds it once the set is large.
- **Snapshot** `attesterCountAtCreation` / `citizenCountAtCreation` into the `Request` struct at `createAttestationRequest` / `createRevocationRequest`. Avoids "moving goalposts" if someone is added/removed while a request is open.

### 3.2 New contract state (both NFTs)
- Add `uint256 public attesterCount;` (AttesterNFT) and `uint256 public citizenCount;` (CitizenNFT) — incremented on mint (incl. constructor + `migrationMint`), decremented on burn. Expose `attesterCount()` view on AttesterNFT so CitizenNFT can read the attester denominator (extend `IAttesterNFT`).
- Replace the six absolute thresholds with `(percentBps, floor)` pairs; keep governance-mutable setters (now setting bps + floor, validated so the effective minimum can never drop below a safe floor, e.g. floor ≥ 1, and revocation floor ≥ 2).
- Keep `migrationMint` / `finalizeMigration` (we need it for the cutover), soulbound `_update`, O(1) burn, `emergencyMint` revert.

### 3.3 Recommended starting parameters (scale-aware)

| Gate | Type | Params | @5 att / 15 cit | @10 att / 100 cit | @20 att / 1,000 cit | Rationale |
|---|---|---|---|---|---|---|
| **Join — attester side** | band+cap | **30%**, floor 2, cap 7 | 2 | 3 | 6 | Your 10→3; scales, capped so onboarding stays fast |
| **Join — citizen side** | **fixed** | **1** | 1 | 1 | **1** | Low onboarding friction. Safe because of the no-double-sign invariant (a real, separate citizen must vouch). |
| **Attester mint** | band+cap | 50%, floor 3, cap 7 | 3 | 5 | 7 | Majority of the small, curated attester set; rare |
| **Revoke citizen — attester side** | band, **no cap** | 67%, floor 3 | 4 | 7 | 14 | **Deliberately hard** (anti-malicious-removal); the supermajority is what blocks small-group revocation — D1 |
| **Revoke citizen — citizen side** | **fixed** | **1** | 1 | 1 | 1 | One citizen in the loop; the anti-clique guarantee comes from the attester supermajority, not this |
| **Attester revocation** | band+cap | 50%, floor 3, cap 7 | 3 | 5 | 7 | Mirrors attester mint |
| **Rejection (each side)** | band+cap | 25%, floor 2, cap 5 | 2 | 3 | 5 | Minority can flag, can't unilaterally veto |

**Critical invariant (MUST hold in v2):** a single wallet contributes to **at most one role per request** — one approval per `msg.sender`, single-role via `signAsAttester`. Verified present in current [`CitizenNFT.sol:206`](../../../contracts/governor-contract/contracts/verification-system/CitizenNFT.sol#L206) + [`:217-223`](../../../contracts/governor-contract/contracts/verification-system/CitizenNFT.sol#L217-L223). **v2 keeps it; a dedicated test asserts a dual Attester+Citizen holder cannot satisfy both halves alone.** (This is *why* citizen co-sign can safely be 1.) Note the boundary: it stops one *wallet* double-counting, not one *person* using two separate wallets — that's covered by the revocation supermajority + Circles cost + Self.xyz.

**Anti-clique guarantee:** join needs **≥2 attesters + 1 citizen = ≥3 distinct people**; revocation needs **≥3 attesters (floor) + 1 citizen = ≥4 distinct people**, scaling to 14+1 at 20 attesters — so "two people revoke everyone" is structurally impossible. Onboarding stays cheap (2 attesters + 1 citizen today). Every value is **governance-mutable post-deploy**.

> **Decision D1 — revocation attester % (now the only revocation sub-choice; citizen side fixed at 1):**
> recommend **67% + floor 3, no cap** (4-of-5 today → 14-of-20). Stricter = **80%**; easier-to-evict-fakes = **50%**. The chosen % is the entire anti-clique strength of revocation, so don't go below ~60%.

### 3.4 What does NOT change
- Poseidon-commitment privacy flow (§1.1).
- Soulbound semantics, O(1) burn, dual-role `signAsAttester` logic, MACI gatekeeper pattern.
- Circles integration shape (only the CitizenNFT address it points at changes — §4.6).

### 3.5 Re-attestation & expiry — DECIDED, scale-aware renewal
CitizenNFT carries a `validUntil`. After it lapses the NFT goes **dormant** (no vote weight, fails the Circles gate) until renewed — it is *not* burned, so there's no revocation ceremony. **Renewal must NOT use the full attestation quorum** (that wouldn't scale); it's cheap and tiered:

1. **Activity / liveness auto-renew (default):** `validUntil` auto-extends whenever the citizen does something that proves they're a live, present human — casts a MACI vote, or has fresh Circles activity (recent `personalMint` / live trust edges). **Zero friction, zero signers.** Prunes only genuinely-abandoned accounts.
2. **Self.xyz re-proof (strongest, Phase 2):** a Self-verified citizen just re-runs the proof — renews *and* re-confirms uniqueness with **no human signers**. Scales perfectly.
3. **Light social renewal (fallback):** a **single** citizen vouch (not the full quorum) re-confirms someone who's been offline.

Purpose = **voter-roll hygiene** (keep quorum math honest, drop ghosts/burners/people who left town), **not** primary Sybil defense — entry thresholds + Circles + Self handle that. Renewal period + grace window are governance-set (e.g. 12 months + 1 month grace). On-chain cost: one `uint64 validUntil` per citizen.

---

## 4. Migration plan — full consolidation to Gnosis

> Net effect: identity + governance + currency all on Gnosis; Base retired. The Gnosis CitizenNFT's `migrationFinalized = true` is *why* we deploy fresh contracts (we can't re-`migrationMint` the existing ones) — which is also where we slot in the hardened logic. Convenient.

### 4.1 Enumerate the full citizen + attester set (deploy-time, read-only)
- **Citizens** = the 15 in [`gnosis.json`](../../../contracts/governor-contract/deployments/gnosis.json) **∪** post-snapshot Base citizens.
- **Base stragglers:** filter `CitizenNFTMinted(address,uint256,uint256)` (indexed) on the Base CitizenNFT `0x7eF8…61BB` from the migration block, diff against the 15 known addresses. (Script to be added under `contracts/governor-contract/scripts/`; output a deduped checksummed address array.) — *todo, see §7.*
- **Attesters** = the 5 in `gnosis.json` (cross-check Base `AttesterNFTMinted`).

### 4.2 Deploy fresh contracts on Gnosis (burner = temporary owner)
1. `AttesterNFT` v2 (founding attesters in constructor; percent+floor params).
2. `CitizenNFT` v2 (wired to new AttesterNFT; founding citizens; percent+floor params incl. hardened revocation).
3. Verifier + VkRegistry (reuse circuit artifacts if unchanged), Poseidon libs, `SignUpTokenGatekeeper` **bound to the new CitizenNFT**, VoiceCreditProxy, Poll/MessageProcessor/Tally factories, MACI core.
4. `TimelockController` (1h min delay) + `MaciAttesterGovernor` (set `coordinatorPubKey` = **existing Shamir pubkey** — same key, Shamir shares stay valid).

### 4.3 Seed identity, then lock
1. `attesterNFT.migrationMint([all attesters])` → covers any beyond the 3 founders.
2. `citizenNFT.migrationMint([all citizens])` (15 + stragglers; idempotent, skips existing).
3. Verify counts/holders on-chain.
4. `attesterNFT.finalizeMigration()` + `citizenNFT.finalizeMigration()`.

### 4.4 Wire ownership / governance
- Transfer `AttesterNFT` + `CitizenNFT` ownership → **Timelock** (so thresholds are governance-controlled), matching Base's model. (Decision D2: keep NFT ownership under the **3-of-5 Safe** instead, for faster ops, vs Timelock for full on-chain governance. Base used Timelock; Gnosis currently uses the Safe.)
- Grant Governor `PROPOSER_ROLE` + `CANCELLER_ROLE` on the Timelock; renounce deployer admin.
- **Sweep the burner** — move any residual xDAI out; never reuse the key.

### 4.5 Coordinator
- Re-point the Fly coordinator infra at Gnosis (RPC, new MACI/Governor addresses, new deploy block). Reuse the **same coordinator keypair** (Shamir federation unchanged). Update `COORDINATOR_ETH_PRIV` funding on Gnosis (xDAI).

### 4.6 Circles re-point
- Redeploy `CitizenMembershipCondition` pointing at the **new** CitizenNFT, then `BaseGroup.setMembershipCondition(newCondition, true)` via the Safe. (Until then the group's manual trust-list still works for existing members.)

### 4.7 App + package re-wire (the bulk of the work)
- [`packages/blockchain/src/index.ts`](../../../packages/blockchain/src/index.ts) — make Gnosis the default export set.
- Expo: [`constants/verification-contracts.ts`](../../../apps/expo/constants/verification-contracts.ts) (`chain: base` → `gnosis`, new addresses), [`constants/thirdweb.ts`](../../../apps/expo/constants/thirdweb.ts) (`export const chain`), [`context/MaciContext.tsx`](../../../apps/expo/context/MaciContext.tsx) (chain + `MACI_DEPLOY_BLOCK`), env vars (`NEXT_PUBLIC_CITIZEN_NFT`, `NEXT_PUBLIC_ATTESTER_NFT`, `NEXT_PUBLIC_GOVERNOR`, RPC), `app.config.ts` extras.
- Web: `apps/web/src/lib/verification-contracts.ts`, coordinator dashboard chain refs.
- Update the commitment EIP-712 `chainId` to 100 in [`lib/citizen-commitment.ts`](../../../apps/expo/lib/citizen-commitment.ts) — **note:** this changes the derived salt, so document that existing device preimages remain valid for their *original* commitment (already on the new chain via migrationMint, so no re-request needed); only *new* requests use chainId 100.

### 4.8 MACI re-signup
- Every citizen re-signs up on the new Gnosis MACI before they can vote. Voter keys are **wallet-derived/deterministic** (per project memory), so this is automatic + multi-device safe. Add a one-time in-app prompt.

### 4.9 Cutover & decommission Base
- Ship the re-wired app to production (full build, not preview — that's the step that was missed last time).
- Announce; freeze new Base attestations (optional: a Base governance proposal to raise attestation thresholds sky-high, or simply stop surfacing the Base flow in-app).
- Keep Base contracts readable for history; mark archived in manifests.

---

## 5. Sybil hardening beyond thresholds

A menu, roughly in order of value/effort.

1. **Harder, scaling attestation thresholds** — §3 (done in this plan; highest leverage, zero new trust).
2. **Random attester assignment** — when a request opens, require sign-off from a *pseudo-randomly selected* subset of attesters (seeded by blockhash/request id) rather than any self-selected pair. Raises collusion cost (a colluder can't guarantee they're assigned). On-chain: assignment stored in the Request; no PII. Medium effort.
3. **Periodic re-attestation / expiry** — CitizenNFT carries a `validUntil`; lapses require re-vouching. Catches stale/abandoned/burner identities. On-chain: a timestamp. Low-medium effort; UX cost.
4. **Attester stake / slashing** — attesters post a refundable bond (xDAI or RCRC); a successful revocation of someone they vouched for slashes it. Aligns incentives against careless/colluding vouching. Higher effort + economic design.
5. **Trust-graph Sybil detection (off-chain analytics)** — run SybilRank/centrality on the Circles trust graph + the attestation graph to *flag* suspicious clusters for human review (the admin console already has the graph data in `apps/web/src/lib/muenzen/`). No on-chain change; advisory only.
6. **Self.xyz personhood nullifier** — §6. The only option that removes reliance on attesters entirely. Phase 2.

---

## 6. Phase 2 — Self.xyz proof-of-personhood nullifier

**Goal:** a *one-human-one-CitizenNFT* guarantee that does **not** depend on trusting attesters, with **no PII on-chain**. (eID provider = **Self protocol / self.xyz only**, per Max.)

**How Self works (privacy-preserving personhood, not full KYC):**
- The user scans their government document's NFC chip (biometric passport / supported eID) in the **Self mobile app**. The chip is signed by the issuing state.
- Self generates a **zero-knowledge proof** that the document is genuine and, *optionally*, one selective attribute (e.g. age ≥ 18, nationality = DE, not on a sanctions list) — **without revealing name, photo, document number, or DOB**.
- It emits a **scope-specific nullifier**: a deterministic value tied to the document but scoped to *our* app, revealing nothing about identity. Same person → same nullifier → **one document can mint exactly one CitizenNFT.** That's the Sybil guarantee.
- Trust shifts from "attesters are honest" → "the document issuer + Self's proving/verification system are sound." Attesters become a **fallback** (for people without an eligible document), not the sole gate.

**On-chain shape:** a trusted Self verifier (or a backend relayer that verifies the Self proof via the Self SDK / Identity Hub) calls `selfAttest(citizen, nullifier, attestationData)` on CitizenNFTv2. The contract records `usedNullifier[nullifier] = true` (revert on reuse) and mints with `attestationSource = SelfPersonhood`. **On-chain data = just the nullifier hash** (+ any attribute we explicitly require). Fits the no-PII rule.

**Extension point already shipped in v2 (D6):** `attestationSource` enum (`AttesterMultisig | SelfPersonhood`) is recorded on every mint today. Phase 2 adds a `selfVerifier` address + `selfAttest` path — a setter + a function, **not another migration**.

**Open validation items to confirm before the Phase-2 build (established-knowledge, verify against current Self docs):**
- **Where verification runs:** Self's on-chain Identity Verification Hub has lived on **Celo**. Confirm a Gnosis deployment exists, else verify off-chain via the SDK in a relayer and gate `selfAttest` on a trusted verifier key (simplest; keeps Gnosis-only). 
- **German document coverage:** the **Reisepass (passport, ICAO eMRTD/NFC)** is the reliable path. The **Personalausweis eID** function has restricted NFC access (Berechtigungszertifikat / terminal auth) and may not be readable by a third-party app like Self — so not every citizen can use Self. This is exactly why the attester path stays as the always-available fallback.
- **Nullifier scope/rotation semantics** (per-app scope; behaviour on document renewal).

---

## 7. Decisions log

- **D1 — Revocation attester % — DECIDED: 67% + floor 3, no cap.** Citizen side fixed at 1. (§3.3)
- **D2 — NFT ownership — DECIDED: Safe-owned.** Gnosis Safe `0x3A08…` (now **3 owners**, more to be added → decentralizing). Threshold changes = Safe tx; revisit Timelock handover once the community matures. (§4.4)
- **D3 — Thresholds — RESOLVED (table in §3.3).** Join: **30% attester (cap 7) + fixed 1 citizen**. Revoke: **67% attester (D1) + fixed 1 citizen**. Attester mint/revoke & rejection: % + cap. **No-double-sign invariant** mandatory in v2 + asserted by test.
- **D4 — Random attester assignment — DEFERRED** to v2.1 (marginal at 5 attesters; revisit at 10+).
- **D5 — Re-attestation expiry — DECIDED: include**, scale-aware renewal per §3.5.
- **D6 — Self.xyz extension point — DECIDED: reserve `attestationSource` enum** in the v2 CitizenNFT now.

## 8. Risks & rollback
- **Re-deploy churn** — this is the Nth rotation on Base (see archived addresses). Consolidating to Gnosis *stops the churn* by unifying chains. Keep the manifest as source of truth.
- **MACI re-signup friction** — mitigated by deterministic wallet-derived keys.
- **Coordinator continuity** — same key + Shamir shares; only RPC/addresses/funding change.
- **Circles continuity** — manual trust-list keeps existing members working during the condition swap; no user-visible downtime if sequenced right.
- **Rollback** — until the app cutover ships, Base remains fully live; Gnosis deploy can be validated end-to-end (one test citizen, one test proposal, one tally) before flipping the app.

## 9. Execution order (once approved)
1. Resolve D1–D6.
2. Implement v2 contracts (`AttesterNFT`, `CitizenNFT`) + tests (Hardhat).
3. Straggler-enumeration script → final citizen/attester arrays.
4. Dry-run deploy on Gnosis (burner) → validate → seed → finalize → wire governance → sweep burner.
5. Re-point Circles + coordinator.
6. Re-wire apps/packages; ship **production** build.
7. MACI re-signup prompt; end-to-end smoke (citizen → proposal → vote → Shamir tally).
8. Decommission Base; update manifests + CLAUDE.md + memory.
