# NSP-14 — Organisations as Safes (Org Identity)

**2026-09-26.** Status: **slice 1 built on `feat/org-safe-protocol`, nothing deployed.**
First step of the move from "the database is the truth" to "the protocol is the truth"
(see [Data placement](../../DATA_PLACEMENT_AND_CRUD.md) §1). Companion to the passkey
work on `feat/passkey-accounts` ([spec](2026-09-26-passkey-sovereign-accounts-design.md)),
which uses the same Safe 1.4.1 stack for citizens.

## 1. Goal

Any client, not only Röbel's app, can answer "which orgs exist, who runs them, and
did this org really say this?" from the chain and the relays alone. Today the
answer is an `accounts` row, and the node signs org events with keys it derives
itself (`packages/nostr/src/org.ts`).

## 2. The model

| Question | Answer after NSP-14 | Where |
|---|---|---|
| What is an org? | A **Safe** holding a soulbound OrgNFT | `OrgRegistry` (Gnosis) |
| Who may create one? | Any Safe can ask. The community's **attesters** approve on threshold bands, like a Citizen | `requestRegistration` → `approveRequest` |
| Who owns it? | The Safe's owners, read live from the Safe, never duplicated | `isOrgOwner` |
| Admins / members? | Roles the **Safe** sets | `setRole` / `roleOf` |
| Who may publish as the org on Nostr? | A **set** of x-only pubkeys the Safe authorises, each revocable on its own | `setNostrKey` / `isNostrKeyAuthorized` |
| How does a reader check an event? | The event carries `["netizen_org", <orgId>]` and its pubkey is authorised for that org | `verifyOrgEvent` (`@netizen-labs/protocol`) |
| Canonical id | `keccak256("netizen:org:v1:" + lowercase uuid)`, **frozen**. tokenId = uint256(orgId) | `orgIdFromUuid` |
| Can the community remove an org? | Yes: attester revocation (67 %/floor 3 by default). Its generation bumps, so old keys and roles never come back | `requestRevocation` |
| Can an org change Safes? | `rotateSafe`, called by the current Safe. This is the only way the NFT ever moves | |

The registry owner (the Attester Safe during bootstrap) can tune bands and run a
one-time `migrationRegister`. It **cannot** touch any org's keys, roles or metadata.

## 3. Decisions

- **Roles live in the registry, not EAS.** The repo has no EAS usage, schema or
  address yet. The issuer is the org's Safe either way. Keeping roles in one contract
  means one read and one log scan rebuild everything. An EAS export can be added
  later without changing authority.
- **A set of keys, not one shared key.** The reason `org.ts` kept keys on the node
  still holds: a shared secret can't be revoked from someone who leaves. A per-device
  key that the Safe authorises solves this without the node being in the trust path.
- **The node key stays valid at first.** Migration authorises each org's existing
  node-derived key, so the publisher keeps signing with **zero changes**. An org
  moves to self-custody by adding device keys and revoking the node key. That's
  one Safe transaction, whenever it wants.
- **Profile edits stay off-chain.** Name, bio and images live in a kind 0 event signed
  by an authorised key, so editing them needs no Safe transaction. `metadataURI` is
  optional (NSP-14 metadata schema).
- **Threshold 1 by default ("parity").** Today any single owner can act alone. The
  planner offers `majority` for orgs that will hold money.
- **Owners are citizen accounts.** The passkey work keeps every citizen's address.
  Once tranche 2 removes the thirdweb EOA, the legacy account's ERC-1271 stops
  working, so owners confirm org-Safe transactions on-chain with `approveHash`,
  called through their account's `execute`. That path needs no ERC-1271.

## 4. What is built (slice 1)

| Piece | Path | Tests |
|---|---|---|
| `OrgRegistry` contract | `contracts/governor-contract/contracts/verification-system/OrgRegistry.sol` | 16 (hardhat) |
| NSP-14 schema: id, roles, tag, metadata, `verifyOrgEvent`, manifest `contracts.orgRegistry` | `packages/protocol/src/orgs.ts` | 7 (+55 existing) |
| Reader, log replay (rebuild directory from chain), migration planner + `netizen-org-plan` CLI | `packages/org-registry/` | 8, incl. ABI drift check against the compiled artifact |

Nothing in `apps/`, `supabase/`, `packages/blockchain` or the publisher changed.
Production behaves exactly as before.

## 5. Dry run against production (read-only, 2026-09-26)

- 36 organisations: 12 Verein, 12 Unternehmen, 7 Restaurant, 3 Fraktion, 2 Stadt.
- **Every org has exactly one owner.** There are 13 admin and 9 member rows, and no
  invalid wallets.
- 18 distinct owner wallets. **Two wallets own 17 of the 36 orgs** (8 and 9). These
  are onboarding accounts that set orgs up on someone's behalf.

**Consequence:** migrating as-is would make those two wallets the sole Safe owners
of half the orgs. That's not decentralisation. **Rollout gate R2 below:** before an
org is migrated, its real operator becomes an owner (Safe `addOwnerWithThreshold`),
and the onboarding account stays only as long as the org wants it.

## 6. Rollout (each stage reversible; production untouched until R4)

| Stage | What | Gate |
|---|---|---|
| R0 | This slice: contract + spec + reader + planner | done |
| R1 | Deploy `OrgRegistry` on the **onchain test environment** (burner AttesterNFTv2), register two test Safes end to end | Max OK + deployer key |
| R2 | Owner hand-over: each onboarding-owned org gets its real operator as owner | Per-org contact; no chain needed yet |
| R3 | Deploy Safes (Safe 1.4.1 on Gnosis, shared with the passkey stack) and `migrationRegister` all 36 from the planner output, node keys authorised. Then `finalizeMigration` | Passkey tranche 1 settled (owner addresses stable), Max OK, audit of the contract |
| R4 | Readers: indexer ingests registry logs, `verifyOrgEvent` gates org events in the index. Publisher adds the `netizen_org` tag | Flag, preview first |
| R5 | App: org creation = Safe + `requestRegistration`. Membership edits go through the Safe (the `org-membership` edge function becomes a mirror, not the authority) | Passkey tranche 2 (writes via Safe) |
| R6 | Self-custody: org admins get device keys; the node key is revoked per org | Org's choice |

## 7. Explicitly not in this slice

- No Safe deployment code. It'll reuse the passkey branch's Safe 1.4.1 helpers
  instead of adding a second copy.
- No Supabase migration. The `accounts` ↔ orgId mapping is derivable (`orgIdFromUuid`),
  so no column is needed yet.
- No contract audit. **Required before R3.** The contract holds no funds, but it is
  the root of org authority.
