const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  ORG_A, CITIZEN_TYPE, GUEST_TYPE, RESERVED_URIS,
  Kind, Policy, OrgRole, LeafKind, LeafStatus, DAY,
  cfg, asSafe, revokeOrg, reRegisterOrg, deployRegister,
  leaf, hashLeaf, tree, signClaim, createOrgType, addBatchOf, issued, withOrgB,
} = require("./credential-helpers");

const ZERO = ethers.ZeroAddress;

async function base() {
  const ctx = await deployRegister();
  const signers = await ethers.getSigners();
  ctx.carol = signers[13];
  ctx.mallory = signers[14];
  return ctx;
}

async function withIssued() {
  const ctx = await base();
  return { ...ctx, ...(await issued(ctx)) };
}

async function withCap1() {
  const ctx = await base();
  return { ...ctx, ...(await issued(ctx, { name: "cap1", config: cfg({ supplyCap: 1n }) })) };
}

/** Submit `claim` for leaf `l` of tree `t` from `signer`. */
function claimAs(ctx, signer, batchId, l, t, sig = "0x") {
  return ctx.registry.connect(signer).claim(batchId, l, t.proof(l), sig);
}

async function lastTs() {
  return BigInt(await time.latest());
}

describe("CredentialRegistry — batches, claiming, revocation, soulbound", function () {
  // -------------------------------------------------------------------------
  // Issuing
  // -------------------------------------------------------------------------

  it("authority and delegates add batches; ids start at 1", async function () {
    const ctx = await loadFixture(base);
    const { registry, safe, orgOwner, admin, delegate, stranger, member, alice } = ctx;
    const tId = await createOrgType(ctx);
    const t = tree([leaf(LeafKind.Account, tId, alice.address), leaf(LeafKind.Account, tId, stranger.address), leaf(LeafKind.Account, tId, member.address)]);
    const safeAddr = await safe.getAddress();

    expect(await registry.batchCount()).to.equal(0n);
    await expect(asSafe(safe, orgOwner, registry, "addBatch", [tId, t.root, 3]))
      .to.emit(registry, "BatchAdded").withArgs(1n, tId, safeAddr, t.root, 3n);
    const ts = await lastTs();
    expect(await registry.batchCount()).to.equal(1n);
    const b = await registry.getBatch(1);
    expect(b.typeId).to.equal(tId);
    expect(b.root).to.equal(t.root);
    expect(b.issuer).to.equal(safeAddr);
    expect(b.count).to.equal(3n);
    expect(b.createdAt).to.equal(ts);
    expect(b.revoked).to.equal(false);

    await asSafe(safe, orgOwner, registry, "setDelegate", [tId, delegate.address, true]);
    await expect(registry.connect(delegate).addBatch(tId, t.root, 3))
      .to.emit(registry, "BatchAdded").withArgs(2n, tId, delegate.address, t.root, 3n);
    await expect(registry.connect(admin).addBatch(tId, t.root, 3))
      .to.emit(registry, "BatchAdded").withArgs(3n, tId, admin.address, t.root, 3n);
    expect(await registry.batchCount()).to.equal(3n);

    await expect(registry.connect(stranger).addBatch(tId, t.root, 3))
      .to.be.revertedWithCustomError(registry, "NotAuthorised").withArgs(stranger.address);
    await expect(registry.connect(member).addBatch(tId, t.root, 3))
      .to.be.revertedWithCustomError(registry, "NotAuthorised");
    await expect(registry.addBatch(ethers.id("nope"), t.root, 3)).to.be.revertedWithCustomError(registry, "UnknownType");
    await expect(registry.getBatch(0)).to.be.revertedWithCustomError(registry, "UnknownBatch").withArgs(0n);
    await expect(registry.getBatch(4)).to.be.revertedWithCustomError(registry, "UnknownBatch").withArgs(4n);
  });

  it("a batch needs a root and a count", async function () {
    const ctx = await loadFixture(base);
    const { registry, admin } = ctx;
    const tId = await createOrgType(ctx);
    await expect(registry.connect(admin).addBatch(tId, ethers.ZeroHash, 3)).to.be.revertedWithCustomError(registry, "EmptyBatch");
    await expect(registry.connect(admin).addBatch(tId, ethers.id("root"), 0)).to.be.revertedWithCustomError(registry, "EmptyBatch");
  });

  it("no batches for SelfClaim, External, retired or dead-org types", async function () {
    const ctx = await loadFixture(base);
    const { registry, safe, orgOwner } = ctx;
    const root = ethers.id("root");
    await expect(registry.addBatch(GUEST_TYPE, root, 1)).to.be.revertedWithCustomError(registry, "WrongPolicy").withArgs(GUEST_TYPE);
    await expect(registry.addBatch(CITIZEN_TYPE, root, 1)).to.be.revertedWithCustomError(registry, "ExternalType").withArgs(CITIZEN_TYPE);

    const retired = await createOrgType(ctx, { name: "retired" });
    await asSafe(safe, orgOwner, registry, "retireType", [retired]);
    await expect(asSafe(safe, orgOwner, registry, "addBatch", [retired, root, 1]))
      .to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(retired);

    const dead = await createOrgType(ctx, { name: "dead" });
    await revokeOrg(ctx, ORG_A);
    await expect(asSafe(safe, orgOwner, registry, "addBatch", [dead, root, 1]))
      .to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(dead);
  });

  it("after a re-registration the old type stays closed to the new Safe and old delegates", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, safe2, orgOwner, delegate, typeId: tId, batchId, leaves } = ctx;
    await asSafe(safe, orgOwner, registry, "setDelegate", [tId, delegate.address, true]);
    await revokeOrg(ctx, ORG_A);
    await reRegisterOrg(ctx, ORG_A, safe2);
    const root = ethers.id("root");
    const h = hashLeaf(leaves.alice);

    expect(await registry.canIssue(tId, await safe2.getAddress())).to.equal(true);
    await expect(asSafe(safe2, orgOwner, registry, "addBatch", [tId, root, 1]))
      .to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(tId);
    await expect(registry.connect(delegate).addBatch(tId, root, 1))
      .to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(tId);
    await expect(asSafe(safe2, orgOwner, registry, "revokeBatch", [batchId]))
      .to.be.revertedWithCustomError(registry, "TypeInactive");
    await expect(registry.connect(delegate).revokeLeaves(batchId, [h]))
      .to.be.revertedWithCustomError(registry, "TypeInactive");
  });

  it("a batch outlives its issuer's role", async function () {
    const ctx = await loadFixture(base);
    const { registry, orgs, safe, orgOwner, admin, alice } = ctx;
    const tId = await createOrgType(ctx);
    const l = leaf(LeafKind.Account, tId, alice.address);
    const t = tree([l]);
    await registry.connect(admin).addBatch(tId, t.root, 1);
    await asSafe(safe, orgOwner, orgs, "setRole", [ORG_A, admin.address, OrgRole.None]);
    expect(await registry.canIssue(tId, admin.address)).to.equal(false);
    await claimAs(ctx, alice, 1n, l, t);
    expect(await registry.holds(tId, alice.address)).to.equal(true);
  });

  it("the constructor caps the reserved URIs", async function () {
    const { identity, orgs, owner } = await loadFixture(base);
    const F = await ethers.getContractFactory("CredentialRegistry");
    const long = "x".repeat(513);
    const args = (uris) => [owner.address, identity.target, identity.target, orgs.target, uris];
    await expect(F.deploy(...args([RESERVED_URIS[0], RESERVED_URIS[1], long]))).to.be.revertedWithCustomError(F, "UriTooLong");
    await expect(F.deploy(...args([long, RESERVED_URIS[1], RESERVED_URIS[2]]))).to.be.revertedWithCustomError(F, "UriTooLong");
    await F.deploy(...args(["x".repeat(512), RESERVED_URIS[1], RESERVED_URIS[2]]));
  });

  // -------------------------------------------------------------------------
  // Claiming
  // -------------------------------------------------------------------------

  it("an account leaf mints to its subject", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, typeId: tId, batchId, leaves, t } = ctx;
    const h = hashLeaf(leaves.alice);
    expect(await registry.leafHash(leaves.alice)).to.equal(h);
    const tx = claimAs(ctx, alice, batchId, leaves.alice, t);
    await expect(tx).to.emit(registry, "Claimed").withArgs(tId, alice.address, 1n, h, 0n);
    await expect(tx).to.emit(registry, "TransferSingle").withArgs(alice.address, ZERO, alice.address, BigInt(tId), 1n);
    const ts = await lastTs();
    expect(await registry.holds(tId, alice.address)).to.equal(true);
    expect(await registry.balanceOf(alice.address, BigInt(tId))).to.equal(1n);
    expect((await registry.getType(tId)).supply).to.equal(1n);
    const hold = await registry.holdingOf(tId, alice.address);
    expect([hold.batchId, hold.validUntil, hold.since, hold.leaf]).to.deep.equal([1n, 0n, ts, h]);
    expect(await registry.leafBoundTo(1, h)).to.equal(alice.address);
  });

  it("only the subject may claim an account leaf", async function () {
    const ctx = await loadFixture(withIssued);
    await expect(claimAs(ctx, ctx.bob, ctx.batchId, ctx.leaves.alice, ctx.t))
      .to.be.revertedWithCustomError(ctx.registry, "NotLeafSubject").withArgs(ctx.bob.address);
  });

  it("a claim-key leaf mints to whoever holds the key", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, carol, keyWallet, typeId: tId, batchId, leaves, t } = ctx;
    const h = hashLeaf(leaves.key);
    const sig = await signClaim(keyWallet, registry, batchId, h, carol.address);
    expect(await registry.claimDigest(batchId, h, carol.address)).to.equal(
      ethers.TypedDataEncoder.hash(
        { name: "CredentialRegistry", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: registry.target },
        { Claim: [{ name: "batchId", type: "uint64" }, { name: "leaf", type: "bytes32" }, { name: "account", type: "address" }] },
        { batchId, leaf: h, account: carol.address },
      ),
    );
    await expect(claimAs(ctx, carol, batchId, leaves.key, t, sig))
      .to.emit(registry, "Claimed").withArgs(tId, carol.address, batchId, h, 0n);
    expect(await registry.holds(tId, carol.address)).to.equal(true);
    expect(await registry.leafBoundTo(1, h)).to.equal(carol.address);
  });

  it("a claim-key signature cannot be redirected (front-running)", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, carol, mallory, keyWallet, batchId, leaves, t } = ctx;
    const h = hashLeaf(leaves.key);
    const sig = await signClaim(keyWallet, registry, batchId, h, carol.address);
    await expect(claimAs(ctx, mallory, batchId, leaves.key, t, sig)).to.be.revertedWithCustomError(registry, "BadClaimSignature");
    const otherBatch = await signClaim(keyWallet, registry, batchId + 1n, h, carol.address);
    await expect(claimAs(ctx, carol, batchId, leaves.key, t, otherBatch)).to.be.revertedWithCustomError(registry, "BadClaimSignature");
    const otherKey = await signClaim(ethers.Wallet.createRandom(), registry, batchId, h, carol.address);
    await expect(claimAs(ctx, carol, batchId, leaves.key, t, otherKey)).to.be.revertedWithCustomError(registry, "BadClaimSignature");
    await expect(claimAs(ctx, carol, batchId, leaves.key, t, "0x")).to.be.revertedWithCustomError(registry, "BadClaimSignature");
    await claimAs(ctx, carol, batchId, leaves.key, t, sig);
  });

  it("a claim-key leaf stays bound after renounce", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, carol, mallory, keyWallet, typeId: tId, batchId, leaves, t } = ctx;
    const h = hashLeaf(leaves.key);
    await claimAs(ctx, carol, batchId, leaves.key, t, await signClaim(keyWallet, registry, batchId, h, carol.address));
    await registry.connect(carol).renounce(tId);
    expect(await registry.leafBoundTo(batchId, h)).to.equal(carol.address);
    const fresh = await signClaim(keyWallet, registry, batchId, h, mallory.address);
    await expect(claimAs(ctx, mallory, batchId, leaves.key, t, fresh))
      .to.be.revertedWithCustomError(registry, "LeafBoundToOther").withArgs(h);
    await claimAs(ctx, carol, batchId, leaves.key, t, "0x");
    expect(await registry.holds(tId, carol.address)).to.equal(true);
  });

  it("replay of a leaf", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, stranger, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await expect(claimAs(ctx, alice, batchId, leaves.alice, t)).to.not.emit(registry, "TransferSingle");
    expect(await registry.balanceOf(alice.address, BigInt(tId))).to.equal(1n);
    expect((await registry.getType(tId)).supply).to.equal(1n);

    const other = await addBatchOf(ctx, tId, [leaf(LeafKind.Account, tId, stranger.address), leaf(LeafKind.Account, tId, alice.address)]);
    await expect(registry.connect(alice).claim(other.batchId, leaves.alice, t.proof(leaves.alice), "0x"))
      .to.be.revertedWithCustomError(registry, "InvalidProof");
    const b = await withOrgB(ctx);
    await expect(registry.connect(alice).claim(b.batchId, leaves.alice, t.proof(leaves.alice), "0x"))
      .to.be.revertedWithCustomError(registry, "LeafTypeMismatch");
  });

  it("wrong proof", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, batchId, leaves, t } = ctx;
    await expect(registry.connect(alice).claim(batchId, leaves.alice, t.proof(leaves.bob), "0x"))
      .to.be.revertedWithCustomError(registry, "InvalidProof");
    await expect(registry.connect(alice).claim(batchId, leaves.alice, [], "0x"))
      .to.be.revertedWithCustomError(registry, "InvalidProof");
    await expect(registry.connect(alice).claim(99, leaves.alice, t.proof(leaves.alice), "0x"))
      .to.be.revertedWithCustomError(registry, "UnknownBatch").withArgs(99n);
    await expect(registry.connect(alice).claim(0, leaves.alice, t.proof(leaves.alice), "0x"))
      .to.be.revertedWithCustomError(registry, "UnknownBatch").withArgs(0n);
  });

  it("renewal replaces the holding", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, bob, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, bob, batchId, leaves.bob, t);
    const later = leaves.bob.validUntil + BigInt(60 * DAY);
    const renewed = leaf(LeafKind.Account, tId, bob.address, later);
    const b2 = await addBatchOf(ctx, tId, [renewed]);
    expect(b2.batchId).to.equal(2n);
    await expect(claimAs(ctx, bob, b2.batchId, renewed, b2.t)).to.not.emit(registry, "TransferSingle");
    const hold = await registry.holdingOf(tId, bob.address);
    expect(hold.batchId).to.equal(2n);
    expect(hold.validUntil).to.equal(later);
    expect(hold.leaf).to.equal(hashLeaf(renewed));
    expect(await registry.balanceOf(bob.address, BigInt(tId))).to.equal(1n);
    expect((await registry.getType(tId)).supply).to.equal(1n);
  });

  it("an expired leaf cannot be claimed", async function () {
    let ctx = await loadFixture(withIssued);
    const v = ctx.leaves.bob.validUntil;
    await time.increaseTo(v + 1n);
    await expect(claimAs(ctx, ctx.bob, ctx.batchId, ctx.leaves.bob, ctx.t))
      .to.be.revertedWithCustomError(ctx.registry, "LeafExpired").withArgs(hashLeaf(ctx.leaves.bob));

    ctx = await loadFixture(withIssued);
    await time.setNextBlockTimestamp(v);
    await claimAs(ctx, ctx.bob, ctx.batchId, ctx.leaves.bob, ctx.t);
    expect((await ctx.registry.holdingOf(ctx.typeId, ctx.bob.address)).validUntil).to.equal(v);
  });

  it("private-only types and orgs", async function () {
    const ctx = await loadFixture(base);
    const { registry, safe, orgOwner, alice } = ctx;
    const priv = await issued(ctx, { name: "priv", config: cfg({ publicClaim: false }) });
    await expect(claimAs(ctx, alice, priv.batchId, priv.leaves.alice, priv.t))
      .to.be.revertedWithCustomError(registry, "PublicClaimDisabled").withArgs(priv.typeId);
    const [status, boundTo] = await registry.checkLeaf(priv.batchId, priv.leaves.alice, priv.t.proof(priv.leaves.alice));
    expect(status).to.equal(LeafStatus.Valid);
    expect(boundTo).to.equal(ZERO);

    const member = await issued(ctx, { name: "m" });
    const role = await issued(ctx, { name: "r", kind: Kind.Role });
    const badge = await issued(ctx, { name: "b", kind: Kind.Badge });
    await asSafe(safe, orgOwner, registry, "setOrgPrivateOnly", [ORG_A, true]);
    await expect(claimAs(ctx, alice, member.batchId, member.leaves.alice, member.t))
      .to.be.revertedWithCustomError(registry, "PublicClaimDisabled").withArgs(member.typeId);
    await claimAs(ctx, alice, role.batchId, role.leaves.alice, role.t);
    await claimAs(ctx, alice, badge.batchId, badge.leaves.alice, badge.t);
    expect(await registry.holds(role.typeId, alice.address)).to.equal(true);
    expect(await registry.holds(badge.typeId, alice.address)).to.equal(true);

    await asSafe(safe, orgOwner, registry, "setOrgPrivateOnly", [ORG_A, false]);
    await claimAs(ctx, alice, member.batchId, member.leaves.alice, member.t);
    expect(await registry.holds(member.typeId, alice.address)).to.equal(true);
  });

  it("closing an org keeps existing public members", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner, alice, bob, stranger, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await asSafe(safe, orgOwner, registry, "setOrgPrivateOnly", [ORG_A, true]);
    expect(await registry.holds(tId, alice.address)).to.equal(true);
    await expect(registry.connect(stranger).prune(tId, alice.address)).to.be.revertedWithCustomError(registry, "StillValid");
    await expect(claimAs(ctx, bob, batchId, leaves.bob, t)).to.be.revertedWithCustomError(registry, "PublicClaimDisabled").withArgs(tId);
    await registry.connect(alice).renounce(tId);
    await expect(claimAs(ctx, alice, batchId, leaves.alice, t)).to.be.revertedWithCustomError(registry, "PublicClaimDisabled").withArgs(tId);
    expect((await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice)))[0]).to.equal(LeafStatus.Valid);
  });

  it("switching public -> private -> public", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await registry.connect(alice).renounce(tId);
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    expect(await registry.balanceOf(alice.address, BigInt(tId))).to.equal(1n);
    expect((await registry.getType(tId)).supply).to.equal(1n);
    expect((await registry.queryFilter(registry.filters.Renounced(), 0)).length).to.equal(1);
    const transfers = await registry.queryFilter(registry.filters.TransferSingle(), 0);
    expect(transfers.filter((e) => e.args.from === ZERO).length).to.equal(2);
    expect(transfers.filter((e) => e.args.to === ZERO).length).to.equal(1);
  });

  it("claim window", async function () {
    const ctx = await loadFixture(base);
    const { registry, alice, bob } = ctx;
    const now = await lastTs();
    const start = now + 1000n;
    const end = now + 2000n;
    const w = await issued(ctx, { name: "win", config: cfg({ claimStart: start, claimEnd: end }) });
    await expect(claimAs(ctx, alice, w.batchId, w.leaves.alice, w.t))
      .to.be.revertedWithCustomError(registry, "ClaimWindowClosed").withArgs(w.typeId);
    await time.setNextBlockTimestamp(start);
    await claimAs(ctx, alice, w.batchId, w.leaves.alice, w.t);
    await time.increaseTo(end + 1n);
    await expect(claimAs(ctx, bob, w.batchId, w.leaves.bob, w.t))
      .to.be.revertedWithCustomError(registry, "ClaimWindowClosed").withArgs(w.typeId);
  });

  it("supply cap", async function () {
    const ctx = await loadFixture(withCap1);
    const { registry, alice, bob, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await expect(claimAs(ctx, bob, batchId, leaves.bob, t))
      .to.be.revertedWithCustomError(registry, "SupplyCapReached").withArgs(tId);
    await registry.connect(alice).renounce(tId);
    await claimAs(ctx, bob, batchId, leaves.bob, t);
    expect((await registry.getType(tId)).supply).to.equal(1n);
  });

  it("mint calls no receiver hook", async function () {
    const ctx = await loadFixture(base);
    const { registry, alice } = ctx;
    const plain = await (await ethers.getContractFactory("CredMockPlainAccount")).deploy();
    const tId = await createOrgType(ctx);
    const l = leaf(LeafKind.Account, tId, plain.target);
    const { batchId, t } = await addBatchOf(ctx, tId, [l]);
    const data = registry.interface.encodeFunctionData("claim", [batchId, l, t.proof(l), "0x"]);
    await plain.connect(alice).exec(registry.target, data);
    expect(await registry.holds(tId, plain.target)).to.equal(true);
    expect(await registry.balanceOf(plain.target, BigInt(tId))).to.equal(1n);
  });

  // -------------------------------------------------------------------------
  // Self-claim
  // -------------------------------------------------------------------------

  it("anyone self-claims Guest once", async function () {
    const { registry, alice } = await loadFixture(base);
    const tx = registry.connect(alice).selfClaim(GUEST_TYPE);
    await expect(tx).to.emit(registry, "SelfClaimed").withArgs(GUEST_TYPE, alice.address, 0n);
    await expect(tx).to.emit(registry, "TransferSingle").withArgs(alice.address, ZERO, alice.address, BigInt(GUEST_TYPE), 1n);
    const ts = await lastTs();
    await expect(registry.connect(alice).selfClaim(GUEST_TYPE))
      .to.be.revertedWithCustomError(registry, "AlreadyHeld").withArgs(GUEST_TYPE, alice.address);
    const hold = await registry.holdingOf(GUEST_TYPE, alice.address);
    expect(hold.batchId).to.equal(0n);
    expect(hold.since).to.equal(ts);
    expect(hold.leaf).to.equal(ethers.ZeroHash);
    expect(await registry.holds(GUEST_TYPE, alice.address)).to.equal(true);
    expect((await registry.getType(GUEST_TYPE)).supply).to.equal(1n);
  });

  it("self-claim honours validity, window and cap", async function () {
    const ctx = await loadFixture(base);
    const { registry, alice, bob } = ctx;
    const day = await createOrgType(ctx, { name: "day", policy: Policy.SelfClaim, config: cfg({ defaultValidity: BigInt(DAY) }) });
    await registry.connect(alice).selfClaim(day);
    const ts = await lastTs();
    const until = (await registry.holdingOf(day, alice.address)).validUntil;
    expect(until).to.equal(ts + BigInt(DAY));
    await time.increaseTo(until + 1n);
    expect(await registry.holds(day, alice.address)).to.equal(false);
    const tx = registry.connect(alice).selfClaim(day);
    await expect(tx).to.not.emit(registry, "TransferSingle");
    await expect(tx).to.emit(registry, "SelfClaimed");
    expect(await registry.holds(day, alice.address)).to.equal(true);
    expect((await registry.getType(day)).supply).to.equal(1n);

    const now = await lastTs();
    const win = await createOrgType(ctx, { name: "win", policy: Policy.SelfClaim, config: cfg({ claimStart: now + 1000n }) });
    await expect(registry.connect(alice).selfClaim(win)).to.be.revertedWithCustomError(registry, "ClaimWindowClosed").withArgs(win);
    const cap = await createOrgType(ctx, { name: "cap", policy: Policy.SelfClaim, config: cfg({ supplyCap: 1n }) });
    await registry.connect(alice).selfClaim(cap);
    await expect(registry.connect(bob).selfClaim(cap)).to.be.revertedWithCustomError(registry, "SupplyCapReached").withArgs(cap);
  });

  it("self-claim is refused for batch and external types", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, typeId: tId } = ctx;
    await expect(registry.connect(alice).selfClaim(tId)).to.be.revertedWithCustomError(registry, "WrongPolicy").withArgs(tId);
    await expect(registry.connect(alice).selfClaim(CITIZEN_TYPE)).to.be.revertedWithCustomError(registry, "ExternalType").withArgs(CITIZEN_TYPE);
  });

  // -------------------------------------------------------------------------
  // Revocation, expiry, pruning
  // -------------------------------------------------------------------------

  it("revoking a claimed leaf burns it", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner, alice, typeId: tId, batchId, leaves, t } = ctx;
    const h = hashLeaf(leaves.alice);
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const tx = asSafe(safe, orgOwner, registry, "revokeLeaves", [batchId, [h]]);
    await expect(tx).to.emit(registry, "LeafRevoked").withArgs(batchId, h);
    await expect(tx).to.emit(registry, "TransferSingle").withArgs(await safe.getAddress(), alice.address, ZERO, BigInt(tId), 1n);
    expect(await registry.holds(tId, alice.address)).to.equal(false);
    expect((await registry.getType(tId)).supply).to.equal(0n);
    expect(await registry.leafRevoked(batchId, h)).to.equal(true);
    await expect(claimAs(ctx, alice, batchId, leaves.alice, t)).to.be.revertedWithCustomError(registry, "LeafIsRevoked").withArgs(h);
    expect((await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice)))[0]).to.equal(LeafStatus.Revoked);
  });

  it("revoking an unclaimed leaf reveals no account", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, admin, alice, batchId, leaves, t } = ctx;
    const h = hashLeaf(leaves.alice);
    const tx = registry.connect(admin).revokeLeaves(batchId, [h]);
    await expect(tx).to.emit(registry, "LeafRevoked").withArgs(batchId, h);
    await expect(tx).to.not.emit(registry, "TransferSingle");
    const [status, boundTo] = await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice));
    expect(status).to.equal(LeafStatus.Revoked);
    expect(boundTo).to.equal(ZERO);
    await expect(claimAs(ctx, alice, batchId, leaves.alice, t)).to.be.revertedWithCustomError(registry, "LeafIsRevoked");
  });

  it("revocation is scoped to the batch and its authority", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe2, orgOwner, alice, typeId: tId, batchId, leaves, t } = ctx;
    const h = hashLeaf(leaves.alice);
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const b = await withOrgB(ctx);
    await expect(asSafe(safe2, orgOwner, registry, "revokeLeaves", [batchId, [h]]))
      .to.be.revertedWithCustomError(registry, "NotAuthorised").withArgs(await safe2.getAddress());
    await expect(asSafe(safe2, orgOwner, registry, "revokeLeaves", [b.batchId, [h]]))
      .to.emit(registry, "LeafRevoked").withArgs(b.batchId, h);
    expect(await registry.holds(tId, alice.address)).to.equal(true);
    expect(await registry.leafRevoked(batchId, h)).to.equal(false);
  });

  it("revoking a batch stops every holding in it without transactions per holder", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner, alice, bob, carol, stranger, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const cl = leaf(LeafKind.Account, tId, carol.address);
    const b2 = await addBatchOf(ctx, tId, [cl]);
    await claimAs(ctx, carol, b2.batchId, cl, b2.t);

    const tx = asSafe(safe, orgOwner, registry, "revokeBatch", [batchId]);
    await expect(tx).to.emit(registry, "BatchRevoked").withArgs(batchId);
    await expect(tx).to.not.emit(registry, "TransferSingle");
    expect((await registry.getBatch(batchId)).revoked).to.equal(true);
    expect(await registry.holds(tId, alice.address)).to.equal(false);
    expect(await registry.balanceOf(alice.address, BigInt(tId))).to.equal(0n);
    await expect(claimAs(ctx, bob, batchId, leaves.bob, t)).to.be.revertedWithCustomError(registry, "BatchIsRevoked").withArgs(batchId);
    expect(await registry.holds(tId, carol.address)).to.equal(true);
    await expect(asSafe(safe, orgOwner, registry, "revokeBatch", [batchId])).to.be.revertedWithCustomError(registry, "BatchIsRevoked");
    await expect(registry.connect(stranger).revokeBatch(b2.batchId)).to.be.revertedWithCustomError(registry, "NotAuthorised");
    await expect(registry.revokeBatch(99)).to.be.revertedWithCustomError(registry, "UnknownBatch");
    await expect(registry.revokeLeaves(99, [])).to.be.revertedWithCustomError(registry, "UnknownBatch");
  });

  it("expiry needs no transaction", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, bob, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, bob, batchId, leaves.bob, t);
    const v = leaves.bob.validUntil;
    await time.increaseTo(v);
    expect(await registry.holds(tId, bob.address)).to.equal(true);
    await time.increaseTo(v + 1n);
    expect(await registry.holds(tId, bob.address)).to.equal(false);
    expect(await registry.balanceOf(bob.address, BigInt(tId))).to.equal(0n);
    expect((await registry.checkLeaf(batchId, leaves.bob, t.proof(leaves.bob)))[0]).to.equal(LeafStatus.Expired);
  });

  it("generation change", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe2, alice, bob, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const check = async () => {
      expect(await registry.holds(tId, alice.address)).to.equal(false);
      await expect(claimAs(ctx, bob, batchId, leaves.bob, t)).to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(tId);
      expect((await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice)))[0]).to.equal(LeafStatus.Inactive);
    };
    await revokeOrg(ctx, ORG_A);
    await check();
    await reRegisterOrg(ctx, ORG_A, safe2);
    await check();
  });

  it("retiring a type stops its holdings", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner, alice, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await asSafe(safe, orgOwner, registry, "retireType", [tId]);
    expect(await registry.holds(tId, alice.address)).to.equal(false);
    expect((await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice)))[0]).to.equal(LeafStatus.Inactive);
  });

  it("renounce", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, bob, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const tx = registry.connect(alice).renounce(tId);
    await expect(tx).to.emit(registry, "Renounced").withArgs(tId, alice.address);
    await expect(tx).to.emit(registry, "TransferSingle").withArgs(alice.address, alice.address, ZERO, BigInt(tId), 1n);
    expect(await registry.holds(tId, alice.address)).to.equal(false);
    expect((await registry.getType(tId)).supply).to.equal(0n);
    await expect(registry.connect(alice).renounce(tId)).to.be.revertedWithCustomError(registry, "NotHeld").withArgs(tId, alice.address);
    const [status, boundTo] = await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice));
    expect(status).to.equal(LeafStatus.Valid);
    expect(boundTo).to.equal(alice.address);

    await claimAs(ctx, bob, batchId, leaves.bob, t);
    await time.increaseTo(leaves.bob.validUntil + 1n);
    await expect(registry.connect(bob).renounce(tId)).to.emit(registry, "Renounced").withArgs(tId, bob.address);
    await expect(registry.connect(alice).renounce(CITIZEN_TYPE)).to.be.revertedWithCustomError(registry, "ExternalType");
  });

  it("prune", async function () {
    // expired holding frees a capped slot
    let ctx = await loadFixture(withCap1);
    await claimAs(ctx, ctx.bob, ctx.batchId, ctx.leaves.bob, ctx.t);
    const keySig = await signClaim(ctx.keyWallet, ctx.registry, ctx.batchId, hashLeaf(ctx.leaves.key), ctx.carol.address);
    await expect(claimAs(ctx, ctx.carol, ctx.batchId, ctx.leaves.key, ctx.t, keySig))
      .to.be.revertedWithCustomError(ctx.registry, "SupplyCapReached");
    await expect(ctx.registry.connect(ctx.stranger).prune(ctx.typeId, ctx.bob.address))
      .to.be.revertedWithCustomError(ctx.registry, "StillValid").withArgs(ctx.typeId, ctx.bob.address);
    await time.increaseTo(ctx.leaves.bob.validUntil + 1n);
    const tx = ctx.registry.connect(ctx.stranger).prune(ctx.typeId, ctx.bob.address);
    await expect(tx).to.emit(ctx.registry, "Pruned").withArgs(ctx.typeId, ctx.bob.address);
    await expect(tx).to.emit(ctx.registry, "TransferSingle").withArgs(ctx.stranger.address, ctx.bob.address, ZERO, BigInt(ctx.typeId), 1n);
    await claimAs(ctx, ctx.carol, ctx.batchId, ctx.leaves.key, ctx.t, keySig);
    await expect(ctx.registry.prune(ctx.typeId, ctx.bob.address)).to.be.revertedWithCustomError(ctx.registry, "NotHeld");

    // batch-revoked holding
    ctx = await loadFixture(withIssued);
    await claimAs(ctx, ctx.alice, ctx.batchId, ctx.leaves.alice, ctx.t);
    await ctx.registry.connect(ctx.admin).revokeBatch(ctx.batchId);
    await expect(ctx.registry.prune(ctx.typeId, ctx.alice.address)).to.emit(ctx.registry, "Pruned");
    expect((await ctx.registry.getType(ctx.typeId)).supply).to.equal(0n);

    // dead-org holding
    ctx = await loadFixture(withIssued);
    await claimAs(ctx, ctx.alice, ctx.batchId, ctx.leaves.alice, ctx.t);
    await revokeOrg(ctx, ORG_A);
    await expect(ctx.registry.prune(ctx.typeId, ctx.alice.address)).to.emit(ctx.registry, "Pruned");
    await expect(ctx.registry.prune(CITIZEN_TYPE, ctx.alice.address)).to.be.revertedWithCustomError(ctx.registry, "ExternalType");
  });

  it("checkLeaf statuses", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, carol, keyWallet, batchId, leaves, t } = ctx;
    const invalid = [LeafStatus.Invalid, ZERO];
    expect(await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.bob))).to.deep.equal(invalid);
    expect(await registry.checkLeaf(99, leaves.alice, t.proof(leaves.alice))).to.deep.equal(invalid);
    expect(await registry.checkLeaf(0, leaves.alice, t.proof(leaves.alice))).to.deep.equal(invalid);
    const b = await withOrgB(ctx);
    expect(await registry.checkLeaf(b.batchId, leaves.alice, t.proof(leaves.alice))).to.deep.equal(invalid);
    expect(await registry.checkLeaf(batchId, b.leaves.alice, [])).to.deep.equal(invalid);
    expect(await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice))).to.deep.equal([LeafStatus.Valid, ZERO]);

    const h = hashLeaf(leaves.key);
    await claimAs(ctx, carol, batchId, leaves.key, t, await signClaim(keyWallet, registry, batchId, h, carol.address));
    expect(await registry.checkLeaf(batchId, leaves.key, t.proof(leaves.key))).to.deep.equal([LeafStatus.Valid, carol.address]);
  });

  // -------------------------------------------------------------------------
  // Soulbound
  // -------------------------------------------------------------------------

  it("no transfers and no approvals", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, bob, typeId: tId, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const id = BigInt(tId);
    await expect(registry.connect(alice).safeTransferFrom(alice.address, bob.address, id, 1, "0x"))
      .to.be.revertedWithCustomError(registry, "Soulbound");
    await expect(registry.connect(alice).safeBatchTransferFrom(alice.address, bob.address, [id], [1], "0x"))
      .to.be.revertedWithCustomError(registry, "Soulbound");
    await expect(registry.connect(alice).setApprovalForAll(bob.address, true))
      .to.be.revertedWithCustomError(registry, "Soulbound");
  });

  it("balance is 0 or 1", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, alice, bob, stranger, carol, keyWallet, typeId: tId, batchId, leaves, t } = ctx;
    const id = BigInt(tId);
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await claimAs(ctx, bob, batchId, leaves.bob, t);
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const renewed = leaf(LeafKind.Account, tId, bob.address, leaves.bob.validUntil + 1000n);
    const b2 = await addBatchOf(ctx, tId, [renewed]);
    await claimAs(ctx, bob, b2.batchId, renewed, b2.t);
    await claimAs(ctx, carol, batchId, leaves.key, t, await signClaim(keyWallet, registry, batchId, hashLeaf(leaves.key), carol.address));
    await claimAs(ctx, carol, batchId, leaves.key, t);
    await registry.connect(alice).selfClaim(GUEST_TYPE);
    expect(await registry.balanceOfBatch([alice.address, bob.address, stranger.address], [id, id, id])).to.deep.equal([1n, 1n, 0n]);

    const events = await registry.queryFilter(registry.filters.TransferSingle(), 0);
    expect(events.length).to.equal(4);
    for (const e of events) expect(e.args.value).to.equal(1n);
  });

  it("gas", async function () {
    const ctx = await loadFixture(base);
    const { registry, admin, alice, carol } = ctx;
    const tId = await createOrgType(ctx);
    const key = ethers.Wallet.createRandom();
    const leaves = [];
    for (let i = 0; i < 68; i++) leaves.push(leaf(LeafKind.Account, tId, ethers.Wallet.createRandom().address));
    const mine = leaf(LeafKind.Account, tId, alice.address);
    const keyLeaf = leaf(LeafKind.ClaimKey, tId, key.address);
    leaves.push(mine, keyLeaf);
    const t = tree(leaves);
    expect(t.proof(mine).length).to.equal(7);

    const addTx = await registry.connect(admin).addBatch(tId, t.root, leaves.length);
    const addGas = (await addTx.wait()).gasUsed;
    const claimTx = await registry.connect(alice).claim(1, mine, t.proof(mine), "0x");
    const claimGas = (await claimTx.wait()).gasUsed;
    const sig = await signClaim(key, registry, 1n, hashLeaf(keyLeaf), carol.address);
    const keyTx = await registry.connect(carol).claim(1, keyLeaf, t.proof(keyLeaf), sig);
    const keyGas = (await keyTx.wait()).gasUsed;
    console.log(`      gas: addBatch ${addGas}, claim (account, ${t.proof(mine).length}-hash proof) ${claimGas}, claim (claim key, ${t.proof(keyLeaf).length}-hash proof) ${keyGas}`);
    expect(claimGas).to.be.lessThan(250000n);
    expect(keyGas).to.be.lessThan(250000n);
    expect(addGas).to.be.lessThan(150000n);
  });
});
