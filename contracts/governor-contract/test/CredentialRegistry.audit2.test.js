// Audit pass 2: proof-of-concept tests (see audit-pass2.md). Each test asserts the
// secure behaviour and fails on the audited commit 2169d837.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  ORG_A, APPROVAL, REJECTION, REVOCATION, DAY, LeafKind, OrgRole, Kind, GUEST_TYPE,
  cfg, asSafe, revokeOrg, deployRegister, leaf, tree, issued,
} = require("./credential-helpers");

async function swappedBase(importOrgA) {
  const ctx = await deployRegister();
  Object.assign(ctx, await issued(ctx));
  await ctx.registry.connect(ctx.alice).claim(ctx.batchId, ctx.leaves.alice, ctx.t.proof(ctx.leaves.alice), "0x");
  const orgs2 = await (await ethers.getContractFactory("OrgRegistry")).deploy(
    ctx.owner.address, await ctx.identity.getAddress(), APPROVAL, REJECTION, REVOCATION,
  );
  if (importOrgA) {
    await orgs2.connect(ctx.owner).migrationRegister([ORG_A], [await ctx.safe.getAddress()], [""], [ethers.ZeroHash]);
  }
  const id = await ctx.identity.getAddress();
  await ctx.registry.connect(ctx.owner).proposeSources(id, id, await orgs2.getAddress());
  await time.increase(2 * DAY);
  await ctx.registry.connect(ctx.owner).applySources();
  ctx.orgs2 = orgs2;
  // A Safe controlled by an unrelated party.
  ctx.strangerSafe = await (await ethers.getContractFactory("OrgMockSafe")).deploy([ctx.stranger.address]);
  return ctx;
}
const swappedImported = () => swappedBase(true);
const swappedEmpty = () => swappedBase(false);

/** Registers ORG_A in the NEW registry to the stranger's Safe via the normal request/approve flow. */
async function strangerRegistersOrgA(ctx) {
  await asSafe(ctx.strangerSafe, ctx.stranger, ctx.orgs2, "requestRegistration", [ORG_A, ""]);
  const [, requestId] = await ctx.orgs2.openRegistrationOf(await ctx.strangerSafe.getAddress());
  await ctx.orgs2.connect(ctx.a1).approveRequest(requestId);
  await ctx.orgs2.connect(ctx.a2).approveRequest(requestId);
}

describe("CredentialRegistry — audit pass 2 PoCs", function () {
  it("P2-01: an org revoked in the NEW registry before rebind must not get its old types back after re-registration", async function () {
    const ctx = await loadFixture(swappedImported);
    const { registry, stranger, alice } = ctx;
    // The migrated org is revoked for abuse in the new registry (gen 0 -> 1) before a keeper rebinds.
    await revokeOrg({ ...ctx, orgs: ctx.orgs2 }, ORG_A);
    // The id is registered again in the new registry, here by an unrelated Safe.
    await strangerRegistersOrgA(ctx);
    // Secure: the old generation's types stay dead; nobody can rebind them to the new generation.
    await expect(registry.connect(stranger).rebindType(ctx.typeId))
      .to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(ctx.typeId);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(false);
  });

  it("P2-01: an id the new registry never imported, registered there by someone else, must not inherit the old org's types", async function () {
    const ctx = await loadFixture(swappedEmpty);
    const { registry, stranger, strangerSafe, alice } = ctx;
    await strangerRegistersOrgA(ctx);
    // Secure: rebinding requires the same org (e.g. the same Safe) in both registries.
    await expect(registry.connect(stranger).rebindType(ctx.typeId))
      .to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(ctx.typeId);
    // ...so the stranger gets no authority over the old org's type or its holders.
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(false);
    const t = tree([leaf(LeafKind.Account, ctx.typeId, stranger.address)]);
    await expect(asSafe(strangerSafe, stranger, registry, "addBatch", [ctx.typeId, t.root, 1])).to.be.reverted;
  });
});

describe("CredentialRegistry — audit pass 2: fixes", function () {
  async function repoint(ctx, orgRegistryAddr) {
    const id = await ctx.identity.getAddress();
    await ctx.registry.connect(ctx.owner).proposeSources(id, id, orgRegistryAddr);
    await time.increase(2 * DAY);
    await ctx.registry.connect(ctx.owner).applySources();
  }

  it("P2-01: the same Safe in both registries rebinds; the org keeps its holders", async function () {
    const ctx = await loadFixture(swappedImported);
    const { registry, stranger, alice } = ctx;
    await expect(registry.connect(stranger).rebindType(ctx.typeId))
      .to.emit(registry, "TypeRebound").withArgs(ctx.typeId, await ctx.orgs2.getAddress(), 0n);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(true);
  });

  it("P2-01: an org that rotates its Safe in the new registry before the rebind keeps the type inactive", async function () {
    const ctx = await loadFixture(swappedImported);
    const { registry, orgs2, safe, orgOwner, strangerSafe, stranger, alice } = ctx;
    await asSafe(safe, orgOwner, orgs2, "proposeRotation", [ORG_A, await strangerSafe.getAddress()]);
    await asSafe(strangerSafe, stranger, orgs2, "acceptRotation", [ORG_A]);
    expect((await orgs2.getOrg(ORG_A)).safe).to.equal(await strangerSafe.getAddress());
    await expect(registry.rebindType(ctx.typeId))
      .to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(ctx.typeId);
    expect(await registry.isTypeActive(ctx.typeId)).to.equal(false);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(false);
  });

  it("P2-01: a Safe rotated in the OLD registry after the swap differs from the imported one and blocks the rebind", async function () {
    const ctx = await loadFixture(swappedImported);
    const { registry, orgs, safe, orgOwner, strangerSafe, stranger } = ctx;
    await asSafe(safe, orgOwner, orgs, "proposeRotation", [ORG_A, await strangerSafe.getAddress()]);
    await asSafe(strangerSafe, stranger, orgs, "acceptRotation", [ORG_A]);
    await expect(registry.rebindType(ctx.typeId))
      .to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(ctx.typeId);
  });

  it("P2-02: rebindType clears the recognition seal; the owner may re-seal", async function () {
    const ctx = await loadFixture(deployRegister);
    Object.assign(ctx, await issued(ctx));
    const { registry, owner } = ctx;
    await registry.connect(owner).setRecognised(ctx.typeId, true);
    const orgs2 = await (await ethers.getContractFactory("OrgRegistry")).deploy(
      owner.address, await ctx.identity.getAddress(), APPROVAL, REJECTION, REVOCATION,
    );
    await orgs2.connect(owner).migrationRegister([ORG_A], [await ctx.safe.getAddress()], [""], [ethers.ZeroHash]);
    await repoint(ctx, await orgs2.getAddress());
    await expect(registry.rebindType(ctx.typeId))
      .to.emit(registry, "TypeRebound")
      .and.to.emit(registry, "TypeRecognised").withArgs(ctx.typeId, false);
    expect((await registry.getType(ctx.typeId)).recognised).to.equal(false);
    await registry.connect(owner).setRecognised(ctx.typeId, true);
    expect((await registry.getType(ctx.typeId)).recognised).to.equal(true);
  });

  it("P2-02: rebinding an unrecognised type emits no TypeRecognised", async function () {
    const ctx = await loadFixture(swappedImported);
    await expect(ctx.registry.rebindType(ctx.typeId)).to.not.emit(ctx.registry, "TypeRecognised");
  });

  it("P2-06: canManage / canIssue answer false instead of reverting on a broken registry", async function () {
    const ctx = await loadFixture(deployRegister);
    Object.assign(ctx, await issued(ctx));
    const { registry, owner, admin, safe } = ctx;
    // Roles revert, org record readable: the Safe still manages, everyone else reads false.
    const fake = await (await ethers.getContractFactory("CredMockOrgRegistry")).deploy();
    await fake.setOrg(ORG_A, await safe.getAddress(), 0n, true);
    await fake.setRole(ORG_A, admin.address, OrgRole.Admin);
    await fake.setRolesRevert(true);
    await repoint(ctx, await fake.getAddress());
    expect(await registry.canManage(ORG_A, await safe.getAddress())).to.equal(true);
    expect(await registry.canManage(ORG_A, admin.address)).to.equal(false);
    expect(await registry.canIssue(ctx.typeId, admin.address)).to.equal(false);
    await fake.setRolesRevert(false);
    expect(await registry.canManage(ORG_A, admin.address)).to.equal(true);

    // A registry that reverts on every call.
    const bad = ethers.Wallet.createRandom().address;
    await network.provider.send("hardhat_setCode", [bad, "0x60006000fd"]);
    await repoint(ctx, bad);
    expect(await registry.canManage(ORG_A, await safe.getAddress())).to.equal(false);
    expect(await registry.canIssue(ctx.typeId, admin.address)).to.equal(false);
    // State-changing paths revert NotAuthorised.
    await expect(registry.connect(admin).setOrgPrivateOnly(ORG_A, true))
      .to.be.revertedWithCustomError(registry, "NotAuthorised");
    await expect(registry.connect(admin).createType(ORG_A, ethers.id("x"), Kind.Role, 0n, cfg()))
      .to.be.revertedWithCustomError(registry, "NotAuthorised");
    void owner;
  });

  it("P2-08: setRecognised(true) requires an active type; setRecognised(false) always works", async function () {
    const ctx = await loadFixture(swappedImported);
    const { registry, owner } = ctx;
    // Awaiting rebind: inactive.
    await expect(registry.connect(owner).setRecognised(ctx.typeId, true))
      .to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(ctx.typeId);
    await expect(registry.connect(owner).setRecognised(ctx.typeId, false))
      .to.emit(registry, "TypeRecognised").withArgs(ctx.typeId, false);
    await registry.rebindType(ctx.typeId);
    await registry.connect(owner).setRecognised(ctx.typeId, true);
    // Retired: inactive for good.
    await asSafe(ctx.safe, ctx.orgOwner, registry, "retireType", [ctx.typeId]);
    await expect(registry.connect(owner).setRecognised(ctx.typeId, true))
      .to.be.revertedWithCustomError(registry, "TypeInactive");
    await expect(registry.connect(owner).setRecognised(ctx.typeId, false))
      .to.emit(registry, "TypeRecognised").withArgs(ctx.typeId, false);
    // COMMUNITY types are active.
    await registry.connect(owner).setRecognised(GUEST_TYPE, true);
  });
});
