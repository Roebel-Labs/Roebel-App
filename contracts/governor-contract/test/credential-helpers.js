const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// NSP-14 canonical id: keccak256("netizen:org:v1:" + lowercase uuid).
const orgIdOf = (uuid) => ethers.id(`netizen:org:v1:${uuid.toLowerCase()}`);
const ORG_A = orgIdOf("6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10");
const ORG_B = orgIdOf("0b9e4c55-7a1f-4e3a-8d2c-5a6b7c8d9e0f");
const COMMUNITY = ethers.ZeroHash;

const CITIZEN_TYPE = "0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3";
const ATTESTER_TYPE = "0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d";
const GUEST_TYPE = "0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7";
const RESERVED_URIS = ["https://x/citizen.json", "https://x/attester.json", "https://x/guest.json"];

const Kind = { Role: 0n, Membership: 1n, Badge: 2n };
const Policy = { IssuerBatch: 0n, SelfClaim: 1n, External: 2n };
const OrgRole = { None: 0, Member: 1, Admin: 2 };
const DAY = 24 * 60 * 60;

// Bands as in OrgRegistry.test.js: approval 50%/floor2/cap5, rejection 25%/floor2/cap5, revocation 67%/floor3/no cap.
const band = (percentBps, floor, cap) => ({ percentBps, floor, cap });
const APPROVAL = band(5000, 2, 5);
const REJECTION = band(2500, 2, 5);
const REVOCATION = band(6700, 3, 65535);

const LOCAL = (n) => ethers.id(`netizen:credential-type:v1:${n}`);
const typeId = (orgId, localId) =>
  ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [orgId, localId]));

/** A TypeConfig with test defaults. */
function cfg(overrides = {}) {
  return {
    metadataURI: "https://x/meta.json",
    defaultValidity: 0n,
    claimStart: 0n,
    claimEnd: 0n,
    supplyCap: 0n,
    publicClaim: true,
    ...overrides,
  };
}

/** Execute a call on `target` as the Safe (the Safe is msg.sender). */
async function asSafe(safe, signer, target, fn, args) {
  const data = target.interface.encodeFunctionData(fn, args);
  return safe.connect(signer).exec(await target.getAddress(), data);
}

/** Register `orgId` to `safe` through the real request/approve flow (two attesters approve). */
async function registerOrg(ctx, orgId, safe, metadataURI = "") {
  const { orgs, orgOwner, a1, a2 } = ctx;
  await asSafe(safe, orgOwner, orgs, "requestRegistration", [orgId, metadataURI]);
  const [, requestId] = await orgs.openRegistrationOf(await safe.getAddress());
  await orgs.connect(a1).approveRequest(requestId);
  await orgs.connect(a2).approveRequest(requestId);
}

/** Three attesters approve a revocation of `orgId`. */
async function revokeOrg(ctx, orgId) {
  const { orgs, a1, a2, a3 } = ctx;
  await orgs.connect(a1).requestRevocation(orgId, "");
  const [, requestId] = await orgs.openRevocationOf(orgId);
  await orgs.connect(a1).approveRequest(requestId);
  await orgs.connect(a2).approveRequest(requestId);
  await orgs.connect(a3).approveRequest(requestId);
}

/** Register a revoked `orgId` again (the generation has moved on). */
async function reRegisterOrg(ctx, orgId, safe) {
  await registerOrg(ctx, orgId, safe);
}

async function deployRegister() {
  const [owner, a1, a2, a3, a4, orgOwner, orgOwner2, admin, delegate, alice, bob, stranger, member] =
    await ethers.getSigners();

  const identity = await (await ethers.getContractFactory("CredMockIdentity")).deploy();
  for (const a of [a1, a2, a3, a4]) await identity.setAttester(a.address, true);

  const orgs = await (await ethers.getContractFactory("OrgRegistry")).deploy(
    owner.address,
    await identity.getAddress(),
    APPROVAL,
    REJECTION,
    REVOCATION,
  );
  const Safe = await ethers.getContractFactory("OrgMockSafe");
  const safe = await Safe.deploy([orgOwner.address, orgOwner2.address]);
  const safe2 = await Safe.deploy([orgOwner.address]);

  const registry = await (await ethers.getContractFactory("CredentialRegistry")).deploy(
    owner.address,
    await identity.getAddress(),
    await identity.getAddress(),
    await orgs.getAddress(),
    RESERVED_URIS,
  );

  const ctx = {
    registry, orgs, identity, safe, safe2,
    owner, a1, a2, a3, a4, orgOwner, orgOwner2, admin, delegate, alice, bob, stranger, member,
  };
  await registerOrg(ctx, ORG_A, safe);
  await asSafe(safe, orgOwner, orgs, "setRole", [ORG_A, admin.address, OrgRole.Admin]);
  await asSafe(safe, orgOwner, orgs, "setRole", [ORG_A, member.address, OrgRole.Member]);
  return ctx;
}

// ---------------------------------------------------------------------------
// Leaves, trees and claim signatures — written in plain JS with ethers on
// purpose: a third implementation next to the viem package and Solidity.
// ---------------------------------------------------------------------------

const LeafKind = { Account: 0n, ClaimKey: 1n };
const LeafStatus = { Invalid: 0n, Valid: 1n, Expired: 2n, Revoked: 3n, Inactive: 4n };

/** A leaf with a fresh random salt unless one is given. */
function leaf(kind, typeId_, subject, validUntil = 0n, salt = ethers.hexlify(ethers.randomBytes(32))) {
  return { kind: BigInt(kind), typeId: typeId_, subject, validUntil: BigInt(validUntil), salt };
}

/** keccak256(bytes.concat(keccak256(abi.encode(uint8 kind, typeId, subject, validUntil, salt)))). */
function hashLeaf(l) {
  const inner = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "bytes32", "address", "uint64", "bytes32"],
      [l.kind, l.typeId, l.subject, l.validUntil, l.salt],
    ),
  );
  return ethers.keccak256(inner);
}

const hashPair = (a, b) => (BigInt(a) < BigInt(b) ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a])));

/**
 * Sorted-leaf Merkle tree with commutative pair hashing; an unpaired last node
 * moves up unchanged; a single leaf is its own root with an empty proof.
 */
function tree(leaves) {
  if (leaves.length === 0) throw new Error("tree: no leaves");
  const layer0 = leaves.map(hashLeaf).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
  const layers = [layer0];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  function proof(l) {
    let idx = layer0.indexOf(hashLeaf(l));
    if (idx < 0) throw new Error("tree: leaf not in tree");
    const out = [];
    for (let d = 0; d < layers.length - 1; d++) {
      const sib = idx ^ 1;
      if (sib < layers[d].length) out.push(layers[d][sib]);
      idx >>= 1;
    }
    return out;
  }
  return { root, proof, layers };
}

/** EIP-712 Claim signature by a claim key, binding `leafHash` in `batchId` to `account`. */
async function signClaim(wallet, registry, batchId, leafHash, account) {
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: "CredentialRegistry", version: "1", chainId, verifyingContract: await registry.getAddress() };
  const types = { Claim: [
    { name: "batchId", type: "uint64" },
    { name: "leaf", type: "bytes32" },
    { name: "account", type: "address" },
  ] };
  return wallet.signTypedData(domain, types, { batchId, leaf: leafHash, account });
}

/** The Safe creates a type in ORG_A (default Membership / IssuerBatch). */
async function createOrgType(ctx, opts = {}) {
  const orgId = opts.orgId ?? ORG_A;
  const safe = opts.safe ?? ctx.safe;
  const local = LOCAL(opts.name ?? "issued");
  await asSafe(safe, ctx.orgOwner, ctx.registry, "createType", [
    orgId, local, opts.kind ?? Kind.Membership, opts.policy ?? Policy.IssuerBatch, opts.config ?? cfg(),
  ]);
  return typeId(orgId, local);
}

/** The Safe publishes a batch of `leaves` for `typeId_`; returns { batchId, t }. */
async function addBatchOf(ctx, typeId_, leaves, safe = ctx.safe) {
  const t = tree(leaves);
  await asSafe(safe, ctx.orgOwner, ctx.registry, "addBatch", [typeId_, t.root, leaves.length]);
  return { batchId: await ctx.registry.batchCount(), t };
}

/**
 * One Membership type in ORG_A and one batch with an account leaf for alice, an
 * account leaf for bob valid for 30 days and a claim-key leaf.
 */
async function issued(ctx, opts = {}) {
  const tId = await createOrgType(ctx, opts);
  const keyWallet = ethers.Wallet.createRandom();
  const now = BigInt(await time.latest());
  const leaves = {
    alice: leaf(LeafKind.Account, tId, ctx.alice.address),
    bob: leaf(LeafKind.Account, tId, ctx.bob.address, now + BigInt(30 * DAY)),
    key: leaf(LeafKind.ClaimKey, tId, keyWallet.address),
  };
  const { batchId, t } = await addBatchOf(ctx, tId, [leaves.alice, leaves.bob, leaves.key]);
  return { typeId: tId, batchId, leaves, keyWallet, t };
}

/** Registers ORG_B to safe2 and gives it a type and a batch of its own. */
async function withOrgB(ctx) {
  await registerOrg(ctx, ORG_B, ctx.safe2);
  const tId = await createOrgType(ctx, { orgId: ORG_B, safe: ctx.safe2, name: "org-b" });
  const leaves = { alice: leaf(LeafKind.Account, tId, ctx.alice.address) };
  const { batchId, t } = await addBatchOf(ctx, tId, [leaves.alice], ctx.safe2);
  return { typeId: tId, batchId, leaves, t };
}

module.exports = {
  ORG_A, ORG_B, COMMUNITY, CITIZEN_TYPE, ATTESTER_TYPE, GUEST_TYPE, RESERVED_URIS,
  Kind, Policy, OrgRole, LeafKind, LeafStatus, DAY, APPROVAL, REJECTION, REVOCATION,
  orgIdOf, LOCAL, typeId, cfg, asSafe, registerOrg, revokeOrg, reRegisterOrg, deployRegister,
  leaf, hashLeaf, tree, signClaim, createOrgType, addBatchOf, issued, withOrgB,
};
