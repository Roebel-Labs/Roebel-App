const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  ORG_A, ORG_B, COMMUNITY, CITIZEN_TYPE, ATTESTER_TYPE, GUEST_TYPE, RESERVED_URIS,
  Kind, Policy, DAY, LOCAL, typeId, cfg, asSafe, revokeOrg, reRegisterOrg, deployRegister,
} = require("./credential-helpers");

/** The Safe creates a Membership/IssuerBatch type in ORG_A. */
async function withType(ctx, n = "t1", config = cfg()) {
  const local = LOCAL(n);
  await asSafe(ctx.safe, ctx.orgOwner, ctx.registry, "createType", [ORG_A, local, Kind.Membership, Policy.IssuerBatch, config]);
  return typeId(ORG_A, local);
}

describe("CredentialRegistry — types and authority", function () {
  it("deploys with three reserved types", async function () {
    const { registry, owner } = await deployRegister();
    expect(await registry.CITIZEN_TYPE()).to.equal(CITIZEN_TYPE);
    expect(await registry.ATTESTER_TYPE()).to.equal(ATTESTER_TYPE);
    expect(await registry.GUEST_TYPE()).to.equal(GUEST_TYPE);
    expect(await registry.COMMUNITY()).to.equal(COMMUNITY);
    expect(await registry.MAX_URI_BYTES()).to.equal(512n);
    expect(await registry.SOURCES_DELAY()).to.equal(BigInt(2 * DAY));

    const c = await registry.getType(CITIZEN_TYPE);
    expect(c.orgId).to.equal(COMMUNITY);
    expect(c.kind).to.equal(Kind.Role);
    expect(c.policy).to.equal(Policy.External);
    expect(c.config.metadataURI).to.equal(RESERVED_URIS[0]);
    const a = await registry.getType(ATTESTER_TYPE);
    expect(a.orgId).to.equal(COMMUNITY);
    expect(a.kind).to.equal(Kind.Role);
    expect(a.policy).to.equal(Policy.External);
    expect(a.config.metadataURI).to.equal(RESERVED_URIS[1]);
    const g = await registry.getType(GUEST_TYPE);
    expect(g.orgId).to.equal(COMMUNITY);
    expect(g.kind).to.equal(Kind.Membership);
    expect(g.policy).to.equal(Policy.SelfClaim);
    expect(g.config.publicClaim).to.equal(true);
    expect(g.config.supplyCap).to.equal(0n);
    expect(g.config.defaultValidity).to.equal(0n);
    expect(g.recognised).to.equal(false);

    expect(await registry.typeIdOf(COMMUNITY, LOCAL("citizen"))).to.equal(CITIZEN_TYPE);
    expect(await registry.typeIdOf(COMMUNITY, LOCAL("attester"))).to.equal(ATTESTER_TYPE);
    expect(await registry.typeIdOf(COMMUNITY, LOCAL("guest"))).to.equal(GUEST_TYPE);
    expect(c.localId).to.equal(LOCAL("citizen"));
    expect(await registry.owner()).to.equal(owner.address);
    await expect(registry.getType(ethers.id("nope"))).to.be.revertedWithCustomError(registry, "UnknownType");
  });

  it("ownership is two-step", async function () {
    const { registry, owner, stranger } = await deployRegister();
    await registry.transferOwnership(stranger.address);
    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.pendingOwner()).to.equal(stranger.address);
    await registry.connect(stranger).acceptOwnership();
    expect(await registry.owner()).to.equal(stranger.address);
  });

  it("the Safe creates a type", async function () {
    const ctx = await deployRegister();
    const { registry, safe, orgOwner } = ctx;
    const local = LOCAL("t1");
    const id = typeId(ORG_A, local);
    const config = cfg();
    await expect(asSafe(safe, orgOwner, registry, "createType", [ORG_A, local, Kind.Membership, Policy.IssuerBatch, config]))
      .to.emit(registry, "TypeCreated").withArgs(id, ORG_A, local, Kind.Membership, Policy.IssuerBatch, 0)
      .and.to.emit(registry, "TypeConfigured");
    expect(await registry.typeIdOf(ORG_A, local)).to.equal(id);
    expect(await registry.typeExists(id)).to.equal(true);
    expect(await registry.isTypeActive(id)).to.equal(true);
    const t = await registry.getType(id);
    expect(t.orgId).to.equal(ORG_A);
    expect(t.localId).to.equal(local);
    expect(t.orgGeneration).to.equal(0n);
    expect(t.supply).to.equal(0n);
    expect(t.config.metadataURI).to.equal(config.metadataURI);
  });

  it("a Safe owner and an Admin create types directly; a Member, a delegate and a stranger cannot", async function () {
    const ctx = await deployRegister();
    const { registry, orgOwner, admin, member, delegate, stranger } = ctx;
    const id = await withType(ctx, "base");
    await asSafe(ctx.safe, orgOwner, registry, "setDelegate", [id, delegate.address, true]);

    await expect(registry.connect(orgOwner).createType(ORG_A, LOCAL("o"), Kind.Badge, Policy.SelfClaim, cfg()))
      .to.emit(registry, "TypeCreated");
    await expect(registry.connect(admin).createType(ORG_A, LOCAL("a"), Kind.Role, Policy.IssuerBatch, cfg()))
      .to.emit(registry, "TypeCreated");
    for (const s of [member, delegate, stranger]) {
      await expect(registry.connect(s).createType(ORG_A, LOCAL("x"), Kind.Role, Policy.IssuerBatch, cfg()))
        .to.be.revertedWithCustomError(registry, "NotAuthorised").withArgs(s.address);
    }
  });

  it("the contract owner manages the community namespace only", async function () {
    const { registry, owner, orgOwner } = await deployRegister();
    await expect(registry.connect(owner).createType(COMMUNITY, LOCAL("c"), Kind.Badge, Policy.SelfClaim, cfg()))
      .to.emit(registry, "TypeCreated").withArgs(typeId(COMMUNITY, LOCAL("c")), COMMUNITY, LOCAL("c"), Kind.Badge, Policy.SelfClaim, 0);
    await expect(registry.connect(orgOwner).createType(COMMUNITY, LOCAL("d"), Kind.Badge, Policy.SelfClaim, cfg()))
      .to.be.revertedWithCustomError(registry, "NotAuthorised");
    await expect(registry.connect(owner).createType(ORG_A, LOCAL("e"), Kind.Badge, Policy.SelfClaim, cfg()))
      .to.be.revertedWithCustomError(registry, "NotAuthorised");
    expect(await registry.canManage(COMMUNITY, owner.address)).to.equal(true);
    expect(await registry.canManage(ORG_A, owner.address)).to.equal(false);
  });

  it("an unregistered org cannot have types", async function () {
    const { registry, owner, orgOwner } = await deployRegister();
    for (const s of [owner, orgOwner]) {
      await expect(registry.connect(s).createType(ORG_B, LOCAL("b"), Kind.Badge, Policy.SelfClaim, cfg()))
        .to.be.revertedWithCustomError(registry, "NotAuthorised");
    }
  });

  it("duplicate id, External policy, long URI, bad window", async function () {
    const ctx = await deployRegister();
    const { registry, orgOwner } = ctx;
    const create = (n, policy, config) =>
      registry.connect(orgOwner).createType(ORG_A, LOCAL(n), Kind.Badge, policy, config);
    await withType(ctx, "dup");
    await expect(create("dup", Policy.IssuerBatch, cfg()))
      .to.be.revertedWithCustomError(registry, "TypeExists").withArgs(typeId(ORG_A, LOCAL("dup")));
    await expect(create("ext", Policy.External, cfg())).to.be.revertedWithCustomError(registry, "WrongPolicy");
    await expect(create("long", Policy.IssuerBatch, cfg({ metadataURI: "a".repeat(513) })))
      .to.be.revertedWithCustomError(registry, "UriTooLong");
    await expect(create("max", Policy.IssuerBatch, cfg({ metadataURI: "a".repeat(512) }))).to.emit(registry, "TypeCreated");
    await expect(create("w1", Policy.IssuerBatch, cfg({ claimStart: 100n, claimEnd: 100n })))
      .to.be.revertedWithCustomError(registry, "BadConfig");
    await expect(create("w2", Policy.IssuerBatch, cfg({ claimStart: 100n, claimEnd: 99n })))
      .to.be.revertedWithCustomError(registry, "BadConfig");
    await expect(create("w3", Policy.IssuerBatch, cfg({ claimStart: 100n, claimEnd: 0n }))).to.emit(registry, "TypeCreated");
    await expect(create("w4", Policy.IssuerBatch, cfg({ claimStart: 0n, claimEnd: 100n }))).to.emit(registry, "TypeCreated");
  });

  it("updateType changes config, never kind or policy", async function () {
    const ctx = await deployRegister();
    const { registry, admin } = ctx;
    const id = await withType(ctx);
    const next = cfg({ metadataURI: "https://x/v2.json", defaultValidity: 3600n, supplyCap: 7n, publicClaim: false });
    await expect(registry.connect(admin).updateType(id, next)).to.emit(registry, "TypeConfigured");
    const t = await registry.getType(id);
    expect(t.config.metadataURI).to.equal("https://x/v2.json");
    expect(t.config.defaultValidity).to.equal(3600n);
    expect(t.config.supplyCap).to.equal(7n);
    expect(t.config.publicClaim).to.equal(false);
    expect(t.kind).to.equal(Kind.Membership);
    expect(t.policy).to.equal(Policy.IssuerBatch);
    await expect(registry.connect(ctx.stranger).updateType(id, next)).to.be.revertedWithCustomError(registry, "NotAuthorised");
    await expect(registry.connect(admin).updateType(id, cfg({ metadataURI: "a".repeat(513) })))
      .to.be.revertedWithCustomError(registry, "UriTooLong");
    await expect(registry.connect(admin).updateType(ethers.id("nope"), next)).to.be.revertedWithCustomError(registry, "UnknownType");
  });

  it("retireType is irreversible and blocks edits", async function () {
    const ctx = await deployRegister();
    const { registry, orgOwner } = ctx;
    const id = await withType(ctx);
    await expect(registry.connect(orgOwner).retireType(id)).to.emit(registry, "TypeRetired").withArgs(id);
    expect(await registry.isTypeActive(id)).to.equal(false);
    expect((await registry.getType(id)).retired).to.equal(true);
    await expect(registry.connect(orgOwner).updateType(id, cfg())).to.be.revertedWithCustomError(registry, "TypeInactive");
    await expect(registry.connect(orgOwner).retireType(id)).to.be.revertedWithCustomError(registry, "TypeInactive");
    await expect(registry.connect(orgOwner).setDelegate(id, orgOwner.address, true))
      .to.be.revertedWithCustomError(registry, "TypeInactive");
    // the id stays taken
    await expect(registry.connect(orgOwner).createType(ORG_A, LOCAL("t1"), Kind.Badge, Policy.SelfClaim, cfg()))
      .to.be.revertedWithCustomError(registry, "TypeExists");
  });

  it("reserved types", async function () {
    const { registry, owner, orgOwner } = await deployRegister();
    await expect(registry.connect(owner).updateType(CITIZEN_TYPE, cfg({ metadataURI: "https://x/c2.json" })))
      .to.emit(registry, "TypeConfigured");
    expect(await registry.uri(BigInt(CITIZEN_TYPE))).to.equal("https://x/c2.json");
    await expect(registry.connect(orgOwner).updateType(CITIZEN_TYPE, cfg())).to.be.revertedWithCustomError(registry, "NotAuthorised");
    await expect(registry.connect(owner).retireType(CITIZEN_TYPE)).to.be.revertedWithCustomError(registry, "ExternalType");
    await expect(registry.connect(owner).setDelegate(CITIZEN_TYPE, orgOwner.address, true))
      .to.be.revertedWithCustomError(registry, "ExternalType");
    await expect(registry.connect(owner).retireType(ATTESTER_TYPE)).to.be.revertedWithCustomError(registry, "ExternalType");
  });

  it("delegates", async function () {
    const ctx = await deployRegister();
    const { registry, orgOwner, delegate, stranger } = ctx;
    const id = await withType(ctx);
    await expect(registry.connect(orgOwner).setDelegate(id, delegate.address, true))
      .to.emit(registry, "DelegateSet").withArgs(id, delegate.address, true);
    expect(await registry.isDelegate(id, delegate.address)).to.equal(true);
    expect(await registry.canIssue(id, delegate.address)).to.equal(true);
    expect(await registry.canIssue(id, orgOwner.address)).to.equal(true);
    expect(await registry.canIssue(id, stranger.address)).to.equal(false);
    expect(await registry.canManage(ORG_A, delegate.address)).to.equal(false);
    await expect(registry.connect(delegate).setDelegate(id, stranger.address, true))
      .to.be.revertedWithCustomError(registry, "NotAuthorised").withArgs(delegate.address);
    await expect(registry.connect(orgOwner).setDelegate(id, delegate.address, false))
      .to.emit(registry, "DelegateSet").withArgs(id, delegate.address, false);
    expect(await registry.canIssue(id, delegate.address)).to.equal(false);
  });

  it("recognised is owner-only", async function () {
    const ctx = await deployRegister();
    const { registry, owner, orgOwner } = ctx;
    const id = await withType(ctx);
    await expect(registry.connect(owner).setRecognised(id, true)).to.emit(registry, "TypeRecognised").withArgs(id, true);
    expect((await registry.getType(id)).recognised).to.equal(true);
    await expect(registry.connect(orgOwner).setRecognised(id, false))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    await expect(registry.connect(owner).setRecognised(ethers.id("nope"), true))
      .to.be.revertedWithCustomError(registry, "UnknownType");
  });

  it("private-only switch", async function () {
    const ctx = await deployRegister();
    const { registry, safe, orgOwner, admin, a1, owner, stranger } = ctx;
    // org authority: on and off
    await expect(asSafe(safe, orgOwner, registry, "setOrgPrivateOnly", [ORG_A, true]))
      .to.emit(registry, "OrgPrivateOnlySet").withArgs(ORG_A, true, await safe.getAddress());
    expect(await registry.orgPrivateOnly(ORG_A)).to.equal(true);
    await expect(registry.connect(admin).setOrgPrivateOnly(ORG_A, false))
      .to.emit(registry, "OrgPrivateOnlySet").withArgs(ORG_A, false, admin.address);
    expect(await registry.orgPrivateOnly(ORG_A)).to.equal(false);
    // an attester: on only
    await expect(registry.connect(a1).setOrgPrivateOnly(ORG_A, true))
      .to.emit(registry, "OrgPrivateOnlySet").withArgs(ORG_A, true, a1.address);
    await expect(registry.connect(a1).setOrgPrivateOnly(ORG_A, false))
      .to.be.revertedWithCustomError(registry, "NotAuthorised").withArgs(a1.address);
    // a stranger: neither
    await expect(registry.connect(stranger).setOrgPrivateOnly(ORG_A, false)).to.be.revertedWithCustomError(registry, "NotAuthorised");
    await expect(registry.connect(stranger).setOrgPrivateOnly(ORG_A, true)).to.be.revertedWithCustomError(registry, "NotAuthorised");
    // the contract owner: both
    await expect(registry.connect(owner).setOrgPrivateOnly(ORG_A, false))
      .to.emit(registry, "OrgPrivateOnlySet").withArgs(ORG_A, false, owner.address);
    await expect(registry.connect(owner).setOrgPrivateOnly(ORG_A, true))
      .to.emit(registry, "OrgPrivateOnlySet").withArgs(ORG_A, true, owner.address);
    expect(await registry.orgPrivateOnly(ORG_A)).to.equal(true);
    // never for the community namespace or an unregistered org
    for (const s of [owner, a1]) {
      await expect(registry.connect(s).setOrgPrivateOnly(COMMUNITY, true)).to.be.revertedWithCustomError(registry, "NotAuthorised");
      await expect(registry.connect(s).setOrgPrivateOnly(ORG_B, true)).to.be.revertedWithCustomError(registry, "NotAuthorised");
    }
  });

  it("org revocation deactivates its types", async function () {
    const ctx = await deployRegister();
    const { registry, orgOwner } = ctx;
    const id = await withType(ctx);
    await revokeOrg(ctx, ORG_A);
    expect(await registry.isTypeActive(id)).to.equal(false);
    expect(await registry.typeExists(id)).to.equal(true);
    expect(await registry.canManage(ORG_A, orgOwner.address)).to.equal(false);
    expect(await registry.canIssue(id, orgOwner.address)).to.equal(false);
  });

  it("a re-registered org does not revive old types", async function () {
    const ctx = await deployRegister();
    const { registry, safe, orgOwner } = ctx;
    const id = await withType(ctx);
    await revokeOrg(ctx, ORG_A);
    await reRegisterOrg(ctx, ORG_A, safe);
    expect(await registry.canManage(ORG_A, orgOwner.address)).to.equal(true);
    expect(await registry.isTypeActive(id)).to.equal(false);
    await expect(registry.connect(orgOwner).updateType(id, cfg())).to.be.revertedWithCustomError(registry, "TypeInactive");
    const local = LOCAL("t2");
    await expect(registry.connect(orgOwner).createType(ORG_A, local, Kind.Membership, Policy.IssuerBatch, cfg()))
      .to.emit(registry, "TypeCreated").withArgs(typeId(ORG_A, local), ORG_A, local, Kind.Membership, Policy.IssuerBatch, 1);
    const fresh = await registry.getType(typeId(ORG_A, local));
    expect(fresh.orgGeneration).to.equal(1n);
    expect(await registry.isTypeActive(typeId(ORG_A, local))).to.equal(true);
  });

  it("holds for Citizen and Attester follows the NFTs", async function () {
    const { registry, identity, alice } = await deployRegister();
    expect(await registry.holds(CITIZEN_TYPE, alice.address)).to.equal(false);
    await identity.setCitizen(alice.address, true);
    expect(await registry.holds(CITIZEN_TYPE, alice.address)).to.equal(true);
    expect(await registry.balanceOf(alice.address, BigInt(CITIZEN_TYPE))).to.equal(1n);
    expect(await registry.holds(ATTESTER_TYPE, alice.address)).to.equal(false);
    await identity.setAttester(alice.address, true);
    expect(await registry.holds(ATTESTER_TYPE, alice.address)).to.equal(true);
    expect(await registry.balanceOf(alice.address, BigInt(ATTESTER_TYPE))).to.equal(1n);
    await identity.setCitizen(alice.address, false);
    expect(await registry.holds(CITIZEN_TYPE, alice.address)).to.equal(false);
    expect(await registry.balanceOf(alice.address, BigInt(CITIZEN_TYPE))).to.equal(0n);
  });

  it("sources are two-step with a delay", async function () {
    const { registry, identity, orgs, owner, alice, stranger } = await deployRegister();
    const identity2 = await (await ethers.getContractFactory("CredMockIdentity")).deploy();
    const id2 = await identity2.getAddress();
    const orgsAddr = await orgs.getAddress();
    await identity.setCitizen(alice.address, true);

    const tx = await registry.connect(owner).proposeSources(id2, id2, orgsAddr);
    const now = BigInt((await ethers.provider.getBlock((await tx.wait()).blockNumber)).timestamp);
    await expect(tx).to.emit(registry, "SourcesProposed").withArgs(id2, id2, orgsAddr, now + BigInt(2 * DAY));
    const pending = await registry.pendingSources();
    expect(pending.eta).to.equal(now + BigInt(2 * DAY));
    await expect(registry.applySources()).to.be.revertedWithCustomError(registry, "SourcesNotReady");
    await expect(registry.connect(stranger).applySources()).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

    await time.increase(2 * DAY);
    await expect(registry.applySources()).to.emit(registry, "SourcesApplied").withArgs(id2, id2, orgsAddr);
    expect(await registry.citizenNFT()).to.equal(id2);
    expect(await registry.attesterNFT()).to.equal(id2);
    expect(await registry.orgRegistry()).to.equal(orgsAddr);
    expect(await registry.holds(CITIZEN_TYPE, alice.address)).to.equal(false);
    await identity2.setCitizen(alice.address, true);
    expect(await registry.holds(CITIZEN_TYPE, alice.address)).to.equal(true);
    expect((await registry.pendingSources()).eta).to.equal(0n);

    // cancel clears a proposal
    await registry.proposeSources(id2, id2, orgsAddr);
    await expect(registry.cancelSources()).to.emit(registry, "SourcesCancelled");
    const cleared = await registry.pendingSources();
    expect(cleared.eta).to.equal(0n);
    expect(cleared.citizenNFT_).to.equal(ethers.ZeroAddress);
    await expect(registry.applySources()).to.be.revertedWithCustomError(registry, "NoPendingSources");

    // EOAs are refused; only the owner may propose
    await expect(registry.proposeSources(stranger.address, id2, orgsAddr))
      .to.be.revertedWithCustomError(registry, "NotContract").withArgs(stranger.address);
    await expect(registry.proposeSources(id2, id2, stranger.address)).to.be.revertedWithCustomError(registry, "NotContract");
    await expect(registry.connect(stranger).proposeSources(id2, id2, orgsAddr))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    await expect(registry.connect(stranger).cancelSources()).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
  });

  it("uri", async function () {
    const ctx = await deployRegister();
    const id = await withType(ctx, "u", cfg({ metadataURI: "ipfs://type-meta" }));
    expect(await ctx.registry.uri(BigInt(id))).to.equal("ipfs://type-meta");
    expect(await ctx.registry.uri(BigInt(GUEST_TYPE))).to.equal(RESERVED_URIS[2]);
    expect(await ctx.registry.uri(BigInt(ethers.id("unknown")))).to.equal("");
  });
});
