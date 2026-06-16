# Citizen Verification: PII-free Evidence + Sybil Resistance

**Date:** 2026-06-16 (revised 2026-06-17)
**Status:** Approved direction — re-sequenced into Circles v2 **Phase 0 (Gnosis)**. Implementation plan next.
**Apps touched:** `apps/expo` (client + Supabase migration), `contracts` (redeployed `CitizenNFT` keeps a generic commitment slot). **No new on-chain Sybil logic.**

## What changed in this revision (read first)

1. **Re-sequenced into Circles v2 Phase 0.** This work is built against **Gnosis**, folded into the
   identity/governance migration (`CIRCLES_V2` spec §4), not as a separate Base project. The Phase 0
   soulbound **re-mint ceremony** is the clean cutover where all current citizens are re-issued and
   re-verified — so the commitment is captured for everyone at re-mint (no opportunistic backfill).
2. **The cryptographic uniqueness nullifier is DEFERRED**, not shipped in Phase 0. Phase 0 relies on
   the **attester social layer** as the primary Sybil gate (sufficient at current scale), reserves a
   **generic commitment slot** on-chain, and kills the live PII leak. The nullifier primitive — and
   the choice of its input — lands with the Circles **§8 privacy workstream**.
3. **The nullifier input is an explicit OPEN decision** (see §6). Name+birthdate is *not* committed.

## Problem

1. **DSGVO / reversible PII (live leak — fix tonight).** The on-chain `evidenceURI` is only the
   placeholder `supabase://pending`, so no PII is on-chain today. The PII sits in Supabase
   `request_evidence.evidence_data`, "encrypted" with a key derived deterministically as
   `SHA-256("${walletAddress}:8453:evidence-encryption-v2")`
   ([`apps/expo/lib/encryption.ts:287-339`](../../../apps/expo/lib/encryption.ts)). The algorithm is
   in the open-source client and the wallet address is public, so **anyone with read access can
   recompute the key and decrypt the name.** Reversible encryption, not protection.

2. **Sybil / duplicate accounts.** The contract enforces 1 NFT per *wallet*, but nothing stops
   **one human → many wallets → many attesters → many CitizenNFTs.** Under Circles v2 this also means
   **many human avatars → double UBI + double Röbeltaler minting**, not just a double vote.

## Sybil resistance is layered — attester-first

The primary Sybil gate **is and remains the attester social layer.** At the current cohort (≈15
citizens, a handful of attesters who personally know every applicant), attestation is the *real*
guarantee — a human who knows you will not attest your second account. A cryptographic nullifier is a
**backstop whose value grows only as the town scales past "everyone knows everyone."** We therefore
do **not** overstate what any v1 nullifier buys, and we do not build one before scale (or the §8
privacy work) demands it. Phase 0 leans on attesters by design.

## Goals

- Remove all recoverable PII from server storage (tonight) and keep it off every public surface.
- Capture a **generic, privacy-preserving commitment** per citizen at the Phase 0 re-mint, anchored
  in a reserved `evidenceURI` slot, usable by future dispute/age/uniqueness work.
- Collect **birthdate** for future age-gated voting (kept on-device inside the commitment, never
  server-side).
- Keep the door open for a future **cryptographic uniqueness primitive** without baking in its input.

## Non-goals (Phase 0)

- **No cryptographic nullifier** in Phase 0 (deferred to §8; see §6).
- No on-chain Sybil logic; the redeployed `CitizenNFT` only *reserves a generic commitment slot*.
- No reversible PII stored anywhere, ever (GDPR position, §7).

## Trust model

- **Sybil (Phase 0):** attester social layer, primary and sufficient at current scale.
- **Attester verification:** offline / social ("Land First"). The app shows **no PII** — only the
  commitment hash, the claim, the requester's display name, and (later) any duplicate flag.
- **On-chain vs off-chain is coupled to the primitive choice (§6)** — not an independent axis.

## Two primitives — one ships, one is deferred

| Job | Primitive | Status | Lives |
|---|---|---|---|
| **Confidentiality + future-proofing** | `commitment = Poseidon(identity fields, salt)` | **Ships Phase 0** | hash in `evidenceURI` (on-chain, salted/high-entropy → safe on a public chain) + preimage **on-device only** |
| **Sybil uniqueness** | nullifier (input + scheme OPEN) | **Deferred to §8** | TBD — see §6 |

### Commitment (ships in Phase 0)

- **Poseidon** over field-encoded identity fields + a salt (SNARK-friendly → cheap future
  dispute/age circuits). The string→field encoding is a **frozen** function.
- **Salt = wallet-derived, deterministic** — reuse the existing **wallet-derived MACI voter-key**
  mechanism (a signature requires the private key, so it is confidential *and* reproducible
  multi-device; it is **not** the address-derived bug). ⚠️ Phase 0 moves accounts to **Safe** smart
  accounts (Circles Spike #1) which sign via **ERC-1271** — reuse the MACI voter-key signing path,
  which already handles deterministic multi-device signing on this stack; verify under ERC-1271.
- **Preimage stays on-device** (`expo-secure-store` cache; re-derivable from the wallet signature).
- **birthdate** is inside the commitment → enables a later "age ≥ 18" ZK proof without revealing it.
- **On-chain `evidenceURI`** carries `commit:0x<poseidon>` — a generic, non-reversible slot. The
  redeployed `CitizenNFT` keeps this as a **generic commitment slot**; we do not bind it to any
  specific future primitive.

> The commitment provides **confidentiality + future-proofing only**. It does **not** provide Sybil
> resistance (salt is per-citizen). Sybil is the attester layer (now) and the deferred nullifier (later).

## 6. The uniqueness nullifier — explicitly deferred, input OPEN

The cryptographic uniqueness primitive lands with the **§8 privacy workstream**. Its design is
**non-blocking** for Phase 0 and is captured here as an open decision, not a commitment.

### 6.1 Input choice is OPEN — do NOT bake in name+birthdate

`HMAC/OPRF(name, birthdate)` is tempting but rejected as a bake-in because the input is:
- **Low-entropy / enumerable** — brute-forceable even under OPRF if the input space is small (a
  5,000-person town is enumerable). OPRF protects the *key*, not a guessable *input*.
- **Collidable** — same name + exact birthdate ⇒ identical output, falsely excluding a real human;
  this worsens as the check distributes across the federation.
- **Permanent PII** — a forever-stable identity hash conflicts with GDPR erasure.

**Strong long-term candidate:** a **privacy-preserving, service-specific pseudonym** from the German
**eID / EUDI Wallet** under **eIDAS 2.0** — gives uniqueness *without storing identity*, full-entropy,
sector-scoped, and revocable/erasable by design. Documented as the leading direction; **not committed.**

### 6.2 On-chain vs off-chain is coupled to HMAC vs OPRF

These are **not** independent axes:
- **HMAC v1 ⇒ off-chain, necessarily.** A low-entropy peppered hash on a public chain (Gnosis is
  fully transparent, Circles §8) is exposed; it must stay off-chain. But an off-chain check is a
  **trusted-server, single-operator Sybil check** — inconsistent with our threat model (the same
  reason the MACI coordinator key is Shamir-split, not a lone secret). HMAC v1 is an **interim
  stepping stone with a known single-operator limitation**, not the endgame.
- **Threshold-OPRF ⇒ distributes the check across the Shamir federation.** The upgrade's point is
  **not merely "remove the pepper"** — it is **distributing the uniqueness check across the same
  federation** that already holds the coordinator key, so no single operator can compute or forge a
  nullifier. With a **full-entropy** input (e.g. an eID pseudonym), the output is no longer
  brute-forceable, so the **endgame may put the nullifier on-chain for trustless dedup** — closing
  the trusted-server gap entirely.

### 6.3 Trajectory

`attester-only (Phase 0)` → `HMAC single-pepper, off-chain, interim (single-operator, acknowledged)`
→ `threshold-OPRF on the Shamir federation` → `possibly on-chain, trustless, full-entropy input`.
Bound to the **§8 privacy milestone**; the input decision (§6.1) is made there.

## 7. GDPR position (explicit)

**Store no reversible PII, anywhere, ever.** Server-side: the scrub removes the existing reversible
blob; new flow stores only the non-reversible commitment + non-PII metadata. Device-side: the
preimage is salted and re-derivable, never uploaded. The deferred nullifier must satisfy the same
rule — which is why the **eID-pseudonym route (§6.1) is favored: it delivers uniqueness without
persisting identity, and is erasable**, resolving the permanent-nullifier-vs-erasure tension by design.

## 8. Phase 0 scope — what actually ships

1. **Tonight (independent, urgent):** scrub `evidence_data` + encryption columns from
   `request_evidence` in Supabase (live leak, chain-independent). Reserve the **generic commitment
   slot** (`evidenceURI`) in the redeployed `CitizenNFT` design. **Do not bake any nullifier.**
2. **At Phase 0 re-mint (Gnosis):** PII-free request flow — collect identity fields incl.
   **birthdate**, derive wallet-bound salt, compute Poseidon **commitment**, write `commit:0x…` to
   `evidenceURI`; store only non-PII server-side. Capture the commitment for **all current citizens**
   at re-mint (this is the backfill).
3. **Attester view:** PII-free — claim + display name + commitment hash; offline verification.
4. **Attester-upgrade prefill** reads the preimage from device secure-store, not from server decrypt.

## Legacy / backfill

Backfill is **at re-mint**: because Phase 0 re-issues all soulbound NFTs, every current citizen gets
a fresh commitment during their re-verification. No opportunistic drip, no forced *extra*
re-verification (it rides on the migration that is happening anyway).

## Circles v2 coupling (why this is cheap now)

- The edge-function / server layer is chain-agnostic and ports unchanged.
- `CitizenNFT` is redeployed on Gnosis anyway → reserving the generic commitment slot is free.
- `CitizenNFT` is the Circles group membership gate (§5.2), so the future nullifier protects **UBI +
  currency**, not only votes — reinforcing that the primitive belongs with the §8 privacy work.
- Gnosis is fully public (§8) → confirms commitment-on-chain (salted, safe) / nullifier-off-chain
  (until full-entropy) split.

## Impacted files (initial map)

- `apps/expo/app/verification/request-citizen/form.tsx` — add birthdate; PII-free submit path.
- `apps/expo/app/verification/request-attester/form.tsx` — prefill from secure-store, not decrypt.
- `apps/expo/lib/encryption.ts` — remove address-derived key path; add wallet-bound salt + Poseidon
  commitment helper (frozen string→field encoding).
- `apps/expo/lib/verification-types.ts` — evidence shape becomes commitment + non-PII metadata.
- `apps/expo/hooks/useVerification.ts` — write `commit:0x…` to `evidenceURI` (Gnosis); non-PII row.
- `apps/expo/lib/supabase-verification.ts` — non-PII row only.
- `apps/expo/app/verification/request/[id].tsx` — PII-free attester view.
- `apps/expo/supabase/migrations/*` — **tonight:** scrub `evidence_data`.
- `contracts/.../CitizenNFT.sol` (Gnosis redeploy) — keep `evidenceURI` as a generic commitment slot.

## Open decisions (non-blocking for Phase 0)

1. **Nullifier input** — eID/EUDI service-specific pseudonym (favored) vs. another full-entropy
   source. Decided at §8. (§6.1)
2. **Nullifier on-chain vs off-chain** — coupled to HMAC→OPRF and input entropy (§6.2). Decided at §8.
3. Committee/attester canonical count (Circles §7 open item) — affects who holds the future threshold
   OPRF / pepper shares.

## Risks (accepted)

1. **No technical Sybil backstop between Phase 0 and §8** — accepted: the attester layer is the
   primary gate and is sufficient at current scale.
2. HMAC interim stage (if used before §8) is a single-operator trusted-server check — acknowledged,
   superseded by threshold-OPRF.
3. Wallet-bound salt determinism under Safe/ERC-1271 — de-risked by reusing the MACI voter-key path;
   verify in Circles Spike #1.
