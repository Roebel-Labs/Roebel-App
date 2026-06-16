# Citizen Verification: PII-free Evidence + Sybil Resistance

**Date:** 2026-06-16
**Status:** Approved design — pending implementation plan
**Apps touched:** `apps/expo` (client + Supabase edge function + migration). **No smart-contract changes.**

## Problem

Two issues in the CitizenNFT verification request flow:

1. **DSGVO / reversible PII.** The form collects `name` + `address`
   ([`apps/expo/app/verification/request-citizen/form.tsx:29-30`](../../../apps/expo/app/verification/request-citizen/form.tsx)).
   The on-chain `evidenceURI` is only the placeholder `supabase://pending`, so no PII goes
   on-chain or to IPFS today. The real PII sits in Supabase `request_evidence.evidence_data`,
   "encrypted" with TweetNaCl — but the key is derived deterministically as
   `SHA-256("${walletAddress}:8453:evidence-encryption-v2")`
   ([`apps/expo/lib/encryption.ts:287-339`](../../../apps/expo/lib/encryption.ts)). Because that
   algorithm is in the open-source client and the wallet address is public, **anyone with read
   access to that table can recompute the key and decrypt the name.** It is reversible
   encryption, not protection. This is the real leak to kill.

2. **Sybil / duplicate accounts.** The contract enforces 1 NFT per *wallet*
   (`hasCitizenNFT`, [`CitizenNFT.sol:257`](../../../contracts/governor-contract/contracts/verification-system/CitizenNFT.sol)),
   but nothing stops **one human → many wallets → many attesters → many CitizenNFTs → many votes.**
   In a 5,000-person town, two different attesters can independently verify the same person.

## Goals

- Remove all recoverable PII from server storage and from any public surface.
- Detect when one human tries to obtain a second CitizenNFT across wallets, and surface it to
  an attester before approval.
- Collect **birthdate** — sharpens uniqueness and enables future age-gated voting.
- Require **no smart-contract changes** (no redeploy, no governance proposal).

## Non-goals

- No on-chain nullifier mapping (would leak low-entropy identity hashes publicly).
- No OPRF / blind-nullifier in v1 (plaintext transits the edge function in-memory; accepted under
  the trust model). OPRF is the clean future upgrade if plaintext-to-server must be eliminated.
- No ZK preimage-dispute circuit and no age-proof circuit yet — the data (Poseidon commitment over
  birthdate) is preserved so these can be built later without re-collecting identities.
- No forced town-wide re-verification of existing citizens.

## Trust model (decided)

- **Sybil anchor:** off-chain, server-peppered HMAC nullifier. Trust = Supabase edge function
  (holds the pepper) + attesters.
- **Attester verification:** offline / social ("Land First"). The app shows **no PII** to the
  attester — only a commitment hash, the claim, the requester's display name, and a possible-duplicate flag.
- **Enforcement boundary (stated honestly):** the nullifier check runs at the **app + attester
  layer, not the contract.** A sophisticated attacker crafting raw transactions can bypass the app
  and skip the nullifier entirely; the realistic threat — an ordinary resident opening a second
  account *through the app* — is caught, with the attester as the human backstop.

## Two primitives, two jobs

| Job | Primitive | Lives | Readable by |
|---|---|---|---|
| **Confidentiality** of identity | `commitment = Poseidon(firstName, lastName, birthdate, address, salt)` | commitment on-chain (`evidenceURI`) + in Supabase; preimage re-derivable on device | nobody but the citizen |
| **Sybil uniqueness** | `nullifier = HMAC-SHA256(serverPepper, canonical(firstName, lastName, birthdate))` | computed in an edge function; pepper never leaves the server | nobody without the pepper |

The commitment provides **confidentiality + future-proofing only — it does NOT provide Sybil
resistance** (the salt is per-citizen, so one person could mint two different commitments). The
nullifier is the Sybil layer. Poseidon (not SHA-256) is used for the commitment so the future
dispute/age circuits are cheap; the string→field encoding (e.g. `keccak256(str) mod p` per field)
is a **frozen** function — changing it invalidates every existing commitment.

### Salt derivation (corrected)

The salt is **derived from a one-time EIP-712 wallet signature** over a fixed domain message —
mirroring the existing wallet-derived MACI voter-key pattern. A signature requires the private key
(not public, unlike the wallet address), so the salt is confidential; it is deterministic, so it is
**multi-device and recoverable** (lose the phone, re-sign, reproduce the commitment). `expo-secure-store`
caches the preimage for UX (e.g. the attester-upgrade prefill) but is **not** the source of truth.

> This deliberately avoids both prior pitfalls: random-salt-in-secure-store (unrecoverable on device
> loss) and address-derived keys (publicly reversible — the current bug).

## Data flow — new request

1. Form collects `firstName`, `lastName`, **`birthdate`** (new, required, with a sane range check),
   and `address`.
2. Device obtains the salt via a one-time EIP-712 signature, computes `commitment`, caches
   `{preimage, salt, commitment}` in `expo-secure-store`.
3. Device calls `createAttestationRequest("commit:0x<poseidon>")` on CitizenNFT → parses `requestId`
   from the `AttestationRequestCreated` event (unchanged contract behavior). The on-chain request is
   gasless and carries only the non-reversible commitment.
4. Device calls edge function **`compute-citizen-nullifier`** over TLS with plaintext identity +
   `commitment` + requester wallet + the freshly-obtained `requestId`. The edge function:
   - Canonicalize identity with the **frozen** `canonicalizeIdentity()` (NFKC, lowercase, trim,
     collapse whitespace, German transliteration ä→ae ö→oe ü→ue ß→ss, strip non-alphanumerics).
   - `nullifier = HMAC-SHA256(PEPPER, canon)`.
   - Look up `citizen_nullifiers` by `nullifier`:
     - **Same requester** (resolved via join to `request_evidence` on `request_id`) → no flag (a resubmit).
     - **Different requester, status `active` or `pending`** → set `duplicate_identity` flag on the
       request for **attester review** (do NOT auto-reject — handles genuine same-name+same-DOB namesakes
       and pending races).
     - **No match** → insert `pending` row.
   - **Discard plaintext in-memory; log nothing** (no request-body logging).
   - Return `{ nullifier, duplicate: boolean }`.
5. `request_evidence` row stores **only non-PII**: `commitment`, `nullifier`, `type`, `requester`,
   `status`, signature counts. **No name, no address, no reversible blob.**

## Attester approval (offline)

[`apps/expo/app/verification/request/[id].tsx`](../../../apps/expo/app/verification/request/%5Bid%5D.tsx)
stops decrypting/showing PII. It shows: the claim ("wants Citizen pass"), the requester's **display
name** (never a raw wallet address — existing rule), the commitment hash, and a **⚠️ possible-duplicate
banner** when `duplicate_identity` is set. The attester verifies the human in person, then approves
or rejects. The attester resolves namesake collisions (approve) vs. genuine Sybil (reject).

- On mint → flip nullifier `pending` → `active`.
- On revocation → `revoked`. A later re-verification (new wallet) finds the `revoked` row → flags for
  attester, who decides.

The attester-upgrade prefill (`request-attester/form.tsx`) reads the preimage from device
secure-store instead of decrypting server data.

## Defense-in-depth

A Sybil could enter a **fake** name on wallet #2 to dodge the nullifier — but the attester verifies
real ID offline and catches the mismatch. Technical nullifier (detection) + human attester (decision)
close the loop together; neither alone suffices. This is the "Land First" thesis cashing out.

## New table: `citizen_nullifiers`

| Column | Notes |
|---|---|
| `nullifier` | hex HMAC; indexed (not a sole PK — namesakes can collide and are resolved by attester) |
| `request_id` | links to `request_evidence`; requester resolved via join (NOT duplicated here) |
| `contract_address` | scoped per NFT rotation (per the `request_evidence` contract-scope lesson) |
| `status` | `pending` \| `active` \| `revoked` |
| `created_at` | |

`requester_address` is deliberately **not** stored, to minimize the blast radius if the pepper leaks
(no direct wallet↔identity-hash link in this table). RLS: **service role only** (edge function);
no client read/write.

## Pepper & canonicalization durability

- The pepper is a **coordinator-grade, effectively-unrotatable secret** (rotation would require
  recomputing every nullifier, which needs plaintext we deliberately don't store). Store in Supabase
  secrets/Vault; treat like the MACI coordinator keys.
- `canonicalizeIdentity()` is **frozen** — any change silently breaks dedup against all existing
  nullifiers. Pin it with tests.

## Legacy data (decided: purge + opportunistic backfill)

- **Now:** a Supabase migration (via **Supabase MCP**) scrubs `evidence_data` + encryption columns
  from existing `request_evidence` rows — kills the live reversible-PII leak immediately. Communicated
  to attesters that historical/pending legacy requests will no longer display PII in-app (they verify
  offline regardless).
- Existing citizens keep their NFT and get a nullifier **opportunistically** (next request / vote /
  an attester re-confirmation drive). No forced re-verification.

## Forward-compatible (not built now)

Birthdate inside the Poseidon commitment enables a later ZK circuit proving `age ≥ 18` (or "born
before YYYY") for age-gated proposals, without revealing the birthdate. Poseidon now makes that
circuit cheap later. The same commitment supports a one-constraint preimage-dispute circuit.

## Impacted files (initial map)

- `apps/expo/app/verification/request-citizen/form.tsx` — add birthdate; new submit path.
- `apps/expo/app/verification/request-attester/form.tsx` — prefill from secure-store, not decrypt.
- `apps/expo/lib/encryption.ts` — remove address-derived key path; add EIP-712 salt derivation +
  Poseidon commitment helper.
- `apps/expo/lib/verification-types.ts` — `PersonalData` gains `firstName`/`lastName`/`birthdate`;
  evidence shape becomes non-PII (commitment + nullifier).
- `apps/expo/hooks/useVerification.ts` — call edge function, pass `commit:0x…` to contract, store
  non-PII row.
- `apps/expo/lib/supabase-verification.ts` — write non-PII row; new nullifier helpers.
- `apps/expo/app/verification/request/[id].tsx` — PII-free attester view + duplicate banner.
- `apps/expo/supabase/functions/compute-citizen-nullifier/` — new edge function (pepper + dedup).
- `apps/expo/supabase/migrations/*` — create `citizen_nullifiers`; scrub legacy `evidence_data`.

## Open risks (accepted)

1. Enforcement is app/attester-layer, not contract-layer (raw-tx bypass possible; attester backstops).
2. Plaintext identity transits the edge function in-memory (mitigated: no logging, not persisted; OPRF
   is the future hardening).
3. Pepper is effectively unrotatable; canonicalization is frozen — both pinned and treated as
   high-value, like coordinator keys.
4. Namesake (same name + exact DOB) collisions are resolved by the attester, not auto-blocked.
