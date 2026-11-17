# CredentialRegistry — internal security audit

`contracts/governor-contract/contracts/verification-system/CredentialRegistry.sol` is a soulbound ERC-1155 register of roles, memberships and badges on Gnosis Chain. Plan: [`docs/superpowers/plans/2026-11-17-credreg-1-contract.md`](superpowers/plans/2026-11-17-credreg-1-contract.md), Task 7.

This was an **internal** review. Each pass was done by a fresh reviewer agent with proof-of-concept tests, following the same procedure as the OrgRegistry review. It is not an external audit (see "Known limits").

## Scope and passes

| Pass | Audited commit | Scope | PoC file | Result on the audited code |
|---|---|---|---|---|
| 1 | `e20b8c4b` | `CredentialRegistry.sol` + the OrgRegistry surface it reads | `test/CredentialRegistry.audit.test.js` | 0 passing, 9 failing. No Critical/High; 2 Medium, 7 Low, 13 Info |
| 2 | `2169d837` (fix diff `e20b8c4b..2169d837`) | same, plus completeness of the pass-1 fixes and conformance with the plan interface | `test/CredentialRegistry.audit2.test.js` | 0 passing, 2 failing. No Critical/High; 1 Medium, 2 Low, 5 Info |

Fix commits:
- Pass 1: `9f37e8d0` (contract and tests), `2169d837` (package replay follows rebinding).
- Pass 2: `c947d661` (contract, tests, fork test, replay test).

Every PoC stays in the suite as a regression test. A fixed finding asserts the secure behaviour. An accepted finding is inverted into a test named `<ID> (accepted): …` that documents the chosen behaviour.

## Pass 1 findings

| ID | Severity | Description | PoC test | Resolution |
|---|---|---|---|---|
| P1-01 | Medium | A single owner of the org's Safe acts as the org alone (`isOrgOwner` in `canManage`), bypassing the Safe threshold. | `P1-01 (accepted): a single owner of a multi-owner org Safe acts as the org alone` | **Accepted (owner decision).** Authority = Safe, a Safe owner, or an Admin; an owner gets nothing an Admin lacks. Recorded in the NatSpec. |
| P1-02 | Medium | Replacing OrgRegistry revived revoked-generation types (migration resets generations to 0) and darkened live ones. | `P1-02: replacing OrgRegistry must not resurrect a revoked generation's types and holdings` | **Fixed `9f37e8d0`.** Each org type is bound to its registry (`typeRegistryOf`). After a swap, the permissionless `rebindType` carries over only types still alive in the old registry. Completed in pass 2 by P2-01. |
| P1-03 | Low | The owner could gain authority in any org's namespace by re-pointing `orgRegistry`. | `P1-03: the owner cannot issue in an org's namespace by re-pointing the sources`; `P1-03 (accepted, narrowed): after the delay AND an explicit rebind, an owner-controlled registry grants authority` | **Fixed and narrowed `9f37e8d0`, `c947d661`.** Re-pointing alone grants nothing (types go inactive). The residual is owner trust, visible on chain: SourcesProposed, a 2-day delay, SourcesApplied, then one TypeRebound per type. Since P2-01 the hostile registry must also report the org's real Safe (it can then name an owner-chosen Admin). |
| P1-04 | Low | Delegates survive admin removal and Safe rotation, and cannot be reset in bulk. | `P1-04 (accepted): delegates survive admin removal and Safe rotation; the authority revokes each` | **Accepted.** Recovery = the authority revokes each delegate (DelegateSet replay lists them). A future `resetDelegates` epoch remains an option. Delegates also carry over a rebind. |
| P1-05 | Low | The recognition seal survived config edits. | `P1-05: changing a recognised type's config drops the recognition seal` | **Fixed `9f37e8d0`.** `updateType` clears `recognised` and emits `TypeRecognised(false)`. Extended to rebinds by P2-02. |
| P1-06 | Low | A reverting source made `holds`/`balanceOf(Batch)`/`checkLeaf` revert for everyone. | `P1-06: a reverting source does not brick holds/balanceOfBatch for readers`; `P1-06: a reverting OrgRegistry makes org types inactive for readers instead of reverting` | **Fixed `9f37e8d0`.** try/catch; failure = not held / inactive. Extended to `canManage` by P2-06. Limits: P2-05. |
| P1-07 | Low | `balanceOf` changes without `TransferSingle` (not a conforming ERC-1155 balance). | `P1-07 (accepted): balanceOf is validity-aware and changes without TransferSingle; prune emits the burn` | **Accepted.** balanceOf is validity-aware. Expiry, revocation, retirement, org death and the NFTs change it silently; prune emits the burn. Documented. |
| P1-08 | Low | No ERC-1155 `URI` event. | `P1-08: changing a type's metadata URI emits the ERC-1155 URI event`; `P1-08: createType and the reserved types emit the ERC-1155 URI event` | **Fixed `9f37e8d0`.** Emitted on create (reserved types included) and when `updateType` changes the URI. |
| P1-09 | Low | A stale holder blocks a capped type until someone prunes. | `P1-09 (accepted): a stale holder blocks a capped office until pruned; prune + claim then succeeds` | **Accepted.** Apps batch prune + claim in one user operation. Documented on `claim`. |
| P1-10 | Info | A hostile org Safe affects only that org's authority (30k gas cap on `isOwner`). | — | No change (follows from P1-01). |
| P1-11 | Info | Claim-key replay and signature malleability: not exploitable. | — | No change. Renewals should use fresh keys or Account leaves. |
| P1-12 | Info | Leaf/inner-node and Account/ClaimKey collisions: not exploitable. | — | No change. |
| P1-13 | Info | No reentrancy surface (view sources, `_update` without hooks). | — | No change. |
| P1-14 | Info | A huge `revokeLeaves` can exceed the block gas limit; only the issuer is affected. | — | Documented in NatSpec: clients chunk at about 500. |
| P1-15 | Info | `supplyCap` can be set below `supply`. | `P1-15 (accepted): a cap below supply is allowed; nothing is burned, mints stop, renewals work` | **Accepted.** Documented on `updateType`. |
| P1-16 | Info | Batch `count` is self-declared. | — | No change. UI labels it "declared". |
| P1-17 | Info | A single attester can repeatedly switch `orgPrivateOnly` on; private-only also blocks renewal of public members. | — | No change (owner ruling). Open product decision on renewal while holding. |
| P1-18 | Info | A recognised type may have `publicClaim=false`; private-only gates only `Membership`. | — | No change. Documented: private-only covers the Membership kind. |
| P1-19 | Info | `checkLeaf` does not authenticate the presenter. | — | No change in the contract. Verifiers must check control of `subject`/the key and `boundTo` (reader/package, plan 2). |
| P1-20 | Info | Inherited `renounceOwnership` would freeze COMMUNITY, recognition and the sources. | — | No change. Operational rule: never call it (owner = Attester Safe / Timelock). |
| P1-21 | Info | Type ids of a revoked generation stay taken; OrgRegistry accepts `orgId == 0`. | — | No change. Keep the uuid `localId` convention. |
| P1-22 | Info | `uri(id)` returns metadata for dead/retired types and `""` for unknown ids. | — | No change. Clients check `isTypeActive`. |

## Pass 2 findings

| ID | Severity | Description | PoC test | Resolution |
|---|---|---|---|---|
| P2-01 | Medium | `rebindType` checked that the org was alive in the old registry, but in the new one only that the id was registered. A generation revoked in the new registry and re-registered, or an id the new registry never imported and that a stranger registers there, inherited the old org's types, holders, batches and delegates (A→B→C chains included). | `P2-01: an org revoked in the NEW registry before rebind must not get its old types back after re-registration`; `P2-01: an id the new registry never imported, registered there by someone else, must not inherit the old org's types` (plus the fix tests below) | **Fixed `c947d661`.** `rebindType` also requires `old.getOrg(orgId).safe == new.getOrg(orgId).safe`, both read with try/catch, otherwise NotRebindable. `migrationRegister` keeps the Safe, and a Safe belongs to one org per registry, so a stranger's Safe never matches. A type whose org rotated its Safe (in either registry) before the rebind stays inactive, and the org creates new types. |
| P2-02 | Low | The recognition seal survived `rebindType`. | `P2-02: rebindType clears the recognition seal; the owner may re-seal`; `P2-02: rebinding an unrecognised type emits no TypeRecognised` | **Fixed `c947d661`.** The rebind clears `recognised` and emits `TypeRecognised(false)`; the owner re-seals after the cutover. The package replay already handles this; test `a rebind of a recognised type clears the seal`. |
| P2-03 | Low | Rebindability depends on the old registry's **live** state. A revocation or rotation there after the swap makes live types permanently unrebindable (and their holders prunable). A broken old registry blocks all rebinds. | existing `an org revoked in the old registry after the swap is no longer rebindable`; `P2-01: a Safe rotated in the OLD registry after the swap differs from the imported one and blocks the rebind` | **Accepted, runbook.** Freeze the old registry (no revocations, no rotations; close open requests) and have the keeper rebind every live org type right after `applySources`. Stated in the NatSpec and the plan. |
| P2-04 | Info | The prune guard for types awaiting a rebind is sound; no capped *active* type is blocked forever. | — | Documented on `prune`: stale holdings of an awaiting type are pruned after the rebind. |
| P2-05 | Info | try/catch does not catch malformed or short return data, a source without code, gas exhaustion, or a returnbomb through `getOrg`'s `metadataURI`. Each org-type `holds` makes 2 external calls. | — | **Accepted (owner trust; sources are owner-set after a 2-day delay).** Documented on `_orgInfo`. Full hardening option: bounded `staticcall` with length checks, or an OrgRegistry `generationOf` view without dynamic data. |
| P2-06 | Info | `canManage`/`canIssue` still reverted on a broken registry. | `P2-06: canManage / canIssue answer false instead of reverting on a broken registry` | **Fixed `c947d661`.** Every registry read in `canManage` is try/catch and failure answers false. `setOrgPrivateOnly` uses the same helper. State-changing paths revert `NotAuthorised` (or `TypeInactive` first). |
| P2-07 | Info | `rebindType` has no front-running or griefing surface: idempotent, caller-independent, correct across A→B→A. | — | Documented in the `rebindType` NatSpec. |
| P2-08 | Info | `setRecognised` sealed inactive types. | `P2-08: setRecognised(true) requires an active type; setRecognised(false) always works` | **Fixed `c947d661`.** `setRecognised(true)` reverts `TypeInactive` unless active; `false` is always allowed. Apps still check `isTypeActive`, since a sealed type can go inactive later. |

Pass 2 confirmed that the interface block of the plan matched the code. The changes above are behavioural (no signature, event or error changed, so the ABI, `sync-abi` and the vector are unchanged). The plan's interface comments and "Rules the code must follow" were updated for the same-Safe rule, the seal clearing on rebind, the `setRecognised` activity check and the try/catch in `canManage`.

### Residual of the P2-01 fix
The rule identifies an org by its Safe. If an org is revoked in the new registry and the **same Safe** registers the id again before a keeper rebinds, the old types come back under it. This is the same entity (the same Safe), but it slips past a revocation in the new registry. Mitigated operationally by rebinding immediately after `applySources`. Chained-swap variant: if the type is never rebound to B, an org with the same Safe is revoked in B, and the same Safe is present in C, B's revocation is skipped; keepers rebind immediately after each swap. A contract option for a later version is to require the new registry's `registeredAt` to be at or before the `applySources` time.

## Known limits by design

- **A `SourcesProposed` proposal never expires.** The owner should `cancelSources` stale proposals; watchers must treat any pending proposal as live.
- **A private claim-key leaf is a bearer document until it is claimed.** Whoever holds the paper key can claim it. After the claim it is bound to the claimant, but a private "Vorzeigen" via `checkLeaf` is only safe when the verifier checks `boundTo` and control of the key (P1-19).
- **An org learns by elimination who accepted privately.** The issuer knows every leaf; accepted minus public claims = private holders.
- **The count of a batch is public**, and it is self-declared (P1-16). Proof length leaks roughly log2 of the tree size.
- **The owner can re-point the sources after 2 days.** Through a registry it controls plus one rebind per type, it can gain authority over orgs' types. That is owner trust, visible on chain: SourcesProposed → 2 days → SourcesApplied → TypeRebound per type (P1-03). Watch `SourcesProposed`.
- **A single Safe signer acts for the org** without the Safe's threshold (P1-01, owner decision).
- **Closing an org (`orgPrivateOnly`) burns nothing.** Existing public memberships keep counting until each holder renounces. Only new public claims (and renewals) of `Membership` types are blocked.
- **`balanceOf` is validity-aware**, not a raw ERC-1155 balance (P1-07). External types (Citizen, Attester) report 1 without a mint.
- **Sources are trusted to be well-formed** (P2-05). A reverting source degrades views to "not held"; a malformed one can still make reads revert.
- **An external audit is recommended before orgs rely on a credential for money or access.**

## Zero-knowledge forward compatibility

Plan 6 adds one Semaphore group per credential type in a **separate** contract, `CredentialGroups`. It reads only `holds`, `isTypeActive`, `typeExists`, `getType` and `canManage` from this contract. The Semaphore identity is never part of the leaf or written here, so the leaf format and the type ids stay unchanged, and **CredentialRegistry needs no redeployment**. The pass-2 changes keep this true: `canManage` now degrades to false instead of reverting, which only helps a reading contract.

## Verification at `c947d661`

- `npx hardhat test` of the types, claims, vector, audit, audit2 and OrgRegistry suites: 123 passing.
- Gnosis fork (`CREDREG_FORK_TEST=1 GNOSIS_FORK=1`): 6 passing. The sources hand-over asserts that a dead org imported with its original Safe stays dead, that an id imported to a different Safe is not rebindable, and that the live org with the same Safe rebinds.
- `packages/credential-registry`: 23 tests pass, typecheck clean, ABI unchanged.
- Deployed bytecode 19,569 bytes (limit 24,576). Gas: addBatch 137,312; addBatch by a Safe owner 144,307 (< 150k); claim with a 7-hash proof 171,371 (account) and 177,122 (claim key) (< 250k).
