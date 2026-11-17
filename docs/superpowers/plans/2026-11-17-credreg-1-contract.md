# Credential Register 1 — Contract, Encodings and Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `CredentialRegistry.sol` (soulbound ERC-1155 register of roles, memberships and badges on Gnosis), its byte-exact TypeScript encodings, a reader/replay package, full tests, two internal audit passes and the deploy scripts, ending with a rehearsed test-environment deployment.

**Architecture:** One contract, no proxy, `Ownable2Step`. Types are namespaced by org (`typeId = keccak256(abi.encode(orgId, localId))`); authority comes live from OrgRegistry; issuing is a Merkle root per batch; a holder's own `claim` transaction mints (public) and an unclaimed leaf stays provable through a read call (private). Citizen and Attester are answered from the existing NFT contracts. The TypeScript package `@netizen-labs/credential-registry` is the single implementation of leaf, tree and claim-signature encoding for web, Expo and Studio, pinned against the contract by a shared vector file.

**Tech Stack:** Solidity ^0.8.28 (viaIR, optimizer 200), OpenZeppelin Contracts 5.2.0 (`ERC1155`, `Ownable2Step`, `EIP712`, `ECDSA`, `MerkleProof`), Hardhat 2.19 with Mocha/Chai and ethers v6, viem ^2.47 in the package, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-11-17-credential-register-design.md` (sections 5.1, 5.2, 5.9, 8). Read it first. Pattern to copy: `contracts/governor-contract/contracts/verification-system/OrgRegistry.sol`, `contracts/governor-contract/test/OrgRegistry.test.js`, `packages/org-registry/`.

**Plan series:** 1 contract (this) → 2 backend → 3 Expo → 4 dashboard and badges → 5 Studio. Plans 2 to 5 consume the names fixed here; changing an interface below means changing them.


> **Owner decision update 2026-11-17 (overrides item 1 below and every "private-only" rule in this plan):**
> each person can switch a credential between public and private at any time (public → private = renounce, and
> the app says the earlier public record stays in the chain history). The private-only switch belongs to the
> **org**: "Mitglieder dürfen öffentlich sichtbar sein". `fraktion` and `stadt` orgs start with it off and **the
> org's authority can turn it off and on**; an attester can only turn it off; the contract owner can do both.
> Offices stay always public. Zero-knowledge membership proofs are a later plan (`credreg-6-zk`); keep the leaf
> format and type ids so a Semaphore-style group per type can be added without a redeploy of this contract if
> possible, and say in your final report whether it is.

## Owner decisions assumed

These are the five items of spec section 9, treated as decided. **If the owner overrules one, stop and re-plan the named tasks.**

1. **Public or private per person**, with party-like orgs private-only for ordinary members. → Task 3 (`claim`, `publicClaim`, `orgPrivateOnly`), plans 2 and 3.
2. **Guest is a self-claimed token** in the community namespace. → Task 2 (reserved types), Task 3 (`selfClaim`), plan 3.
3. **Citizen and Attester are shown through the register, not re-minted.** → Task 2 (`External` policy).
4. **Badges arrive when the organiser issues them**; instant only when the org appoints the node key as delegate. → Task 2 (`setDelegate`), plan 4.
5. **Members stop being written to OrgRegistry.** → no contract work; plan 3.

## Open questions for the owner

Tasks are written against the default. Each is a contract decision that cannot be changed after deployment without a new deployment.

1. **Safe owners may act directly.** Spec 5.1 names "the org's Safe, or an account with the `Admin` role". An org's owners are the Safe's owners and hold no `Admin` role (`apps/expo/lib/org-safe/ops.ts` `planSync` clears it), so by the letter an owner would have to wrap every call in a Safe transaction, and an owner of a Safe with threshold 2 could not issue at all while an admin could. *Default: authority = the Safe itself, or `OrgRegistry.isOrgOwner`, or `Role.Admin`. This gives an owner nothing an admin does not already have.*
2. **OrgRegistry is a settable pointer too.** The spec asks for settable NFT pointers because OrgRegistry's immutable `attesters` forces its redeploy at the v3 cutover. That same redeploy would orphan this contract. *Default: all three sources (CitizenNFT, AttesterNFT, OrgRegistry) change together through propose → wait `SOURCES_DELAY` = 2 days → apply.* Caveat written into the NatSpec: a type remembers the org generation it was created under, so a new OrgRegistry must carry the same generation numbers or the org's types go dark.
3. **Who may switch an org to private-only, and back.** *Decided (see update note): on and off by the org's authority; on only by an attester; both by the contract owner.* The app sets it for `fraktion` and `stadt` orgs (plan 2).
4. **Guest stays after citizenship.** A guest who becomes a citizen keeps the Guest token unless they renounce it. *Default: keep; the app hides the Gastkarte for citizens as today.*
5. **Recognised flag on the reserved types.** *Default: not set at deploy; the owner sets it per type.*

## Global Constraints

- Sources live in `contracts/governor-contract/contracts/verification-system/` (`hardhat.config.js` `paths.sources`), tests in `contracts/governor-contract/test/` as Mocha/Chai JavaScript. Run: `cd contracts/governor-contract && npx hardhat test test/<file>`.
- OpenZeppelin is pinned at `5.2.0`. No new dependencies in `contracts/governor-contract`; the package may depend only on `viem`, `tsx`, `typescript`, `@types/node`.
- Non-transferable: every transfer and every approval reverts. A holder's balance of a type is 0 or 1. No proxy. License header `// SPDX-License-Identifier: AGPL-3.0-only`, `pragma solidity ^0.8.28;`.
- Metadata URIs are capped at 512 bytes, as in OrgRegistry (`MAX_URI_BYTES`).
- Every state change emits an event, so a log-only indexer reproduces every view.
- The contract makes no call to an account other than the three source contracts (and, through OrgRegistry, the bounded `isOwner` staticcall). Mint never calls the receiver.
- `packages/credential-registry` is bundled by Metro: **relative imports without a file extension** (`from './leaf'`), no `node:` imports outside `test/`, `scripts/` and the CLI.
- Code and comments English. pnpm only.
- Never broadcast: every chain step in a task runs on the in-process Hardhat network or a local Gnosis fork (`GNOSIS_FORK=1`). Real deployments are in "Owner gates".
- Other agents work in this repo. Work in a git worktree: `git worktree add .worktrees/credreg-1 -b feat/credreg-1-contract`, then `pnpm install --frozen-lockfile`. Stage files by explicit path, never `git add .` or `-A`. Every task ends with commit + `git push -u origin feat/credreg-1-contract`. Never merge to `main`.
- Commit convention: `feat(contracts): …`, `test(contracts): …`, `feat(credential-registry): …`, `docs: …`.

## Review Focus

1. **A claim-key letter used twice.** The person claims, renounces, and somebody else who photographed the letter claims to their own account. Expected: the leaf is bound to the first account forever. Test in Task 3 (`claim-key leaf stays bound after renounce`).
2. **An org is revoked and registered again under the same id.** Expected: every type, batch and holding of the earlier registration stays dead, and nothing the new registration does revives them. Test in Task 3 (`generation change`) and Task 5 (fork).
3. **A renewal while the old Ausweis is still valid.** Expected: claiming next year's leaf replaces the holding, balance stays 1, no second mint, the supply counter does not move. Test in Task 3.
4. **An org revokes a leaf it does not own.** Leaf hashes become public once claimed. Expected: revocation is scoped to the batch, and only that batch's type authority may call it. Test in Task 3.
5. **A full badge.** The supply cap is reached, a holder renounces, the next person claims. Expected: the slot is free again; an expired holding frees its slot once anyone prunes it. Test in Task 3.

---

## The interface (fixed for the whole series)

File: `contracts/governor-contract/contracts/verification-system/CredentialRegistry.sol`. `contract CredentialRegistry is ERC1155, Ownable2Step, EIP712`. EIP-712 domain: name `"CredentialRegistry"`, version `"1"`. ERC-1155 token id = `uint256(typeId)`.

```solidity
enum Kind { Role, Membership, Badge }
enum ClaimPolicy { IssuerBatch, SelfClaim, External }   // External: answered by another contract (Citizen, Attester)
enum LeafKind { Account, ClaimKey }
enum LeafStatus { Invalid, Valid, Expired, Revoked, Inactive }

struct TypeConfig {
    string metadataURI;      // <= 512 bytes
    uint64 defaultValidity;  // seconds; 0 = no expiry. Applied by selfClaim; informational for batches (the leaf decides)
    uint64 claimStart;       // 0 = open
    uint64 claimEnd;         // 0 = open; otherwise > claimStart
    uint32 supplyCap;        // 0 = uncapped; counts current holders
    bool publicClaim;        // false = can never be minted, only proven privately
}
struct CredentialType {
    bytes32 orgId;           // bytes32(0) = community namespace
    bytes32 localId;
    uint64 orgGeneration;    // OrgRegistry generation at creation
    uint64 createdAt;
    Kind kind;
    ClaimPolicy policy;
    bool recognised;
    bool retired;
    uint32 supply;           // accounts with a raw balance of 1
    TypeConfig config;
}
struct Batch { bytes32 typeId; bytes32 root; address issuer; uint32 count; uint64 createdAt; bool revoked; }
struct Leaf { LeafKind kind; bytes32 typeId; address subject; uint64 validUntil; bytes32 salt; }
struct Holding { uint64 batchId; uint64 validUntil; uint64 since; bytes32 leaf; }   // batchId 0 = self-claimed

// constants
uint256 public constant MAX_URI_BYTES = 512;
uint64  public constant SOURCES_DELAY = 2 days;
bytes32 public constant COMMUNITY = bytes32(0);
bytes32 public constant CITIZEN_TYPE  = 0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3;
bytes32 public constant ATTESTER_TYPE = 0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d;
bytes32 public constant GUEST_TYPE    = 0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7;
bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(uint64 batchId,bytes32 leaf,address account)");

constructor(address initialOwner, address citizenNFT_, address attesterNFT_, address orgRegistry_, string[3] memory reservedURIs); // citizen, attester, guest

// types — org authority (see "Authority")
function createType(bytes32 orgId, bytes32 localId, Kind kind, ClaimPolicy policy, TypeConfig calldata cfg) external returns (bytes32 typeId);
function updateType(bytes32 typeId, TypeConfig calldata cfg) external;
function retireType(bytes32 typeId) external;                              // irreversible
function setDelegate(bytes32 typeId, address delegate, bool allowed) external;
function setOrgPrivateOnly(bytes32 orgId, bool privateOnly) external;      // see open question 3
function setRecognised(bytes32 typeId, bool recognised) external;          // onlyOwner

// issuing — org authority or a delegate of the type
function addBatch(bytes32 typeId, bytes32 root, uint32 count) external returns (uint64 batchId);   // ids start at 1
function revokeBatch(uint64 batchId) external;
function revokeLeaves(uint64 batchId, bytes32[] calldata leaves) external;

// holders
function claim(uint64 batchId, Leaf calldata leaf, bytes32[] calldata proof, bytes calldata claimSignature) external;
function selfClaim(bytes32 typeId) external;
function renounce(bytes32 typeId) external;
function prune(bytes32 typeId, address account) external;                  // anyone; burns a holding that no longer counts

// sources — onlyOwner
function proposeSources(address citizenNFT_, address attesterNFT_, address orgRegistry_) external;
function applySources() external;
function cancelSources() external;

// views
function holds(bytes32 typeId, address account) public view returns (bool);
function checkLeaf(uint64 batchId, Leaf calldata leaf, bytes32[] calldata proof) external view returns (LeafStatus status, address boundTo);
function getType(bytes32 typeId) external view returns (CredentialType memory);          // reverts UnknownType
function getBatch(uint64 batchId) external view returns (Batch memory);                  // reverts UnknownBatch
function holdingOf(bytes32 typeId, address account) external view returns (Holding memory);
function typeExists(bytes32 typeId) external view returns (bool);
function isTypeActive(bytes32 typeId) public view returns (bool);                        // exists, not retired, org alive at the type's generation
function canManage(bytes32 orgId, address account) public view returns (bool);
function canIssue(bytes32 typeId, address account) public view returns (bool);           // canManage(type's org) or delegate
function isDelegate(bytes32 typeId, address account) external view returns (bool);
function orgPrivateOnly(bytes32 orgId) external view returns (bool);
function leafRevoked(uint64 batchId, bytes32 leaf) external view returns (bool);
function leafBoundTo(uint64 batchId, bytes32 leaf) external view returns (address);
function batchCount() external view returns (uint64);
function citizenNFT() external view returns (address);
function attesterNFT() external view returns (address);
function orgRegistry() external view returns (address);
function pendingSources() external view returns (address citizenNFT_, address attesterNFT_, address orgRegistry_, uint64 eta);
function typeIdOf(bytes32 orgId, bytes32 localId) public pure returns (bytes32);         // keccak256(abi.encode(orgId, localId))
function leafHash(Leaf calldata leaf) public pure returns (bytes32);
function claimDigest(uint64 batchId, bytes32 leaf, address account) public view returns (bytes32);   // EIP-712 digest
// ERC-1155 overrides: balanceOf(account, id) returns holds(bytes32(id), account) ? 1 : 0; uri(id) returns the type's metadataURI ("" if unknown);
// setApprovalForAll and every transfer revert Soulbound().

event TypeCreated(bytes32 indexed typeId, bytes32 indexed orgId, bytes32 localId, Kind kind, ClaimPolicy policy, uint64 orgGeneration);
event TypeConfigured(bytes32 indexed typeId, TypeConfig config);            // on create and on update
event TypeRetired(bytes32 indexed typeId);
event TypeRecognised(bytes32 indexed typeId, bool recognised);
event DelegateSet(bytes32 indexed typeId, address indexed delegate, bool allowed);
event OrgPrivateOnlySet(bytes32 indexed orgId, bool privateOnly, address indexed by);
event BatchAdded(uint64 indexed batchId, bytes32 indexed typeId, address indexed issuer, bytes32 root, uint32 count);
event BatchRevoked(uint64 indexed batchId);
event LeafRevoked(uint64 indexed batchId, bytes32 leaf);
event Claimed(bytes32 indexed typeId, address indexed account, uint64 indexed batchId, bytes32 leaf, uint64 validUntil);
event SelfClaimed(bytes32 indexed typeId, address indexed account, uint64 validUntil);
event Renounced(bytes32 indexed typeId, address indexed account);
event Pruned(bytes32 indexed typeId, address indexed account);
event SourcesProposed(address citizenNFT, address attesterNFT, address orgRegistry, uint64 eta);
event SourcesApplied(address citizenNFT, address attesterNFT, address orgRegistry);
event SourcesCancelled();
// plus ERC-1155 TransferSingle on every mint (from 0) and burn (to 0)

error NotAuthorised(address caller);
error UnknownType(bytes32 typeId);
error TypeExists(bytes32 typeId);
error TypeInactive(bytes32 typeId);
error ExternalType(bytes32 typeId);
error WrongPolicy(bytes32 typeId);
error BadConfig();
error UriTooLong();
error UnknownBatch(uint64 batchId);
error BatchIsRevoked(uint64 batchId);
error EmptyBatch();
error LeafTypeMismatch();
error InvalidProof();
error LeafIsRevoked(bytes32 leaf);
error LeafExpired(bytes32 leaf);
error NotLeafSubject(address caller);
error LeafBoundToOther(bytes32 leaf);
error BadClaimSignature();
error PublicClaimDisabled(bytes32 typeId);
error ClaimWindowClosed(bytes32 typeId);
error SupplyCapReached(bytes32 typeId);
error AlreadyHeld(bytes32 typeId, address account);
error NotHeld(bytes32 typeId, address account);
error StillValid(bytes32 typeId, address account);
error Soulbound();
error NotContract(address account);
error NoPendingSources();
error SourcesNotReady(uint64 eta);
```

### Encodings (byte-exact, mirrored in TypeScript)

- **Type id:** `keccak256(abi.encode(bytes32 orgId, bytes32 localId))`. `orgId` is the NSP-14 id (`keccak256("netizen:org:v1:" + lowercase uuid)`, `packages/protocol/src/orgs.ts`). `localId` is opaque to the contract; the convention is `keccak256(utf8("netizen:credential-type:v1:" + x))` where `x` is a lowercase uuid, or `citizen` / `attester` / `guest` for the reserved types (their type ids are the three constants above, computed with ethers 2026-11-17; Task 1 re-derives them).
- **Leaf hash:** `keccak256(bytes.concat(keccak256(abi.encode(uint8(kind), typeId, subject, validUntil, salt))))` (five 32-byte words, hashed twice, the OpenZeppelin convention against second-preimage confusion with inner nodes). `subject` is the recipient account (`Account`) or the address of the one-time key (`ClaimKey`). `validUntil` 0 = no expiry, otherwise the last valid second. `salt` is 32 random bytes per leaf.
- **Tree:** leaves sorted ascending by hash; each layer pairs neighbours with the commutative hash `keccak256(min(a,b) ‖ max(a,b))`; an unpaired last node moves up unchanged; a single leaf is its own root with an empty proof. Verified on chain with `MerkleProof.verifyCalldata(proof, root, leaf)`.
- **Claim-key signature:** EIP-712, domain `{name: "CredentialRegistry", version: "1", chainId, verifyingContract}`, primary type `Claim(uint64 batchId,bytes32 leaf,address account)`, 65-byte ECDSA signature by the claim key, recovered with `ECDSA.recover` and compared with `leaf.subject`. `account` is the claiming account, which must also be `msg.sender`.

### Authority

- `canManage(orgId, a)`: for `COMMUNITY`, `a == owner()`. Otherwise the org must be registered in OrgRegistry, and `a` is its Safe, or `isOrgOwner(orgId, a)`, or `roleOf(orgId, a) == Admin`.
- Type creation, edits, retirement, delegates: `canManage(type.orgId, msg.sender)` and, for existing types, `isTypeActive`.
- `addBatch`, `revokeBatch`, `revokeLeaves`: `canIssue(typeId, msg.sender)`. Authority is checked when the call is made; a batch outlives its issuer's role and is removed with `revokeBatch`.
- `setOrgPrivateOnly(orgId, true)`: `canManage(orgId, msg.sender)` or `attesterNFT.hasAttesterNFT(msg.sender)`. `false`: `owner()` only. Not allowed for `COMMUNITY` (`NotAuthorised`).
- `External` types (Citizen, Attester): `holds` returns `citizenNFT.hasCitizenNFT(account)` / `attesterNFT.hasAttesterNFT(account)`. `updateType` by the owner changes their metadata; `retireType`, `setDelegate`, `addBatch`, `selfClaim`, `renounce`, `prune` revert `ExternalType` (no batch can exist for them, so `claim` cannot reach one). `createType` with `External` reverts `WrongPolicy`.

### Rules the code must follow (each has a test)

- `isTypeActive`: exists, not retired, and for an org type `orgRegistry.isRegistered(orgId) && orgRegistry.getOrg(orgId).generation == type.orgGeneration`.
- `holds` (non-external): raw balance 1 AND `isTypeActive` AND (`validUntil == 0 || block.timestamp <= validUntil`) AND (`batchId == 0` OR (batch not revoked AND leaf not revoked in that batch)).
- `claim` checks, in this order: batch exists → `isTypeActive` → `leaf.typeId == batch.typeId` → `config.publicClaim` and not (`orgPrivateOnly[orgId]` and `kind == Membership`) → claim window → batch not revoked → proof → leaf not revoked → not expired → subject (`Account`: `msg.sender == subject`; `ClaimKey`: bound account is zero or `msg.sender`, and when zero the signature must recover to `subject`) → bind the leaf to `msg.sender` → write the holding → if the raw balance was 0: cap check, mint, `supply++`.
- Claiming while already holding replaces the holding record with the new leaf (renewal). It never mints twice.
- Mint and burn go through `_update(from, to, ids, values)` directly, not `_mint` / `_burn`'s acceptance path, so no receiver hook runs.
- `revokeLeaves` marks each leaf revoked in that batch and, when the leaf is bound to an account whose current holding is this leaf in this batch, burns it.
- `renounce` burns the caller's raw holding (even a stale one) and keeps the leaf binding. `prune` burns a holding with raw balance 1 for which `holds` is false; otherwise `StillValid`.
- `selfClaim`: policy `SelfClaim`, active, window, caller does not `hold` (a stale holding is refreshed without a second mint), cap, `validUntil = defaultValidity == 0 ? 0 : now + defaultValidity`.
- `proposeSources` requires all three addresses to have code (`NotContract`); `applySources` requires a proposal (`NoPendingSources`) and `block.timestamp >= eta` (`SourcesNotReady`).
- The constructor creates the three reserved types in `COMMUNITY`: Citizen (`Role`, `External`), Attester (`Role`, `External`), Guest (`Membership`, `SelfClaim`, `publicClaim = true`, no cap, no window, no expiry), each emitting `TypeCreated` + `TypeConfigured`.

---

### Task 1: Package scaffold, encodings and the golden vector

**Files:**
- Create: `packages/credential-registry/package.json`, `tsconfig.json` (copy `packages/org-registry/` and adjust: name `@netizen-labs/credential-registry`, dependencies `viem` and `@netizen-labs/protocol` only, script `"test": "tsx --test test/*.test.ts"`)
- Create: `packages/credential-registry/src/ids.ts`, `src/leaf.ts`, `src/merkle.ts`, `src/claim.ts`, `src/index.ts`
- Create: `packages/credential-registry/scripts/make-vector.ts`
- Create: `packages/credential-registry/test/vectors/credential-vector.json` (generated, committed)
- Test: `packages/credential-registry/test/encodings.test.ts`

**Interfaces:**
- Produces (`ids.ts`):
  - `CREDENTIAL_TYPE_PREFIX = "netizen:credential-type:v1:"`, `COMMUNITY_ORG_ID: Hex` (32 zero bytes)
  - `localIdFromUuid(uuid: string): Hex` (throws on a non-uuid, lowercases), `localIdFromName(name: "citizen" | "attester" | "guest"): Hex`
  - `credentialTypeId(orgId: Hex, localId: Hex): Hex`
  - `RESERVED_TYPE_IDS: { citizen: Hex; attester: Hex; guest: Hex }`
- Produces (`leaf.ts`): `type LeafKind = "account" | "claimKey"`; `LEAF_KIND_INDEX: Record<LeafKind, 0 | 1>`; `interface Leaf { kind: LeafKind; typeId: Hex; subject: Address; validUntil: bigint; salt: Hex }`; `leafHash(leaf: Leaf): Hex`; `leafToTuple(leaf: Leaf)` (the struct argument for viem contract calls).
- Produces (`merkle.ts`): `buildTree(leafHashes: readonly Hex[]): { root: Hex; proofOf(leaf: Hex): Hex[] }` (throws on an empty list and on duplicate hashes); `verifyProof(root: Hex, leaf: Hex, proof: readonly Hex[]): boolean`.
- Produces (`claim.ts`): `claimTypedData(p: { chainId: number; registry: Address; batchId: bigint; leaf: Hex; account: Address })` (viem typed-data object); `signClaim(claimKey: Hex, p: …same…): Promise<Hex>`; `recoverClaimSigner(p: …same… & { signature: Hex }): Promise<Address>`.

- [ ] **Step 1: Write the failing tests in `encodings.test.ts`**

```ts
test("reserved type ids are the contract constants", () => {
  assert.equal(RESERVED_TYPE_IDS.citizen,  "0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3");
  assert.equal(RESERVED_TYPE_IDS.attester, "0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d");
  assert.equal(RESERVED_TYPE_IDS.guest,    "0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7");
});
test("localIdFromUuid lowercases and rejects non-uuids", () => {
  assert.equal(localIdFromUuid("6F1C2C7E-0D3A-4B5E-9A51-3F7A1D2B9C10"), localIdFromUuid("6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10"));
  assert.throws(() => localIdFromUuid("verein"));
});
test("a single leaf is its own root with an empty proof", () => {
  const t = buildTree([H1]); assert.equal(t.root, H1); assert.deepEqual(t.proofOf(H1), []);
});
test("every leaf of 1, 2, 3, 5, 70 and 1000 leaves verifies; a foreign leaf and a truncated proof do not", …);
test("the tree does not depend on input order", …);            // buildTree(shuffled).root === buildTree(sorted).root
test("duplicate leaf hashes and an empty list are refused", …);
test("a claim signature recovers to the claim key and to nothing else when batch, leaf or account changes", …);
test("the committed vector file is reproduced exactly", …);     // re-run the generator's pure function, deepEqual with the JSON
```

- [ ] **Step 2: Run** `cd packages/credential-registry && pnpm test` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the four modules** with viem's `keccak256`, `encodeAbiParameters`, `concat`, `hashTypedData`, and `viem/accounts` `privateKeyToAccount` for signing. Relative imports without extensions.
- [ ] **Step 4: Write `scripts/make-vector.ts`** exporting `makeVector(): Vector` and writing the JSON when run directly. Fixed inputs, nothing random:
  - `orgUuid` `6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10`, `typeUuid` `0b9e4c55-7a1f-4e3a-8d2c-5a6b7c8d9e0f`
  - accounts `0x1111…1111`, `0x2222…2222`; claim private key `0x` + `"01".repeat(32)`; claiming account `0x3333…3333`
  - leaves: A `{account, 0x1111…, validUntil 0, salt 0xaa…aa}`, B `{account, 0x2222…, validUntil 1798761600, salt 0xbb…bb}`, C `{claimKey, address of the claim key, validUntil 0, salt 0xcc…cc}`
  - claim domain for the file: `chainId 100`, `registry 0x000000000000000000000000000000000000c0de`, `batchId 1`
  - JSON fields: `orgId`, `localId`, `typeId`, `leaves[]` (each with its fields, `tuple`, `hash`, `proof`), `root`, `claim { privateKey, signer, account, batchId, chainId, registry, digest, signature }`.
- [ ] **Step 5: Run** `pnpm tsx scripts/make-vector.ts && pnpm test` — Expected: PASS, 8 tests.
- [ ] **Step 6: Commit**

```bash
git add packages/credential-registry/package.json packages/credential-registry/tsconfig.json packages/credential-registry/src packages/credential-registry/scripts/make-vector.ts packages/credential-registry/test pnpm-lock.yaml
git commit -m "feat(credential-registry): leaf, tree and claim-signature encodings with a golden vector"
git push -u origin feat/credreg-1-contract
```

---

### Task 2: Contract — types, authority, reserved types, sources

**Files:**
- Create: `contracts/governor-contract/contracts/verification-system/CredentialRegistry.sol`
- Create: `contracts/governor-contract/contracts/verification-system/mocks/CredentialRegistryMocks.sol`
- Create: `contracts/governor-contract/test/credential-helpers.js`
- Test: `contracts/governor-contract/test/CredentialRegistry.types.test.js`

**Interfaces:**
- Consumes: the real `OrgRegistry` and `OrgMockSafe` (`mocks/OrgRegistryMocks.sol`); OrgRegistry views `isRegistered(bytes32)`, `getOrg(bytes32) returns (Org)` with `Org { address safe; uint64 generation; uint64 registeredAt; string metadataURI; }`, `roleOf(bytes32,address) returns (uint8)` (2 = Admin), `isOrgOwner(bytes32,address)`.
- Produces: everything under "types", "sources" and the views in the interface above. This task leaves `addBatch`, `revokeBatch`, `revokeLeaves`, `claim`, `selfClaim`, `renounce`, `prune`, `checkLeaf` unimplemented (Task 3).
- Produces (`CredentialRegistryMocks.sol`): `contract CredMockIdentity` with `mapping(address => bool) public hasCitizenNFT`, `mapping(address => bool) public hasAttesterNFT`, `uint256 public attesterCount`, `setCitizen(address,bool)`, `setAttester(address,bool)` (keeps `attesterCount` right). One instance serves as CitizenNFT, AttesterNFT and as OrgRegistry's attester set.
- Produces (`credential-helpers.js`): `deployRegister()` → `{ registry, orgs, identity, safe, safe2, owner, a1, a2, a3, a4, orgOwner, orgOwner2, admin, delegate, alice, bob, stranger }` with org `ORG_A` registered to `safe` (owners `orgOwner`, `orgOwner2`) through the real request/approve flow, `admin` holding `Role.Admin`, and bands as in `OrgRegistry.test.js`; `asSafe(safe, signer, target, fn, args)`; `revokeOrg(ctx, orgId)` (three attesters approve a revocation); `reRegisterOrg(ctx, orgId, safe)`; `cfg(overrides)` returning a `TypeConfig` with defaults `{ metadataURI: "https://x/meta.json", defaultValidity: 0, claimStart: 0, claimEnd: 0, supplyCap: 0, publicClaim: true }`; `LOCAL(n)` = `ethers.id("netizen:credential-type:v1:" + n)`; `typeId(orgId, localId)`.

- [ ] **Step 1: Write the failing tests** (`describe("CredentialRegistry — types and authority")`). One `it` per line; the right-hand side is the assertion.

| Test | Assertion |
|---|---|
| deploys with three reserved types | `getType(CITIZEN_TYPE)` = `{orgId: 0, kind: Role, policy: External}`; Attester likewise; Guest = `{kind: Membership, policy: SelfClaim, config.publicClaim: true}`; constants equal the three hex values in the interface; `owner()` = initial owner |
| ownership is two-step | `transferOwnership(x)` leaves `owner()` unchanged until `x` calls `acceptOwnership()` |
| the Safe creates a type | `asSafe(…createType)` emits `TypeCreated(typeId, ORG_A, local, Membership, IssuerBatch, 0)` and `TypeConfigured`; `typeIdOf(ORG_A, local)` equals the helper's `typeId` |
| a Safe owner and an Admin create types directly; a Member, a delegate and a stranger cannot | third to fifth revert `NotAuthorised` |
| the contract owner manages the community namespace only | `createType(COMMUNITY, …)` by owner passes, by `orgOwner` reverts `NotAuthorised`; owner `createType(ORG_A, …)` reverts `NotAuthorised` |
| an unregistered org cannot have types | `createType(ORG_B, …)` reverts `NotAuthorised` |
| duplicate id, External policy, long URI, bad window | `TypeExists`, `WrongPolicy`, `UriTooLong` (513 bytes; 512 passes), `BadConfig` (`claimEnd <= claimStart`, both non-zero) |
| updateType changes config, never kind or policy | emits `TypeConfigured`; `getType` shows new config, old kind/policy |
| retireType is irreversible and blocks edits | emits `TypeRetired`; `isTypeActive` false; `updateType` reverts `TypeInactive` |
| reserved types | owner `updateType(CITIZEN_TYPE, …)` passes; `retireType(CITIZEN_TYPE)` and `setDelegate(CITIZEN_TYPE, …)` revert `ExternalType` |
| delegates | authority `setDelegate` emits `DelegateSet`; `canIssue(typeId, delegate)` true, `canManage(ORG_A, delegate)` false; a delegate cannot appoint delegates |
| recognised is owner-only | emits `TypeRecognised`; `orgOwner` reverts `OwnableUnauthorizedAccount` |
| private-only switch | org authority and an attester can set it on (`OrgPrivateOnlySet(ORG_A, true, caller)`); both revert `NotAuthorised` turning it off; the owner turns it off; `setOrgPrivateOnly(COMMUNITY, true)` reverts `NotAuthorised` |
| org revocation deactivates its types | after `revokeOrg`, `isTypeActive` false and `canManage(ORG_A, orgOwner)` false |
| a re-registered org does not revive old types | after `reRegisterOrg`, the old type stays inactive; `updateType` on it reverts `TypeInactive`; a new `localId` works and stores `orgGeneration` 1 |
| holds for Citizen and Attester follows the NFTs | `identity.setCitizen(alice, true)` → `holds(CITIZEN_TYPE, alice)` true and `balanceOf(alice, uint256(CITIZEN_TYPE))` 1; false and 0 after `setCitizen(alice, false)` |
| sources are two-step with a delay | `proposeSources` emits `SourcesProposed(…, now + 2 days)`; `applySources` before the delay reverts `SourcesNotReady`; after `time.increase(2 days)` it emits `SourcesApplied` and `holds(CITIZEN_TYPE, …)` follows the new contract; `cancelSources` clears; EOA address reverts `NotContract`; `applySources` with nothing pending reverts `NoPendingSources`; non-owner reverts |
| uri | `uri(uint256(typeId))` is the metadata URI; unknown id is `""` |

- [ ] **Step 2: Run** `npx hardhat test test/CredentialRegistry.types.test.js` — Expected: FAIL (contract missing).
- [ ] **Step 3: Implement** the contract parts listed under Produces. Storage: `mapping(bytes32 => CredentialType) _types`, `mapping(bytes32 => bool) _exists`, `mapping(bytes32 => mapping(address => bool)) _delegates`, `mapping(bytes32 => bool) orgPrivateOnly`, the three source addresses plus a pending triple and `eta`. Write the contract-level NatSpec in the style of `OrgRegistry.sol`: what the register is, who may do what, the privacy property (salted leaves, only the count is public), the generation caveat from open question 2, and that `owner()` cannot issue or revoke an org's credentials.
- [ ] **Step 4: Run** the test file — Expected: PASS, 18 tests. Run `npx hardhat test test/OrgRegistry.test.js` — Expected: still PASS.
- [ ] **Step 5: Commit** (`CredentialRegistry.sol`, the mocks file, `credential-helpers.js`, the test) — `feat(contracts): CredentialRegistry types, authority, reserved types and settable sources`.

---

### Task 3: Contract — batches, claiming, revocation, expiry, soulbound

**Files:**
- Modify: `contracts/governor-contract/contracts/verification-system/CredentialRegistry.sol`
- Modify: `contracts/governor-contract/test/credential-helpers.js`
- Test: `contracts/governor-contract/test/CredentialRegistry.claims.test.js`

**Interfaces:**
- Consumes: Task 2's contract and helpers.
- Produces: `addBatch`, `revokeBatch`, `revokeLeaves`, `claim`, `selfClaim`, `renounce`, `prune`, `holds`, `checkLeaf`, `holdingOf`, `leafHash`, `claimDigest`, the ERC-1155 overrides.
- Produces (`credential-helpers.js`): `leaf(kind, typeId, subject, validUntil = 0n, salt = randomBytes32)` → `{ kind, typeId, subject, validUntil, salt }`; `hashLeaf(l)` (ethers `AbiCoder`, double keccak); `tree(leaves)` → `{ root, proof(l) }` with the tree rules of "Encodings" (written in plain JS here on purpose: a third implementation next to viem and Solidity); `signClaim(wallet, registry, batchId, leafHash, account)` (ethers `signTypedData`); `issued(ctx, opts)` → a context with one `Membership` type and one batch of leaves for `alice` (account leaf), `bob` (account leaf, `validUntil = now + 30 days`) and a claim-key leaf, returning `{ typeId, batchId, leaves: { alice, bob, key }, keyWallet, t }`; `withOrgB(ctx)` → registers `ORG_B` to `safe2` and returns a type and a batch of its own (for the cross-org tests).

Storage to add: `Batch[] _batches` (index 0 unused, so ids start at 1), `mapping(bytes32 => mapping(address => Holding)) _holdings`, `mapping(uint64 => mapping(bytes32 => bool)) _leafRevoked`, `mapping(uint64 => mapping(bytes32 => address)) _leafBoundTo`.

- [ ] **Step 1: Write the failing tests.** One `it` per line.

*Issuing*

| Test | Assertion |
|---|---|
| authority and delegates add batches; ids start at 1 | first `addBatch` emits `BatchAdded(1, typeId, issuer, root, 3)`; `batchCount()` 1; `getBatch(1)` matches; stranger reverts `NotAuthorised` |
| a batch needs a root and a count | zero root or count 0 reverts `EmptyBatch` |
| no batches for SelfClaim, External, retired or dead-org types | `WrongPolicy`, `ExternalType`, `TypeInactive`, `TypeInactive` |
| a batch outlives its issuer's role | Admin adds a batch, the Safe sets the role to None, `alice` still claims |

*Claiming*

| Test | Assertion |
|---|---|
| an account leaf mints to its subject | emits `Claimed(typeId, alice, 1, hash, 0)` and `TransferSingle(alice, 0x0, alice, id, 1)`; `holds` true; `balanceOf` 1; `getType().supply` 1; `holdingOf` = `{1, 0, now, hash}` |
| only the subject may claim an account leaf | `bob` with `alice`'s leaf and proof reverts `NotLeafSubject` |
| a claim-key leaf mints to whoever holds the key | `carol` claims with `signClaim(keyWallet, …, carol)`; `leafBoundTo(1, hash)` = `carol` |
| a claim-key signature cannot be redirected (front-running) | `mallory` submitting `carol`'s signature reverts `BadClaimSignature`; a signature for another batch id or by another key reverts `BadClaimSignature` |
| claim-key leaf stays bound after renounce | `carol` claims, renounces; `mallory` with a fresh valid signature from the key reverts `LeafBoundToOther`; `carol` claims again without any signature (`"0x"`) |
| replay of a leaf | `alice` claiming twice keeps balance 1 and `supply` 1 (no second `TransferSingle`); the same leaf presented against another batch id reverts `InvalidProof`; against a batch of another type reverts `LeafTypeMismatch` |
| wrong proof | reverts `InvalidProof`; unknown batch reverts `UnknownBatch` |
| renewal replaces the holding | batch 2 holds a leaf for `bob` with a later `validUntil`; after claiming it `holdingOf(bob)` = `{2, later, …}`, balance 1, `supply` unchanged |
| an expired leaf cannot be claimed | after `time.increaseTo(validUntil + 1)` reverts `LeafExpired`; at exactly `validUntil` it passes |
| private-only types and orgs | `publicClaim: false` → `claim` reverts `PublicClaimDisabled`, `checkLeaf` returns `(Valid, 0x0)`; `setOrgPrivateOnly(ORG_A, true)` blocks a `Membership` type but not a `Role` or `Badge` type of the same org |
| claim window | before `claimStart` and after `claimEnd` reverts `ClaimWindowClosed`; inside passes |
| supply cap | cap 1: second claimer reverts `SupplyCapReached`; after the first renounces the second passes |
| mint calls no receiver hook | a contract account without `onERC1155Received` claims its account leaf successfully (add `contract CredMockPlainAccount { function exec(address target, bytes calldata data) external returns (bytes memory) }` to the mocks file: forwards the call, bubbles the revert, implements no receiver interface) |

*Self-claim*

| Test | Assertion |
|---|---|
| anyone self-claims Guest once | emits `SelfClaimed(GUEST_TYPE, alice, 0)`; second call reverts `AlreadyHeld`; `holdingOf.batchId` 0 |
| self-claim honours validity, window and cap | `defaultValidity` 1 day → `validUntil = now + 86400`; after expiry `holds` false and a second `selfClaim` refreshes without a second mint; window and cap revert as in claiming |
| self-claim is refused for batch and external types | `WrongPolicy`, `ExternalType` |

*Revocation, expiry, pruning*

| Test | Assertion |
|---|---|
| revoking a claimed leaf burns it | `revokeLeaves(1, [hash])` emits `LeafRevoked(1, hash)` and `TransferSingle(…, alice, 0x0, id, 1)`; `holds` false; `supply` 0; re-claim reverts `LeafIsRevoked`; `checkLeaf` returns `Revoked` |
| revoking an unclaimed leaf reveals no account | only `LeafRevoked`; `checkLeaf` returns `Revoked`; `claim` reverts `LeafIsRevoked` |
| revocation is scoped to the batch and its authority | org B's authority calling `revokeLeaves(1, [hash])` reverts `NotAuthorised`; revoking the same hash in org B's own batch leaves `alice`'s holding untouched |
| revoking a batch stops every holding in it without transactions per holder | `BatchRevoked(1)`; `holds` false for `alice`; `balanceOf` 0; `claim` reverts `BatchIsRevoked`; a holding from batch 2 is unaffected |
| expiry needs no transaction | `holds(bob)` true at `validUntil`, false one second later; `balanceOf` 0; `checkLeaf` returns `Expired` |
| generation change | after `revokeOrg`: `holds` false, `claim` reverts `TypeInactive`, `checkLeaf` returns `Inactive`; after `reRegisterOrg` all three stay the same |
| retiring a type stops its holdings | `holds` false; `checkLeaf` returns `Inactive` |
| renounce | emits `Renounced` and a burn; `NotHeld` when nothing is held; works on a stale holding; `checkLeaf` still returns `Valid` for the leaf (the private proof survives) |
| prune | reverts `StillValid` on a live holding; burns an expired, batch-revoked or dead-org holding and emits `Pruned`; frees a capped slot |
| checkLeaf statuses | `Invalid` for a bad proof, an unknown batch and a type mismatch (never reverts); `Valid` returns the bound account for a claimed claim-key leaf |

*Soulbound*

| Test | Assertion |
|---|---|
| no transfers and no approvals | `safeTransferFrom`, `safeBatchTransferFrom` and `setApprovalForAll` revert `Soulbound` |
| balance is 0 or 1 | `balanceOfBatch([alice, bob, stranger], [id, id, id])` = `[1, 1, 0]`; no sequence of claim / renew / self-claim in this file produces a `TransferSingle` with value other than 1 |
| gas | `claim` with a 7-hash proof (70 leaves) uses less than 250000 gas; `addBatch` less than 150000 (the sponsor caps `callGasLimit` at 1.5M) |

- [ ] **Step 2: Run** `npx hardhat test test/CredentialRegistry.claims.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** Follow "Rules the code must follow" literally, including the order of checks in `claim` (tests depend on which error wins). `checkLeaf` runs the same checks but returns a status instead of reverting, and ignores `publicClaim`, the private-only switch, the claim window and the cap (those limit minting, not validity).
- [ ] **Step 4: Run** both CredentialRegistry test files — Expected: PASS (18 + 33 tests). Hardhat refuses to deploy bytecode over 24576 bytes, so a passing run also proves the size limit; if it fails for size, move the `checkLeaf` body and the type-activity check into internal functions shared with `claim` before considering a library.
- [ ] **Step 5: Commit** — `feat(contracts): CredentialRegistry batches, claiming, revocation and soulbound rules`.

---

### Task 4: Cross-language vector (Solidity ↔ viem ↔ ethers)

**Files:**
- Test: `contracts/governor-contract/test/CredentialRegistry.vector.test.js`

**Interfaces:**
- Consumes: `packages/credential-registry/test/vectors/credential-vector.json` (Task 1), the contract's `typeIdOf`, `leafHash`, `claimDigest`, `addBatch`, `checkLeaf`, `claim`.

- [ ] **Step 1: Write the test** (`require("../../../packages/credential-registry/test/vectors/credential-vector.json")`):

```js
it("type id", async () => expect(await registry.typeIdOf(v.orgId, v.localId)).to.equal(v.typeId));
it("leaf hashes", async () => { for (const l of v.leaves) expect(await registry.leafHash(l.tuple)).to.equal(l.hash); });
it("helper tree equals the vector tree", () => expect(tree(v.leaves.map(asLeaf)).root).to.equal(v.root));
it("every vector proof verifies on chain", async () => {
  // a type with localId v.localId in an org whose id is v.orgId (register that id in the fixture), then addBatch(v.typeId, v.root, 3)
  for (const l of v.leaves) expect((await registry.checkLeaf(1, l.tuple, l.proof))[0]).to.equal(LeafStatus.Valid);
});
it("the vector digest is the EIP-712 digest for the vector domain", () =>
  expect(ethers.TypedDataEncoder.hash({ name: "CredentialRegistry", version: "1", chainId: v.claim.chainId, verifyingContract: v.claim.registry },
    { Claim: [{ name: "batchId", type: "uint64" }, { name: "leaf", type: "bytes32" }, { name: "account", type: "address" }] },
    { batchId: v.claim.batchId, leaf: v.leaves[2].hash, account: v.claim.account })).to.equal(v.claim.digest));
it("the contract's digest follows the same rule for its own domain", async () => { /* ethers hash with chainId 31337 and the deployed address equals registry.claimDigest(1, hash, account) */ });
it("the vector claim key claims on chain", async () => { /* impersonate v.claim.account, sign with new ethers.Wallet(v.claim.privateKey) for the deployed domain, claim leaf C, expect Claimed */ });
```

- [ ] **Step 2: Run** `npx hardhat test test/CredentialRegistry.vector.test.js` — Expected: PASS, 7 tests. A failure here means one of the three implementations is wrong: find which by comparing against a hand calculation, never by regenerating the JSON until it fits.
- [ ] **Step 3: Commit** — `test(contracts): CredentialRegistry cross-language vector`.

---

### Task 5: Fork test against the live OrgRegistry and NFTs

**Files:**
- Test: `contracts/governor-contract/test/CredentialRegistry.fork.test.js`

**Interfaces:**
- Consumes: live Gnosis contracts — CitizenNFTv2 `0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5`, AttesterNFTv2 `0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82`, OrgRegistry `0x320b4ea2f4E31b81245e684D08AF593DE05E9919`, Attester Safe `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa`; Safe 1.4.1 factory addresses and ABI fragments from `scripts/test-env/org-registry-e2e.cjs` (`SAFE`, `SAFE_ABI`, `FACTORY_ABI`); holder discovery from `test/V3Bootstrap.fork.test.js` (`holdersFromLogs`).

Facts checked 2026-11-17: the production OrgRegistry has `orgCount() == 0` and `migrationFinalized() == false`. The test therefore registers its own org by impersonating the Attester Safe and calling `migrationRegister`. If `migrationFinalized()` is true when this runs, register through `requestRegistration` + approvals by impersonated attesters instead.

Gate: `const enabled = process.env.CREDREG_FORK_TEST === "1" && process.env.GNOSIS_FORK === "1"`, `describe.skip` otherwise, timeout 10 minutes (pattern: `test/V3Cutover.fork.test.js`).

- [ ] **Step 1: Write the tests**

| Test | Assertion |
|---|---|
| reserved types follow the live NFTs | for three live citizens and every live attester from the logs: `holds(CITIZEN_TYPE, c)` and `holds(ATTESTER_TYPE, a)` are true; false for a fresh random address |
| a real Safe is an org authority | deploy a 1-of-1 Safe 1.4.1 through the canonical factory, `migrationRegister` it as a fresh org id from the impersonated Attester Safe, then `createType` and `addBatch` through `Safe.execTransaction` with a pre-validated signature (`r = owner, s = 0, v = 1`); the Safe's owner also calls `createType` directly (`isOrgOwner` path) |
| a live Admin role issues | the Safe calls `OrgRegistry.setRole(orgId, admin, 2)`; `admin` adds a batch |
| a Safe account claims | a second 1-of-1 Safe (a member's account) claims its account leaf through `execTransaction`; `holds` true; `balanceOf` 1 |
| revoking the org on the live registry kills its credentials | impersonated live attesters open and approve a revocation until `OrgRevoked`; `holds` false; `claim` reverts `TypeInactive`; `prune` burns the Safe account's holding |
| sources hand-over | impersonated owner proposes the test-environment NFTs (`deployments/gnosis-test.json` `contracts`) and applies after `evm_increaseTime` 2 days; `holds(CITIZEN_TYPE, …)` then follows the test NFT |

- [ ] **Step 2: Run** `CREDREG_FORK_TEST=1 GNOSIS_FORK=1 npx hardhat test test/CredentialRegistry.fork.test.js` — Expected: PASS, 6 tests. Without the env vars: 6 pending. If the public RPC rate-limits, set `GNOSIS_RPC_URL`; do not weaken assertions.
- [ ] **Step 3: Commit** — `test(contracts): CredentialRegistry fork test against live OrgRegistry and NFTs`.

---

### Task 6: ABI, reader and replay in `@netizen-labs/credential-registry`

**Files:**
- Create: `packages/credential-registry/scripts/sync-abi.ts` (reads the Hardhat artifact, writes `src/abi.ts`)
- Create: `packages/credential-registry/src/abi.ts` (generated, committed), `src/replay.ts`, `src/reader.ts`, `src/directory-cli.ts`
- Modify: `packages/credential-registry/src/index.ts`, `package.json` (script `"abi": "tsx scripts/sync-abi.ts"`, bin `netizen-credential-register`)
- Test: `packages/credential-registry/test/replay.test.ts`, `test/reader.test.ts`

**Interfaces:**
- Consumes: the compiled artifact `contracts/governor-contract/artifacts/contracts/verification-system/CredentialRegistry.sol/CredentialRegistry.json`.
- Produces (`abi.ts`): `CREDENTIAL_REGISTRY_ABI` (`as const`, the full ABI), `REGISTER_EVENTS` (the sixteen contract events plus `TransferSingle`).
- Produces (`replay.ts`):
  - `interface RegisterLog { eventName: RegisterEventName; args: Record<string, unknown>; blockNumber: bigint; logIndex: number }`
  - `interface TypeEntry { typeId; orgId; localId; kind: "role" | "membership" | "badge"; policy: "issuerBatch" | "selfClaim" | "external"; orgGeneration: bigint; recognised: boolean; retired: boolean; config: { metadataURI: string; defaultValidity: bigint; claimStart: bigint; claimEnd: bigint; supplyCap: number; publicClaim: boolean }; delegates: Set<Address> }`
  - `interface BatchEntry { batchId: bigint; typeId; issuer; root; count: number; revoked: boolean; revokedLeaves: Set<Hex>; blockNumber: bigint }`
  - `interface HoldingEntry { typeId; account; batchId: bigint; leaf: Hex | null; validUntil: bigint }`
  - `interface RegisterState { types: Map<Hex, TypeEntry>; batches: Map<bigint, BatchEntry>; holdings: Map<string, HoldingEntry>; privateOnlyOrgs: Set<Hex> }` (holdings key `` `${typeId}:${account}` `` lowercase)
  - `replayRegisterEvents(logs: readonly RegisterLog[]): RegisterState`
  - `isHoldingLive(state: RegisterState, h: HoldingEntry, ctx: { nowSec: bigint; orgAlive: (orgId: Hex, generation: bigint) => boolean }): boolean` — the same rule as `holds`.
- Produces (`reader.ts`): `createCredentialRegistryReader({ client, address }: { client: PublicClient; address: Address })` returning `{ holds(typeId, account): Promise<boolean>; holdsMany(typeIds: readonly Hex[], account): Promise<boolean[]>` (one multicall)`; getType(typeId): Promise<TypeEntry | null>; checkLeaf(batchId: bigint, leaf: Leaf, proof: readonly Hex[]): Promise<{ status: "invalid" | "valid" | "expired" | "revoked" | "inactive"; boundTo: Address | null }>; canIssue(typeId, account): Promise<boolean>; canManage(orgId, account): Promise<boolean>; loadRegister(fromBlock: bigint, opts?: { chunk?: bigint; toBlock?: bigint }): Promise<RegisterState> }` (chunk default 50000, as `packages/org-registry/src/reader.ts`).

Replay rules: `Claimed` and `SelfClaimed` set the holding; `Renounced`, `Pruned` and a `LeafRevoked` whose leaf is the account's current holding in that batch delete it; `BatchRevoked` only flags the batch (the contract burns nothing then); `TransferSingle` is ignored for state and used in one test as a cross-check.

- [ ] **Step 1: Write the failing tests**

```ts
test("replay rebuilds types, config updates, delegates, recognition and retirement", …);
test("replay rebuilds holdings: claim, renewal, renounce, prune, leaf revocation", …);
test("a batch revocation keeps the holding entry but isHoldingLive is false", …);
test("isHoldingLive: expiry, dead org generation, retired type", …);
test("logs are ordered by block and log index, not by input order", …);
test("generated ABI matches the compiled artifact", (t) => { /* skip when the artifact is absent, as packages/org-registry/test does */ });
test("reader.holdsMany issues one multicall and maps results in order", …);   // fake PublicClient recording calls
test("reader.checkLeaf maps the status enum by index", …);
```

- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL.
- [ ] **Step 3: Implement**; run `cd contracts/governor-contract && npx hardhat compile && cd ../../packages/credential-registry && pnpm abi`. `directory-cli.ts` prints types and holder counts from a deploy block (pattern: `packages/org-registry/src/directory-cli.ts`); it is the "anyone can rebuild the register" proof and may use `node:` imports.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` — Expected: PASS (16 tests with Task 1's).
- [ ] **Step 5: Commit** — `feat(credential-registry): generated ABI, event replay and reader`.

---

### Task 7: Internal security review, two passes

The OrgRegistry was reviewed by an independent agent with proof-of-concept tests, fixed, then re-reviewed (`docs/superpowers/specs/2026-09-26-org-safe-identity-design.md` §8). Same procedure.

**Files:**
- Create: `docs/CREDENTIAL_REGISTRY_AUDIT.md`
- Create: `contracts/governor-contract/test/CredentialRegistry.audit.test.js` (every finding's PoC, kept as a regression test)
- Modify: `CredentialRegistry.sol` and the earlier test files as findings require

- [ ] **Step 1: Pass 1.** Dispatch a fresh reviewer (no access to this plan's reasoning, only the contract, the spec and the tests) with this brief: find ways to (a) hold or prove a credential one should not, (b) take or block someone else's, (c) issue or revoke without authority, (d) learn who is in a batch without them claiming, (e) make `holds`, `claim` or `prune` revert for everyone (a hostile org Safe, a huge proof, a reverting source), (f) break 0/1 balance or supply accounting. Named angles: claim-key replay across batches, chains and after renounce; signature malleability; leaf collision between `Account` and `ClaimKey` kinds; inner-node-as-leaf; an org whose "Safe" is a hostile contract answering `isOwner` true for all; reentrancy through source contracts; a `revokeLeaves` array large enough to exceed the block gas limit; `balanceOfBatch` with External types; `updateType` shrinking the cap below supply; `proposeSources` to a contract that reverts. Every finding comes with a failing Hardhat test.
- [ ] **Step 2: Fix every finding** rated medium or higher (lower ones: fix or record the reason not to). Each fix: PoC test red → fix → green. Run all CredentialRegistry test files and `OrgRegistry.test.js`.
- [ ] **Step 3: Pass 2.** A second fresh reviewer reviews the fixed contract with the pass-1 findings in hand: are the fixes complete, did they open anything new, does the interface in this plan still hold. If a fix changed an external signature, an event or an error, update this plan's interface block, `sync-abi`, the replay and the vector in the same commit and say so in the audit file.
- [ ] **Step 4: Write `docs/CREDENTIAL_REGISTRY_AUDIT.md`**: scope and commit hash per pass, findings table (id, severity, description, PoC test name, fix commit or accepted-risk reason), and the known limits that are by design: a private claim-key leaf is a bearer document until it is claimed; an org learns by elimination who accepted privately (accepted minus public); the count of a batch is public; the owner can re-point the sources after 2 days; an external audit is recommended before orgs rely on a credential for money or access.
- [ ] **Step 5: Run** `npx hardhat test test/CredentialRegistry.types.test.js test/CredentialRegistry.claims.test.js test/CredentialRegistry.vector.test.js test/CredentialRegistry.audit.test.js` — Expected: all PASS. **Commit** — `fix(contracts): CredentialRegistry audit findings` and `docs: CredentialRegistry internal audit`.

---

### Task 8: Deploy scripts, test-environment rehearsal, address export

**Files:**
- Create: `contracts/governor-contract/scripts/test-env/credential-registry-e2e.cjs`
- Create: `contracts/governor-contract/scripts/deploy-credential-registry.cjs`
- Modify: `contracts/governor-contract/scripts/test-env/lib.cjs` (add the production OrgRegistry `0x320b4ea2f4E31b81245e684D08AF593DE05E9919` to `PRODUCTION_ADDRESSES`)
- Modify: `packages/blockchain/src/index.ts` (add `credentialRegistry` to `CONTRACTS` and export `CREDENTIAL_REGISTRY_DEPLOY_BLOCK`)
- Modify: `docs/ONCHAIN_TEST_ENVIRONMENT.md` (contracts table + a "Credential register" section with the two commands)

**Interfaces:**
- Produces (`credential-registry-e2e.cjs`), modelled on `scripts/test-env/org-registry-e2e.cjs` (same guards: `ROEBEL_TEST_ENV=1`, chain 100, burner must be the manifest owner, `assertNotProduction` on every write target, idempotent, `--dry-run`, `--fresh`): deploys `CredentialRegistry(owner = burner, test CitizenNFTv2, test AttesterNFTv2, test OrgRegistry, reservedURIs)`; test org A's Safe creates a `Membership` type; adds a batch of three leaves (two co-signer accounts, one claim key); one co-signer claims publicly, one stays private (`checkLeaf` → `Valid`), the claim key is claimed by a third co-signer; one leaf is revoked; a co-signer self-claims Guest; asserts `holds` for a test citizen and attester; writes `contracts.credentialRegistry`, `credentialRegistryDeployBlock` and a `credentialRegistryE2E` result block into `deployments/gnosis-test.json`. Rehearsal mode: `CRED_E2E_REHEARSAL=1 GNOSIS_FORK=1 ROEBEL_TEST_ENV=1 npx hardhat run scripts/test-env/credential-registry-e2e.cjs` impersonates the burner and co-signers and writes nothing to the manifest.
- Produces (`deploy-credential-registry.cjs`), modelled on `scripts/deploy-org-registry.cjs`: owner = `deployments/gnosis-v2.json` `addresses.ownerSafe`, sources = production CitizenNFTv2, AttesterNFTv2, OrgRegistry (`deployments/org-registry.json`), `reservedURIs` from `--uris <citizen>,<attester>,<guest>` (required; plan 2 Task 3 defines them), refuses when `deployments/credential-registry.json` exists, refuses on any chain but 100, checks code at all four addresses, `--dry-run`, verifies `owner()`, the three sources and the three reserved type ids after deployment, writes `deployments/credential-registry.json` `{ network, chainId, deployedAt, deployer, credentialRegistry, deployBlock, txHash, owner, citizenNFT, attesterNFT, orgRegistry, reservedURIs, note }`.
- Produces (`packages/blockchain`): `CONTRACTS.credentialRegistry: ""` with the comment `// CredentialRegistry — NOT DEPLOYED to production yet (owner gate, docs/superpowers/plans/2026-11-17-credreg-1-contract.md). Empty = feature off.` and `export const CREDENTIAL_REGISTRY_DEPLOY_BLOCK = 0;`. The ABI is exported from `@netizen-labs/credential-registry` (Task 6), not from this package.

- [ ] **Step 1: Write both scripts.**
- [ ] **Step 2: Rehearse the test-environment run on a fork:** `cd contracts/governor-contract && npx hardhat compile && CRED_E2E_REHEARSAL=1 GNOSIS_FORK=1 ROEBEL_TEST_ENV=1 npx hardhat run scripts/test-env/credential-registry-e2e.cjs` — Expected: every step prints `✓`, exit code 0, `git status` shows no change to `deployments/gnosis-test.json`.
- [ ] **Step 3: Dry-run the production script** (plain ethers against the public RPC, read-only; generate a throwaway key for it, never use a real one): `DEPLOYER_PRIVATE_KEY=0x<throwaway key> node scripts/deploy-credential-registry.cjs --dry-run --uris a,b,c` — Expected: prints deployer, owner Safe, the three sources with "has code", then `dry run: nothing sent.`
- [ ] **Step 4: Prove the guards:** `node scripts/test-env/credential-registry-e2e.cjs` without `ROEBEL_TEST_ENV` — Expected: `REFUSING: set ROEBEL_TEST_ENV=1 …`, exit code 1.
- [ ] **Step 5: Update the docs file and `packages/blockchain`; commit** — `feat(contracts): CredentialRegistry deploy scripts, test-environment rehearsal, address export`.

---

## Owner gates (Max)

Nothing below is an agent step.

1. **Read the open questions** at the top and `docs/CREDENTIAL_REGISTRY_AUDIT.md`. Decide whether an external audit is wanted before production.
2. **Deploy to the test environment** (burner key in `contracts/governor-contract/.env`, a little xDAI): `ROEBEL_TEST_ENV=1 node scripts/test-env/credential-registry-e2e.cjs`. Commit the updated `deployments/gnosis-test.json`. Plans 2 and 3 are tested against this address.
3. **Production deployment**, after plan 2 Task 3 has fixed the three reserved metadata URLs and the preview device pass of plan 3 is done: `node -r dotenv/config scripts/deploy-credential-registry.cjs --uris … dotenv_config_path=<.env>`, Blockscout verification, then fill `CONTRACTS.credentialRegistry`, `CREDENTIAL_REGISTRY_DEPLOY_BLOCK`, add the address to root `CLAUDE.md` and to `scripts/test-env/lib.cjs` `PRODUCTION_ADDRESSES`.
4. **Orgs must exist on chain.** The production OrgRegistry holds no org today (`orgCount() == 0`; `deployments/org-registry.json` `migration.batch1.registered: false`). No org can create a type until its Safe is registered. The Attester Safe signing the pending `migrationRegister` batch is a precondition for the whole series reaching production.
5. **Later:** hand ownership to the Timelock (`transferOwnership` + `acceptOwnership` through a proposal), together with OrgRegistry.

## Self-review notes

- Spec 5.1 coverage: standard and soulbound (Task 3), type fields (interface), authority and delegates (Task 2), community namespace and recognised (Task 2), batches and both leaf kinds (Task 3), public claim and private proof (Task 3 `claim` / `checkLeaf`), `holds` incl. Citizen/Attester and settable pointers (Tasks 2, 5), revocation, renounce, expiry, org revocation (Tasks 3, 5), Guest (Tasks 2, 3), ownership without proxy (Task 2). Spec 5.9: test environment first, audit twice (Tasks 7, 8). Spec 8: `holds`, private-proof check, metadata, recognised flag, published ABI and reader (Tasks 3, 6); the node route is plan 2.
- Not in this plan by design: no `issueTo` (every credential needs the holder's own claim), no per-holder revocation without a leaf (self-claimed types are ended with `retireType` or a claim window), no claim-many (accounts batch calls in one sponsored operation).
