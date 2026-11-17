// Audit pass 1 — proof-of-concept tests (see audit-pass1.md). FIXED findings
// assert the secure behaviour; ACCEPTED findings (`<ID> (accepted): …`) document
// the by-design behaviour the owner chose.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  ORG_A, CITIZEN_TYPE, ATTESTER_TYPE, GUEST_TYPE, RESERVED_URIS, APPROVAL, REJECTION, REVOCATION,
  Kind, Policy, OrgRole, LeafKind, LeafStatus, DAY,
  cfg, asSafe, revokeOrg, reRegisterOrg, deployRegister,
  leaf, tree, addBatchOf, issued, createOrgType,
} = require("./credential-helpers");

async function base() {
  return deployRegister();
}

async function withIssued() {
  const ctx = await base();
  return { ...ctx, ...(await issued(ctx)) };
}

function claimAs(ctx, signer, batchId, l, t, sig = "0x") {
  return ctx.registry.connect(signer).claim(batchId, l, t.proof(l), sig);
}

/** A fresh OrgRegistry (as a v2 migration would deploy) whose owner imports `orgId` → `safeAddr`. */
async function freshOrgRegistry(ctx, orgId, safeAddr) {
  const orgs2 = await (await ethers.getContractFactory("OrgRegistry")).deploy(
    ctx.owner.address, await ctx.identity.getAddress(), APPROVAL, REJECTION, REVOCATION,
  );
  await orgs2.connect(ctx.owner).migrationRegister([orgId], [safeAddr], [""], [ethers.ZeroHash]);
  return orgs2;
}

async function repointOrgRegistry(ctx, orgRegistryAddr) {
  const id = await ctx.identity.getAddress();
  await ctx.registry.connect(ctx.owner).proposeSources(id, id, orgRegistryAddr);
  await time.increase(2 * DAY);
  await ctx.registry.connect(ctx.owner).applySources();
}

describe("CredentialRegistry — audit pass 1 PoCs", function () {
  it("P1-01 (accepted): a single owner of a multi-owner org Safe acts as the org alone", async function () {
    // Owner decision (plan open question 1): authority = the Safe, any Safe owner, or an
    // Admin. orgOwner2, one of the two owners of ORG_A's Safe, revokes the batch alone,
    // without the Safe's threshold; an owner gets nothing an Admin lacks.
    const ctx = await loadFixture(withIssued);
    const { registry, orgOwner2, alice, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(true);

    expect(await registry.canManage(ORG_A, orgOwner2.address)).to.equal(true);
    await expect(registry.connect(orgOwner2).revokeBatch(batchId)).to.emit(registry, "BatchRevoked").withArgs(batchId);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(false);
  });

  it("P1-02: replacing OrgRegistry must not resurrect a revoked generation's types and holdings", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, alice, batchId, leaves, t } = ctx;
    const deadType = ctx.typeId;
    await claimAs(ctx, alice, batchId, leaves.alice, t);

    // The org is revoked (generation 0 -> 1); its types go dark, as designed.
    await revokeOrg(ctx, ORG_A);
    await reRegisterOrg(ctx, ORG_A, safe);
    expect(await registry.holds(deadType, alice.address)).to.equal(false);

    // A planned OrgRegistry cutover imports orgs with migrationRegister, which can only
    // register at generation 0 — the dead generation.
    const orgs2 = await freshOrgRegistry(ctx, ORG_A, await safe.getAddress());
    await repointOrgRegistry(ctx, await orgs2.getAddress());

    // Secure: a credential revoked with its org stays dead, and cannot be rebound.
    expect(await registry.holds(deadType, alice.address)).to.equal(false);
    expect(await registry.isTypeActive(deadType)).to.equal(false);
    await expect(registry.rebindType(deadType)).to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(deadType);
  });

  it("P1-03: the owner cannot issue in an org's namespace by re-pointing the sources", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, owner, stranger } = ctx;
    // The owner controls a Safe of its own and imports ORG_A to it in a fresh registry.
    const ownerSafe = await (await ethers.getContractFactory("OrgMockSafe")).deploy([owner.address]);
    const orgs2 = await freshOrgRegistry(ctx, ORG_A, await ownerSafe.getAddress());
    await repointOrgRegistry(ctx, await orgs2.getAddress());

    const forged = leaf(LeafKind.Account, ctx.typeId, stranger.address);
    const t = tree([forged]);
    // The type stays bound to the old registry: nothing can be issued until a rebind.
    expect(await registry.isTypeActive(ctx.typeId)).to.equal(false);
    await expect(asSafe(ownerSafe, owner, registry, "addBatch", [ctx.typeId, t.root, 1]))
      .to.be.reverted;
    await expect(registry.connect(stranger).addBatch(ctx.typeId, t.root, 1))
      .to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(ctx.typeId);
  });

  it("P1-03 (accepted, narrowed): after the delay AND an explicit rebind, an owner-controlled registry grants authority", async function () {
    // Residual owner trust, visible on chain: SourcesProposed, 2 days, SourcesApplied,
    // then a TypeRebound per type. Documented in the contract NatSpec. Since P2-01 a
    // real OrgRegistry that imports the id to a different Safe cannot be rebound to;
    // a registry the owner controls can still report the org's Safe and appoint an Admin.
    const ctx = await loadFixture(withIssued);
    const { registry, owner, stranger, safe } = ctx;
    const ownerSafe = await (await ethers.getContractFactory("OrgMockSafe")).deploy([owner.address]);
    const orgs2 = await freshOrgRegistry(ctx, ORG_A, await ownerSafe.getAddress());
    const fake = await (await ethers.getContractFactory("CredMockOrgRegistry")).deploy();
    await fake.setOrg(ORG_A, await safe.getAddress(), 7n, true);
    await fake.setRole(ORG_A, owner.address, OrgRole.Admin);

    await repointOrgRegistry(ctx, await orgs2.getAddress());
    await expect(registry.connect(stranger).rebindType(ctx.typeId))
      .to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(ctx.typeId);

    await repointOrgRegistry(ctx, await fake.getAddress());
    await expect(registry.connect(stranger).rebindType(ctx.typeId))
      .to.emit(registry, "TypeRebound").withArgs(ctx.typeId, await fake.getAddress(), 7n);
    const t = tree([leaf(LeafKind.Account, ctx.typeId, stranger.address)]);
    await expect(registry.connect(owner).addBatch(ctx.typeId, t.root, 1)).to.emit(registry, "BatchAdded");
  });

  it("P1-04 (accepted): delegates survive admin removal and Safe rotation; the authority revokes each", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, orgs, safe, safe2, orgOwner, admin, stranger } = ctx;
    // A compromised admin appoints an attacker-controlled delegate.
    await registry.connect(admin).setDelegate(ctx.typeId, stranger.address, true);

    // Recovery: the Safe demotes the admin and rotates to a fresh Safe.
    await asSafe(safe, orgOwner, orgs, "setRole", [ORG_A, admin.address, OrgRole.None]);
    await asSafe(safe, orgOwner, orgs, "proposeRotation", [ORG_A, await safe2.getAddress()]);
    await asSafe(safe2, orgOwner, orgs, "acceptRotation", [ORG_A]);

    // By design the delegate persists (no bulk reset; a future resetDelegates is an option).
    const t = tree([leaf(LeafKind.Account, ctx.typeId, stranger.address)]);
    await expect(registry.connect(stranger).addBatch(ctx.typeId, t.root, 1)).to.emit(registry, "BatchAdded");

    // Recovery: the new authority revokes the delegate (DelegateSet events list them all).
    const delegates = (await registry.queryFilter(registry.filters.DelegateSet(ctx.typeId)))
      .filter((e) => e.args.allowed).map((e) => e.args.delegate);
    expect(delegates).to.include(stranger.address);
    await asSafe(safe2, orgOwner, registry, "setDelegate", [ctx.typeId, stranger.address, false]);
    await expect(registry.connect(stranger).addBatch(ctx.typeId, t.root, 1))
      .to.be.revertedWithCustomError(registry, "NotAuthorised");
  });

  it("P1-05: changing a recognised type's config drops the recognition seal", async function () {
    const ctx = await loadFixture(base);
    const { registry, owner, safe, orgOwner } = ctx;
    const local = ethers.id("netizen:credential-type:v1:office");
    await asSafe(safe, orgOwner, registry, "createType",
      [ORG_A, local, Kind.Role, 0n, cfg({ supplyCap: 1n, metadataURI: "https://x/stadtvertreter.json" })]);
    const tId = await registry.typeIdOf(ORG_A, local);
    await registry.connect(owner).setRecognised(tId, true);

    // The org lifts the cap and re-labels the office after the owner sealed it.
    await expect(asSafe(safe, orgOwner, registry, "updateType",
      [tId, cfg({ supplyCap: 0n, metadataURI: "https://x/buergermeister.json" })]))
      .to.emit(registry, "TypeRecognised").withArgs(tId, false);

    expect((await registry.getType(tId)).recognised).to.equal(false);
    // An edit of an unrecognised type emits no TypeRecognised.
    await expect(asSafe(safe, orgOwner, registry, "updateType", [tId, cfg()]))
      .to.not.emit(registry, "TypeRecognised");
    // The owner may seal it again.
    await registry.connect(owner).setRecognised(tId, true);
    expect((await registry.getType(tId)).recognised).to.equal(true);
  });

  it("P1-06: a reverting source does not brick holds/balanceOfBatch for readers", async function () {
    const ctx = await loadFixture(base);
    const { registry, owner, alice, identity, orgs } = ctx;
    await registry.connect(alice).selfClaim(GUEST_TYPE);

    // A source that reverts on every call (e.g. a proxy upgraded to a broken impl, or a
    // mistaken proposal that nobody cancelled within SOURCES_DELAY).
    const bad = ethers.Wallet.createRandom().address;
    await network.provider.send("hardhat_setCode", [bad, "0x60006000fd"]); // PUSH 0 PUSH 0 REVERT
    await registry.connect(owner).proposeSources(bad, await identity.getAddress(), await orgs.getAddress());
    await time.increase(2 * DAY);
    await registry.connect(owner).applySources();

    // Secure: a broken source answers "not held" instead of reverting the whole batch read.
    const r = await registry.balanceOfBatch([alice.address, alice.address], [GUEST_TYPE, CITIZEN_TYPE]);
    expect(r[0]).to.equal(1n);
    expect(r[1]).to.equal(0n);
    expect(await registry.holds(CITIZEN_TYPE, alice.address)).to.equal(false);
  });

  it("P1-06: a reverting OrgRegistry makes org types inactive for readers instead of reverting", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, owner, alice, identity, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await registry.connect(alice).selfClaim(GUEST_TYPE);
    const bad = ethers.Wallet.createRandom().address;
    await network.provider.send("hardhat_setCode", [bad, "0x60006000fd"]);
    const id = await identity.getAddress();
    await registry.connect(owner).proposeSources(id, id, bad);
    await time.increase(2 * DAY);
    await registry.connect(owner).applySources();

    expect(await registry.isTypeActive(ctx.typeId)).to.equal(false);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(false);
    expect(await registry.balanceOfBatch([alice.address, alice.address], [ctx.typeId, GUEST_TYPE])).to.deep.equal([0n, 1n]);
    const [status] = await registry.checkLeaf(batchId, leaves.alice, t.proof(leaves.alice));
    expect(status).to.equal(LeafStatus.Inactive);
    // No rebind either: the current (broken) registry cannot confirm the org.
    await expect(registry.rebindType(ctx.typeId)).to.be.revertedWithCustomError(registry, "NotRebindable");
    // State-changing paths revert with TypeInactive.
    await expect(claimAs(ctx, ctx.bob, batchId, leaves.bob, t))
      .to.be.revertedWithCustomError(registry, "TypeInactive");
  });

  it("P1-07 (accepted): balanceOf is validity-aware and changes without TransferSingle; prune emits the burn", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner, alice, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    const id = BigInt(ctx.typeId);
    expect(await registry.balanceOf(alice.address, id)).to.equal(1n);

    await asSafe(safe, orgOwner, registry, "revokeBatch", [batchId]);

    // Sum of TransferSingle values (what every ERC-1155 indexer and wallet computes).
    async function transferSum() {
      const logs = await registry.queryFilter(registry.filters.TransferSingle());
      let sum = 0n;
      for (const l of logs) {
        if (l.args.id !== id) continue;
        if (l.args.to === alice.address) sum += l.args.value;
        if (l.args.from === alice.address) sum -= l.args.value;
      }
      return sum;
    }
    // By design: the balance follows validity (0), the event sum still says 1.
    expect(await registry.balanceOf(alice.address, id)).to.equal(0n);
    expect(await transferSum()).to.equal(1n);
    // prune emits the burn and the two agree again.
    await expect(registry.connect(ctx.stranger).prune(ctx.typeId, alice.address)).to.emit(registry, "TransferSingle");
    expect(await transferSum()).to.equal(0n);
  });

  it("P1-08: changing a type's metadata URI emits the ERC-1155 URI event", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner } = ctx;
    await expect(asSafe(safe, orgOwner, registry, "updateType", [ctx.typeId, cfg({ metadataURI: "https://x/v2.json" })]))
      .to.emit(registry, "URI").withArgs("https://x/v2.json", BigInt(ctx.typeId));
    // Unchanged URI: no URI event.
    await expect(asSafe(safe, orgOwner, registry, "updateType", [ctx.typeId, cfg({ metadataURI: "https://x/v2.json", supplyCap: 3n })]))
      .to.not.emit(registry, "URI");
  });

  it("P1-08: createType and the reserved types emit the ERC-1155 URI event", async function () {
    const ctx = await loadFixture(base);
    const { registry, safe, orgOwner } = ctx;
    const deployTx = registry.deploymentTransaction();
    for (const [i, id] of [CITIZEN_TYPE, ATTESTER_TYPE, GUEST_TYPE].entries()) {
      await expect(deployTx).to.emit(registry, "URI").withArgs(RESERVED_URIS[i], BigInt(id));
    }
    const local = ethers.id("netizen:credential-type:v1:uri");
    const tId = await registry.typeIdOf(ORG_A, local);
    await expect(asSafe(safe, orgOwner, registry, "createType", [ORG_A, local, Kind.Badge, Policy.IssuerBatch, cfg({ metadataURI: "https://x/b.json" })]))
      .to.emit(registry, "URI").withArgs("https://x/b.json", BigInt(tId));
  });

  it("P1-09 (accepted): a stale holder blocks a capped office until pruned; prune + claim then succeeds", async function () {
    const ctx = await loadFixture(base);
    const { registry, safe, orgOwner, alice, bob } = ctx;
    const { typeId: tId, batchId, leaves, t } = await issued(ctx, { name: "cap1", config: cfg({ supplyCap: 1n }) });
    await claimAs(ctx, alice, batchId, leaves.alice, t);

    // The office passes on: old batch revoked, new batch for bob.
    await asSafe(safe, orgOwner, registry, "revokeBatch", [batchId]);
    expect(await registry.holds(tId, alice.address)).to.equal(false);
    const lb = leaf(LeafKind.Account, tId, bob.address);
    const { batchId: b2, t: t2 } = await addBatchOf(ctx, tId, [lb]);

    // By design: alice's stale holding still fills the slot until pruned.
    await expect(claimAs(ctx, bob, b2, lb, t2)).to.be.revertedWithCustomError(registry, "SupplyCapReached").withArgs(tId);
    // Apps batch prune + claim in one user operation.
    await registry.connect(bob).prune(tId, alice.address);
    await expect(claimAs(ctx, bob, b2, lb, t2)).to.emit(registry, "Claimed");
    expect(await registry.holds(tId, bob.address)).to.equal(true);
  });

  it("P1-15 (accepted): a cap below supply is allowed; nothing is burned, mints stop, renewals work", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner, alice, bob, batchId, leaves, t } = ctx;
    await claimAs(ctx, alice, batchId, leaves.alice, t);
    await claimAs(ctx, bob, batchId, leaves.bob, t);
    await asSafe(safe, orgOwner, registry, "updateType", [ctx.typeId, cfg({ supplyCap: 1n })]);
    const ty = await registry.getType(ctx.typeId);
    expect(ty.supply).to.equal(2n);
    expect(ty.config.supplyCap).to.equal(1n);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(true);
    expect(await registry.holds(ctx.typeId, bob.address)).to.equal(true);
    // A new holder cannot mint.
    const lc = leaf(LeafKind.Account, ctx.typeId, ctx.stranger.address);
    const b = await addBatchOf(ctx, ctx.typeId, [lc]);
    await expect(claimAs(ctx, ctx.stranger, b.batchId, lc, b.t)).to.be.revertedWithCustomError(registry, "SupplyCapReached");
    // Renewal by an existing holder still works.
    await expect(claimAs(ctx, alice, batchId, leaves.alice, t)).to.emit(registry, "Claimed");
  });
});

describe("CredentialRegistry — audit pass 1: type rebinding (P1-02)", function () {
  /** A live type with alice holding, then an OrgRegistry swap to a fresh registry that imports ORG_A. */
  async function swapped() {
    const ctx = await withIssued();
    await claimAs(ctx, ctx.alice, ctx.batchId, ctx.leaves.alice, ctx.t);
    ctx.oldRegistry = await ctx.orgs.getAddress();
    ctx.orgs2 = await freshOrgRegistry(ctx, ORG_A, await ctx.safe.getAddress());
    await repointOrgRegistry(ctx, await ctx.orgs2.getAddress());
    return ctx;
  }

  it("createType binds the type to the current registry; COMMUNITY types are unbound", async function () {
    const ctx = await loadFixture(withIssued);
    expect(await ctx.registry.typeRegistryOf(ctx.typeId)).to.equal(await ctx.orgs.getAddress());
    expect(await ctx.registry.typeRegistryOf(GUEST_TYPE)).to.equal(ethers.ZeroAddress);
  });

  it("holds is false between the swap and the rebind; the type is inactive", async function () {
    const ctx = await loadFixture(swapped);
    const { registry, alice } = ctx;
    expect(await registry.typeRegistryOf(ctx.typeId)).to.equal(ctx.oldRegistry);
    expect(await registry.isTypeActive(ctx.typeId)).to.equal(false);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(false);
    expect(await registry.balanceOf(alice.address, BigInt(ctx.typeId))).to.equal(0n);
    const [status] = await registry.checkLeaf(ctx.batchId, ctx.leaves.alice, ctx.t.proof(ctx.leaves.alice));
    expect(status).to.equal(LeafStatus.Inactive);
  });

  it("prune refuses a holding whose type awaits rebinding", async function () {
    const ctx = await loadFixture(swapped);
    await expect(ctx.registry.connect(ctx.stranger).prune(ctx.typeId, ctx.alice.address))
      .to.be.revertedWithCustomError(ctx.registry, "StillValid");
  });

  it("a live type continues after swap + rebind (permissionless), under the new generation", async function () {
    const ctx = await loadFixture(swapped);
    const { registry, alice, bob, stranger, safe, orgOwner } = ctx;
    const orgs2Addr = await ctx.orgs2.getAddress();
    await expect(registry.connect(stranger).rebindType(ctx.typeId))
      .to.emit(registry, "TypeRebound").withArgs(ctx.typeId, orgs2Addr, 0n);
    expect(await registry.typeRegistryOf(ctx.typeId)).to.equal(orgs2Addr);
    expect((await registry.getType(ctx.typeId)).orgGeneration).to.equal(0n);
    expect(await registry.isTypeActive(ctx.typeId)).to.equal(true);
    expect(await registry.holds(ctx.typeId, alice.address)).to.equal(true);
    await expect(claimAs(ctx, bob, ctx.batchId, ctx.leaves.bob, ctx.t)).to.emit(registry, "Claimed");
    const t2 = tree([leaf(LeafKind.Account, ctx.typeId, stranger.address)]);
    await expect(asSafe(safe, orgOwner, registry, "addBatch", [ctx.typeId, t2.root, 1])).to.emit(registry, "BatchAdded");
  });

  it("a live type at a non-zero generation adopts the new registry's generation", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe } = ctx;
    // ORG_A goes to generation 1 and gets a fresh type there.
    await revokeOrg(ctx, ORG_A);
    await reRegisterOrg(ctx, ORG_A, safe);
    const live = await createOrgType(ctx, { name: "gen1" });
    expect((await registry.getType(live)).orgGeneration).to.equal(1n);
    const orgs2 = await freshOrgRegistry(ctx, ORG_A, await safe.getAddress());
    await repointOrgRegistry(ctx, await orgs2.getAddress());
    await expect(registry.rebindType(live)).to.emit(registry, "TypeRebound").withArgs(live, await orgs2.getAddress(), 0n);
    expect((await registry.getType(live)).orgGeneration).to.equal(0n);
    expect(await registry.isTypeActive(live)).to.equal(true);
    // The generation-0 type stays dead.
    await expect(registry.rebindType(ctx.typeId)).to.be.revertedWithCustomError(registry, "NotRebindable");
    expect(await registry.isTypeActive(ctx.typeId)).to.equal(false);
  });

  it("rebinding twice reverts NotRebindable", async function () {
    const ctx = await loadFixture(swapped);
    await ctx.registry.rebindType(ctx.typeId);
    await expect(ctx.registry.rebindType(ctx.typeId))
      .to.be.revertedWithCustomError(ctx.registry, "NotRebindable").withArgs(ctx.typeId);
  });

  it("rebindType reverts without a swap, for COMMUNITY, External, retired, unknown, and orgs missing from the new registry", async function () {
    const ctx = await loadFixture(withIssued);
    const { registry, safe, orgOwner } = ctx;
    await claimAs(ctx, ctx.alice, ctx.batchId, ctx.leaves.alice, ctx.t);
    await expect(registry.rebindType(ctx.typeId)).to.be.revertedWithCustomError(registry, "NotRebindable");
    const retired = await createOrgType(ctx, { name: "retired" });
    await asSafe(safe, orgOwner, registry, "retireType", [retired]);
    // A fresh registry that does NOT import ORG_A.
    const orgs2 = await (await ethers.getContractFactory("OrgRegistry")).deploy(
      ctx.owner.address, await ctx.identity.getAddress(), APPROVAL, REJECTION, REVOCATION,
    );
    await repointOrgRegistry(ctx, await orgs2.getAddress());
    for (const id of [ctx.typeId, retired, GUEST_TYPE, CITIZEN_TYPE, ATTESTER_TYPE]) {
      await expect(registry.rebindType(id)).to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(id);
    }
    await expect(registry.rebindType(ethers.id("nope"))).to.be.revertedWithCustomError(registry, "UnknownType");
    expect(await registry.isTypeActive(ctx.typeId)).to.equal(false);
    // Still alive in its bound registry: awaiting rebind, so not prunable (the keeper imports the org first).
    await expect(registry.connect(ctx.stranger).prune(ctx.typeId, ctx.alice.address))
      .to.be.revertedWithCustomError(registry, "StillValid");
  });

  it("an org revoked in the old registry after the swap is no longer rebindable", async function () {
    const ctx = await loadFixture(swapped);
    await revokeOrg(ctx, ORG_A); // on the OLD registry (ctx.orgs)
    await expect(ctx.registry.rebindType(ctx.typeId)).to.be.revertedWithCustomError(ctx.registry, "NotRebindable");
    await expect(ctx.registry.connect(ctx.stranger).prune(ctx.typeId, ctx.alice.address)).to.emit(ctx.registry, "Pruned");
  });

  it("COMMUNITY types are unaffected by the swap", async function () {
    const ctx = await loadFixture(swapped);
    const { registry, alice, bob } = ctx;
    await registry.connect(bob).selfClaim(GUEST_TYPE);
    expect(await registry.isTypeActive(GUEST_TYPE)).to.equal(true);
    expect(await registry.holds(GUEST_TYPE, bob.address)).to.equal(true);
    expect(await registry.balanceOf(alice.address, BigInt(GUEST_TYPE))).to.equal(0n);
  });
});
