const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");
const {
  Status, Source, CITIZEN_THRESHOLDS, deployV3, legacyWithSafe, viaSafeThroughLegacy, viaSafe,
} = require("./v3-helpers");

const TWO_YEARS = 2 * 365 * 24 * 60 * 60;

/** Bootstraps a legacy account (controlled by `controller`) as a v3 citizen and returns it
 *  with its linked Safe. */
async function legacyCitizen(ctx, controller, { source = 0 } = {}) {
  const { legacy, safe } = await legacyWithSafe(controller);
  const addr = await legacy.getAddress();
  await ctx.v2Cit.setHolder(addr, true);
  await ctx.v2Cit.setSource(addr, source);
  await ctx.citizenNFT.connect(ctx.owner).bootstrapFromV2([addr]);
  return { legacy, safe, addr, safeAddr: await safe.getAddress() };
}

async function moveCitizen(ctx, controller, { legacy, safe }, dest) {
  const nft = ctx.citizenNFT;
  const data = nft.interface.encodeFunctionData("moveTo", [dest ?? (await safe.getAddress())]);
  return viaSafeThroughLegacy(controller, safe, legacy, await nft.getAddress(), data);
}

// ---------------------------------------------------------------------------
// v2 semantics, ported
// ---------------------------------------------------------------------------

describe("CitizenNFTv3 — v2 semantics", function () {
  it("bootstrap mints the v2 holders, sets citizenCount, self-delegates", async function () {
    const { citizenNFT, attA, citB } = await deployV3();
    expect(await citizenNFT.citizenCount()).to.equal(3n);
    expect(await citizenNFT.getVotes(citB.address)).to.equal(1n);
    expect(await citizenNFT.delegates(citB.address)).to.equal(citB.address);
    expect(await citizenNFT.hasCitizenNFT(attA.address)).to.equal(true);
    expect(await citizenNFT.attestationSource(citB.address)).to.equal(Source.AttesterMultisig);
  });

  it("is soulbound", async function () {
    const { citizenNFT, citB, other } = await deployV3();
    const id = await citizenNFT.tokenOfOwnerByIndex(citB.address, 0);
    await expect(citizenNFT.connect(citB).transferFrom(citB.address, other.address, id))
      .to.be.revertedWithCustomError(citizenNFT, "Soulbound");
  });

  it("join: 2 attester sigs + 1 citizen sig executes at 3 attesters", async function () {
    const { citizenNFT, attA, attB, citB, target } = await deployV3();
    await citizenNFT.connect(target).createAttestationRequest("commit:0xabc");
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(2n);
    expect(await citizenNFT.requiredCitizenApprovalsFor(0)).to.equal(1n);
    await citizenNFT.connect(attA).approveRequest(0, true);
    await citizenNFT.connect(attB).approveRequest(0, true);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending);
    await citizenNFT.connect(citB).approveRequest(0, false);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
    expect(await citizenNFT.balanceOf(target.address)).to.equal(1n);
    expect(await citizenNFT.citizenCount()).to.equal(4n);
    expect(await citizenNFT.getVotes(target.address)).to.equal(1n);
  });

  it("attester-side requirement scales with AttesterNFTv3.attesterCount()", async function () {
    const { citizenNFT, attesterNFT, v2Att, signers, target } = await deployV3();
    const extra = signers.slice(8, 18).map((s) => s.address);
    for (const a of extra) await v2Att.setHolder(a, true);
    await attesterNFT.bootstrapFromV2(extra);
    const count = Number(await attesterNFT.attesterCount());
    expect(count).to.equal(13);
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    const expected = Math.min(7, Math.max(2, Math.ceil((count * 30) / 100)));
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(BigInt(expected));
  });

  it("no-double-sign: a dual holder counts for one role only", async function () {
    const t = [...CITIZEN_THRESHOLDS];
    t[0] = [0, 1, 1];
    const { citizenNFT, attA, citB, target } = await deployV3({ citizenThresholds: t });
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    await citizenNFT.connect(attA).approveRequest(0, true);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending);
    await expect(citizenNFT.connect(attA).approveRequest(0, false))
      .to.be.revertedWithCustomError(citizenNFT, "AlreadyVoted");
    await citizenNFT.connect(citB).approveRequest(0, false);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
  });

  it("must hold the role you sign as; target cannot vote", async function () {
    const { citizenNFT, citB, citC, other, target } = await deployV3();
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    await expect(citizenNFT.connect(citB).approveRequest(0, true))
      .to.be.revertedWithCustomError(citizenNFT, "NotAttester");
    await expect(citizenNFT.connect(other).approveRequest(0, false))
      .to.be.revertedWithCustomError(citizenNFT, "NotAttesterOrCitizen");
    await citizenNFT.connect(citB).createRevocationRequest(citC.address, "reason");
    await expect(citizenNFT.connect(citC).rejectRequest(1, false))
      .to.be.revertedWithCustomError(citizenNFT, "TargetCannotVote");
  });

  it("revocation: floor-3 attesters + 1 citizen", async function () {
    const { citizenNFT, attA, attB, attC, citB, citC } = await deployV3();
    await citizenNFT.connect(citB).createRevocationRequest(citC.address, "reason");
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(3n);
    await citizenNFT.connect(attA).approveRequest(0, true);
    await citizenNFT.connect(attB).approveRequest(0, true);
    await citizenNFT.connect(attC).approveRequest(0, true);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending);
    await citizenNFT.connect(citB).approveRequest(0, false);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
    expect(await citizenNFT.hasCitizenNFT(citC.address)).to.equal(false);
    expect(await citizenNFT.citizenCount()).to.equal(2n);
    expect(await citizenNFT.getVotes(citC.address)).to.equal(0n);
  });

  it("rejection needs the snapshotted attester AND citizen rejections", async function () {
    const { citizenNFT, attA, attB, citB, citC, target } = await deployV3();
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    expect(await citizenNFT.requiredAttesterRejectionsFor(0)).to.equal(2n);
    expect(await citizenNFT.requiredCitizenRejectionsFor(0)).to.equal(2n);
    await citizenNFT.connect(attA).rejectRequest(0, true);
    await citizenNFT.connect(attB).rejectRequest(0, true);
    await citizenNFT.connect(citB).rejectRequest(0, false);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending);
    await citizenNFT.connect(citC).rejectRequest(0, false);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Rejected);
  });

  it("setAttestationBands is owner-only, keeps v2 validation, and applies to new requests", async function () {
    const { citizenNFT, owner, other, target } = await deployV3();
    await expect(citizenNFT.connect(other).setAttestationBands([5000, 2, 9], [0, 2, 2]))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await expect(citizenNFT.connect(owner).setAttestationBands([5000, 0, 9], [0, 1, 1]))
      .to.be.revertedWith("floor >= 1");
    // v2 rules exactly: a floor of 1 stays allowed (no extra minimum floors in v3).
    await citizenNFT.connect(owner).setAttestationBands([0, 1, 1], [0, 2, 2]);
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(1n);
    expect(await citizenNFT.requiredCitizenApprovalsFor(0)).to.equal(2n);
  });

  it("revocation and rejection setters are owner-only", async function () {
    const { citizenNFT, owner, other } = await deployV3();
    await expect(citizenNFT.connect(other).setRevocationBands([1, 1, 1], [1, 1, 1]))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await expect(citizenNFT.connect(other).setRejectionBands([1, 1, 1], [1, 1, 1]))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await citizenNFT.connect(owner).setRevocationBands([6700, 3, 65535], [0, 1, 1]);
    await citizenNFT.connect(owner).setRejectionBands([2500, 2, 5], [2500, 2, 5]);
  });

  it("emergencyMint is permanently disabled", async function () {
    const { citizenNFT, owner, other } = await deployV3();
    await expect(citizenNFT.connect(owner).emergencyMint(other.address))
      .to.be.revertedWithCustomError(citizenNFT, "EmergencyMintDisabled");
  });
});

// ---------------------------------------------------------------------------
// Deliberate change from v2: no re-attestation / expiry
// ---------------------------------------------------------------------------

describe("CitizenNFTv3 — no expiry (deliberate change from v2)", function () {
  it("has no validity machinery in its ABI", async function () {
    const { citizenNFT } = await deployV3();
    for (const name of ["isActive", "validUntil", "attestationValidityPeriod", "setValidityPeriod", "renewSelf", "renewByVouch"]) {
      expect(citizenNFT.interface.getFunction(name), name).to.equal(null);
    }
  });

  it("after 2 years a citizen still holds, still has its vote and can still approve", async function () {
    const { citizenNFT, attA, attB, citB, target } = await deployV3();
    await time.increase(TWO_YEARS);
    expect(await citizenNFT.hasCitizenNFT(citB.address)).to.equal(true);
    expect(await citizenNFT.getVotes(citB.address)).to.equal(1n);
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    await citizenNFT.connect(attA).approveRequest(0, true);
    await citizenNFT.connect(attB).approveRequest(0, true);
    await citizenNFT.connect(citB).approveRequest(0, false);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
  });
});

// ---------------------------------------------------------------------------
// Bootstrap from v2 + owner powers
// ---------------------------------------------------------------------------

describe("CitizenNFTv3 — bootstrap from v2", function () {
  it("reverts for a non-v2-holder", async function () {
    const { citizenNFT, owner, other } = await deployV3();
    await expect(citizenNFT.connect(owner).bootstrapFromV2([other.address]))
      .to.be.revertedWithCustomError(citizenNFT, "NotV2Holder").withArgs(other.address);
  });

  it("skips addresses that already hold, copies attestationSource, emits BootstrapMinted", async function () {
    const { citizenNFT, v2Cit, owner, citB, other } = await deployV3();
    await v2Cit.setHolder(other.address, true);
    await v2Cit.setSource(other.address, Source.SelfPersonhood);
    await expect(citizenNFT.connect(owner).bootstrapFromV2([citB.address, other.address, other.address]))
      .to.emit(citizenNFT, "BootstrapMinted");
    expect(await citizenNFT.citizenCount()).to.equal(4n);
    expect(await citizenNFT.balanceOf(other.address)).to.equal(1n);
    expect(await citizenNFT.attestationSource(other.address)).to.equal(Source.SelfPersonhood);
  });

  it("never re-mints a revoked or moved-away address", async function () {
    const ctx = await deployV3();
    const { citizenNFT, owner, attA, attB, attC, citB, citC, signers } = ctx;
    // revoke citC
    await citizenNFT.connect(citB).createRevocationRequest(citC.address, "r");
    for (const a of [attA, attB, attC]) await citizenNFT.connect(a).approveRequest(0, true);
    await citizenNFT.connect(citB).approveRequest(0, false);
    // move a legacy citizen away
    const lc = await legacyCitizen(ctx, signers[10]);
    await moveCitizen(ctx, signers[10], lc);
    const before = await citizenNFT.citizenCount();
    await citizenNFT.connect(owner).bootstrapFromV2([citC.address, lc.addr]);
    expect(await citizenNFT.citizenCount()).to.equal(before);
    expect(await citizenNFT.hasCitizenNFT(citC.address)).to.equal(false);
    expect(await citizenNFT.hasCitizenNFT(lc.addr)).to.equal(false);
  });

  it("bootstrap after finalize reverts; no owner mint path remains", async function () {
    const { citizenNFT, v2Cit, owner, other } = await deployV3();
    await expect(citizenNFT.connect(owner).finalizeBootstrap()).to.emit(citizenNFT, "BootstrapFinalized");
    await v2Cit.setHolder(other.address, true);
    await expect(citizenNFT.connect(owner).bootstrapFromV2([other.address]))
      .to.be.revertedWithCustomError(citizenNFT, "BootstrapAlreadyFinalized");
    const fns = citizenNFT.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    for (const n of fns) expect(n.toLowerCase()).to.not.match(/burn|migrationmint|adminmint|ownermint/);
  });

  it("owner-only: bootstrap, finalize, closeMoveWindow", async function () {
    const { citizenNFT, other, citB } = await deployV3();
    await expect(citizenNFT.connect(other).bootstrapFromV2([citB.address]))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await expect(citizenNFT.connect(other).finalizeBootstrap())
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await expect(citizenNFT.connect(other).closeMoveWindow())
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
  });
});

describe("CitizenNFTv3 — Ownable2Step", function () {
  it("EOA handover needs acceptance; only the pending owner can accept", async function () {
    const { citizenNFT, owner, other, target } = await deployV3();
    await citizenNFT.connect(owner).transferOwnership(other.address);
    expect(await citizenNFT.owner()).to.equal(owner.address);
    expect(await citizenNFT.pendingOwner()).to.equal(other.address);
    await expect(citizenNFT.connect(target).acceptOwnership())
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await citizenNFT.connect(other).acceptOwnership();
    expect(await citizenNFT.owner()).to.equal(other.address);
    await expect(citizenNFT.connect(owner).setRejectionBands([2500, 2, 5], [2500, 2, 5]))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
  });

  it("Attester Safe → Timelock: contract owners, one-way switches, setters follow the owner", async function () {
    const [, ctrlSafe, ctrlTl] = await ethers.getSigners();
    const Safe = await ethers.getContractFactory("MockSafe");
    const safe = await Safe.deploy(ctrlSafe.address);
    const timelock = await Safe.deploy(ctrlTl.address); // Safe-like stand-in for the Timelock
    const safeAddr = await safe.getAddress();
    const tlAddr = await timelock.getAddress();
    const ctx = await deployV3({ ownerAddress: safeAddr });
    const { citizenNFT, attA, citB, citC } = ctx;
    const nftAddr = await citizenNFT.getAddress();
    const enc = (fn, args) => citizenNFT.interface.encodeFunctionData(fn, args);

    // Bootstrap + one-way switches while the Safe owns it.
    await viaSafe(ctrlSafe, safe, nftAddr, enc("bootstrapFromV2", [[attA.address, citB.address, citC.address]]));
    expect(await citizenNFT.citizenCount()).to.equal(3n);
    await viaSafe(ctrlSafe, safe, nftAddr, enc("finalizeBootstrap", []));
    expect(await citizenNFT.bootstrapFinalized()).to.equal(true);

    // Handover: Safe proposes, Timelock accepts.
    await viaSafe(ctrlSafe, safe, nftAddr, enc("transferOwnership", [tlAddr]));
    expect(await citizenNFT.owner()).to.equal(safeAddr);
    expect(await citizenNFT.pendingOwner()).to.equal(tlAddr);
    await viaSafe(ctrlTl, timelock, nftAddr, enc("acceptOwnership", []));
    expect(await citizenNFT.owner()).to.equal(tlAddr);

    // Old Safe is locked out; Timelock can run setters and the remaining one-way switch.
    await expect(viaSafe(ctrlSafe, safe, nftAddr, enc("setAttestationBands", [[0, 1, 1], [0, 1, 1]])))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await expect(viaSafe(ctrlSafe, safe, nftAddr, enc("closeMoveWindow", [])))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await viaSafe(ctrlTl, timelock, nftAddr, enc("setAttestationBands", [[3000, 2, 7], [0, 1, 1]]));
    await viaSafe(ctrlTl, timelock, nftAddr, enc("closeMoveWindow", []));
    expect(await citizenNFT.moveWindowClosed()).to.equal(true);
  });
});

// ---------------------------------------------------------------------------
// moveTo
// ---------------------------------------------------------------------------

describe("CitizenNFTv3 — moveTo", function () {
  it("happy path: Safe → legacy.execute → moveTo(safe)", async function () {
    const ctx = await deployV3();
    const { citizenNFT, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl, { source: Source.SelfPersonhood });
    const tokenId = await citizenNFT.tokenOfOwnerByIndex(lc.addr, 0);
    const count = await citizenNFT.citizenCount();
    expect(await citizenNFT.getVotes(lc.addr)).to.equal(1n);

    await expect(moveCitizen(ctx, ctrl, lc))
      .to.emit(citizenNFT, "Moved").withArgs(lc.addr, lc.safeAddr, tokenId, tokenId);

    expect(await citizenNFT.hasCitizenNFT(lc.addr)).to.equal(false);
    expect(await citizenNFT.balanceOf(lc.addr)).to.equal(0n);
    expect(await citizenNFT.hasCitizenNFT(lc.safeAddr)).to.equal(true);
    expect(await citizenNFT.ownerOf(tokenId)).to.equal(lc.safeAddr);
    expect(await citizenNFT.tokenOfOwnerByIndex(lc.safeAddr, 0)).to.equal(tokenId);
    expect(await citizenNFT.hasEverHeldCitizenNFT(lc.safeAddr)).to.equal(true);
    expect(await citizenNFT.attestationSource(lc.safeAddr)).to.equal(Source.SelfPersonhood);
    expect(await citizenNFT.citizenCount()).to.equal(count);
    expect(await citizenNFT.movedTo(lc.addr)).to.equal(lc.safeAddr);
    expect(await citizenNFT.originOf(lc.safeAddr)).to.equal(lc.addr);
    expect(await citizenNFT.currentHolderOf(lc.addr)).to.equal(lc.safeAddr);
    expect(await lc.safe.received()).to.equal(1n); // _safeMint hit the Safe's receiver hook
  });

  it("votes: old account 0, new account 1 (self-delegated), total supply unchanged", async function () {
    const ctx = await deployV3();
    const { citizenNFT, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    await mine(1);
    const b0 = await ethers.provider.getBlockNumber();
    const supplyBefore = await citizenNFT.getPastTotalSupply(b0 - 1);
    await moveCitizen(ctx, ctrl, lc);
    await mine(1);
    const b1 = await ethers.provider.getBlockNumber();
    expect(await citizenNFT.getVotes(lc.addr)).to.equal(0n);
    expect(await citizenNFT.getVotes(lc.safeAddr)).to.equal(1n);
    expect(await citizenNFT.getPastVotes(lc.addr, b0 - 1)).to.equal(1n); // history kept
    expect(await citizenNFT.delegates(lc.safeAddr)).to.equal(lc.safeAddr);
    expect(await citizenNFT.getPastTotalSupply(b1 - 1)).to.equal(supplyBefore);
  });

  it("chained move to a counterfactual (code-less) address keeps origin and count", async function () {
    const ctx = await deployV3();
    const { citizenNFT, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    const nftAddr = await citizenNFT.getAddress();
    const count = await citizenNFT.citizenCount();
    // hop 1: legacy → another account that itself exposes isAdmin/execute
    const Legacy = await ethers.getContractFactory("MockLegacyAccount");
    const hop = await Legacy.deploy(ctrl.address);
    const hopAddr = await hop.getAddress();
    await lc.legacy.connect(ctrl).setAdmin(hopAddr, true);
    await lc.legacy.connect(ctrl).execute(nftAddr, 0, citizenNFT.interface.encodeFunctionData("moveTo", [hopAddr]));
    // hop 2: → a counterfactual address with no code yet (safeMint skips the receiver check)
    const dest = signers[11].address;
    await hop.connect(ctrl).setAdmin(dest, true);
    await hop.connect(ctrl).execute(nftAddr, 0, citizenNFT.interface.encodeFunctionData("moveTo", [dest]));
    expect(await citizenNFT.hasCitizenNFT(dest)).to.equal(true);
    expect(await citizenNFT.hasCitizenNFT(hopAddr)).to.equal(false);
    expect(await citizenNFT.citizenCount()).to.equal(count);
    expect(await citizenNFT.originOf(dest)).to.equal(lc.addr);
    expect(await citizenNFT.currentHolderOf(lc.addr)).to.equal(dest);
    expect(await citizenNFT.currentHolderOf(hopAddr)).to.equal(dest);
    expect(await citizenNFT.getVotes(dest)).to.equal(1n);
  });

  it("reverts without the isAdmin link", async function () {
    const ctx = await deployV3();
    const { citizenNFT, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    const stranger = signers[13].address;
    await expect(moveCitizen(ctx, ctrl, lc, stranger))
      .to.be.revertedWithCustomError(citizenNFT, "NotLinked").withArgs(lc.addr, stranger);
  });

  it("an EOA holder or a contract without a proper isAdmin gets LinkCheckFailed", async function () {
    const ctx = await deployV3();
    const { citizenNFT, citB, other, owner, v2Cit, signers } = ctx;
    await expect(citizenNFT.connect(citB).moveTo(other.address))
      .to.be.revertedWithCustomError(citizenNFT, "LinkCheckFailed").withArgs(citB.address);

    const Bad = await ethers.getContractFactory("MockBadIsAdmin");
    const bad = await Bad.deploy();
    const badAddr = await bad.getAddress();
    await v2Cit.setHolder(badAddr, true);
    await citizenNFT.connect(owner).bootstrapFromV2([badAddr]);
    const data = citizenNFT.interface.encodeFunctionData("moveTo", [signers[14].address]);
    await expect(bad.exec(await citizenNFT.getAddress(), data))
      .to.be.revertedWithCustomError(citizenNFT, "LinkCheckFailed").withArgs(badAddr);
  });

  it("reverts when the destination holds, has held, or moved away; or is zero", async function () {
    const ctx = await deployV3();
    const { citizenNFT, citB, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    await lc.legacy.connect(ctrl).setAdmin(citB.address, true);
    await expect(moveCitizen(ctx, ctrl, lc, citB.address))
      .to.be.revertedWithCustomError(citizenNFT, "DestinationAlreadyUsed").withArgs(citB.address);
    await expect(moveCitizen(ctx, ctrl, lc, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(citizenNFT, "ZeroAddress");

    // a second legacy citizen that moved away cannot be a destination
    const lc2 = await legacyCitizen(ctx, signers[11]);
    await moveCitizen(ctx, signers[11], lc2);
    await lc.legacy.connect(ctrl).setAdmin(lc2.addr, true);
    await lc.legacy.connect(ctrl).setAdmin(lc2.safeAddr, true);
    await expect(moveCitizen(ctx, ctrl, lc, lc2.addr))
      .to.be.revertedWithCustomError(citizenNFT, "DestinationAlreadyUsed");
    await expect(moveCitizen(ctx, ctrl, lc, lc2.safeAddr))
      .to.be.revertedWithCustomError(citizenNFT, "DestinationAlreadyUsed");
  });

  it("reverts for a caller that holds no token (including a moved-away account)", async function () {
    const ctx = await deployV3();
    const { citizenNFT, other, signers } = ctx;
    await expect(citizenNFT.connect(other).moveTo(signers[15].address))
      .to.be.revertedWithCustomError(citizenNFT, "NotHolder").withArgs(other.address);
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    await moveCitizen(ctx, ctrl, lc);
    await lc.legacy.connect(ctrl).setAdmin(signers[15].address, true);
    await expect(moveCitizen(ctx, ctrl, lc, signers[15].address))
      .to.be.revertedWithCustomError(citizenNFT, "NotHolder").withArgs(lc.addr);
  });

  it("reverts after closeMoveWindow (one-way)", async function () {
    const ctx = await deployV3();
    const { citizenNFT, owner, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    await expect(citizenNFT.connect(owner).closeMoveWindow()).to.emit(citizenNFT, "MoveWindowClosed");
    await expect(moveCitizen(ctx, ctrl, lc))
      .to.be.revertedWithCustomError(citizenNFT, "MoveWindowAlreadyClosed");
  });

  it("a destination that rejects ERC721 reverts the whole move (atomic)", async function () {
    const ctx = await deployV3();
    const { citizenNFT, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    const NR = await ethers.getContractFactory("MockNonReceiver");
    const nr = await NR.deploy(ctrl.address);
    const nrAddr = await nr.getAddress();
    await lc.legacy.connect(ctrl).setAdmin(nrAddr, true);
    await expect(moveCitizen(ctx, ctrl, lc, nrAddr))
      .to.be.revertedWithCustomError(citizenNFT, "ERC721InvalidReceiver");
    expect(await citizenNFT.hasCitizenNFT(lc.addr)).to.equal(true);
    expect(await citizenNFT.getVotes(lc.addr)).to.equal(1n);
  });
});

// ---------------------------------------------------------------------------
// Flows with Safe-like contract callers + open requests across moves
// ---------------------------------------------------------------------------

describe("CitizenNFTv3 — Safe-like callers and open requests", function () {
  it("attestation flow: Safe applicant, Safe approvers; token lands via _safeMint", async function () {
    const ctx = await deployV3();
    const { citizenNFT, attesterNFT, v2Att, owner, signers, attA } = ctx;
    const nftAddr = await citizenNFT.getAddress();
    const enc = (fn, args) => citizenNFT.interface.encodeFunctionData(fn, args);

    // Two attesters that moved to Safes (via AttesterNFTv3.moveTo)
    const moved = [];
    for (const i of [10, 11]) {
      const ctrl = signers[i];
      const { legacy, safe } = await legacyWithSafe(ctrl);
      const la = await legacy.getAddress();
      await v2Att.setHolder(la, true);
      await attesterNFT.connect(owner).bootstrapFromV2([la]);
      const mv = attesterNFT.interface.encodeFunctionData("moveTo", [await safe.getAddress()]);
      await viaSafeThroughLegacy(ctrl, safe, legacy, await attesterNFT.getAddress(), mv);
      moved.push({ ctrl, safe });
    }
    // A citizen that moved to a Safe
    const cctrl = signers[12];
    const lc = await legacyCitizen(ctx, cctrl);
    await moveCitizen(ctx, cctrl, lc);

    // Applicant is a fresh passkey Safe
    const Safe = await ethers.getContractFactory("MockSafe");
    const applicantCtrl = signers[13];
    const applicant = await Safe.deploy(applicantCtrl.address);
    const appAddr = await applicant.getAddress();
    await viaSafe(applicantCtrl, applicant, nftAddr, enc("createAttestationRequest", ["commit:safe"]));
    const id = (await citizenNFT.requestCount()) - 1n;

    await viaSafe(moved[0].ctrl, moved[0].safe, nftAddr, enc("approveRequest", [id, true]));
    await viaSafe(moved[1].ctrl, moved[1].safe, nftAddr, enc("approveRequest", [id, true]));
    await viaSafe(cctrl, lc.safe, nftAddr, enc("approveRequest", [id, false]));
    expect((await citizenNFT.getRequest(id)).status).to.equal(Status.Executed);
    expect(await citizenNFT.hasCitizenNFT(appAddr)).to.equal(true);
    expect(await applicant.received()).to.equal(1n);
    expect(await citizenNFT.getVotes(appAddr)).to.equal(1n);
    expect(attA).to.exist;
  });

  it("revocation flow driven by Safe-like callers", async function () {
    const ctx = await deployV3();
    const { citizenNFT, attA, attB, attC, citC, signers } = ctx;
    const nftAddr = await citizenNFT.getAddress();
    const enc = (fn, args) => citizenNFT.interface.encodeFunctionData(fn, args);
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    await moveCitizen(ctx, ctrl, lc);
    await viaSafe(ctrl, lc.safe, nftAddr, enc("createRevocationRequest", [citC.address, "r"]));
    for (const a of [attA, attB, attC]) await citizenNFT.connect(a).approveRequest(0, true);
    await viaSafe(ctrl, lc.safe, nftAddr, enc("approveRequest", [0, false]));
    expect(await citizenNFT.hasCitizenNFT(citC.address)).to.equal(false);
  });

  it("a pending request whose approver moved: vote stays, no second vote from the new account", async function () {
    const ctx = await deployV3();
    const { citizenNFT, attA, attB, citB, target, signers } = ctx;
    const nftAddr = await citizenNFT.getAddress();
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);

    await citizenNFT.connect(target).createAttestationRequest("commit:1");
    // legacy citizen approves as citizen, from the legacy address
    const approve = citizenNFT.interface.encodeFunctionData("approveRequest", [0, false]);
    await lc.legacy.connect(ctrl).execute(nftAddr, 0, approve);
    expect((await citizenNFT.getRequest(0)).citizenSignatures).to.equal(1n);

    await moveCitizen(ctx, ctrl, lc);
    expect((await citizenNFT.getRequest(0)).citizenSignatures).to.equal(1n); // stays counted
    expect(await citizenNFT.hasApprovedRequest(0, lc.addr)).to.equal(true);
    expect(await citizenNFT.hasApprovedRequest(0, lc.safeAddr)).to.equal(true);
    await expect(viaSafe(ctrl, lc.safe, nftAddr, approve))
      .to.be.revertedWithCustomError(citizenNFT, "AlreadyVoted");
    const reject = citizenNFT.interface.encodeFunctionData("rejectRequest", [0, false]);
    await expect(viaSafe(ctrl, lc.safe, nftAddr, reject))
      .to.be.revertedWithCustomError(citizenNFT, "AlreadyVoted");

    // other people complete it normally
    await citizenNFT.connect(attA).approveRequest(0, true);
    await citizenNFT.connect(attB).approveRequest(0, true);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
    expect(citB).to.exist;
  });

  it("a split dual holder (attester moved, citizen not) still counts for one role", async function () {
    const t = [...CITIZEN_THRESHOLDS];
    t[0] = [0, 1, 1]; // 1 attester + 1 citizen joins
    const ctx = await deployV3({ citizenThresholds: t });
    const { citizenNFT, attesterNFT, v2Att, owner, target, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl); // citizen at legacy
    await v2Att.setHolder(lc.addr, true);
    await attesterNFT.connect(owner).bootstrapFromV2([lc.addr]); // also attester at legacy
    const mv = attesterNFT.interface.encodeFunctionData("moveTo", [lc.safeAddr]);
    await viaSafeThroughLegacy(ctrl, lc.safe, lc.legacy, await attesterNFT.getAddress(), mv);
    // now: attester at Safe, citizen at legacy → two addresses, one person
    expect(await attesterNFT.hasAttesterNFT(lc.safeAddr)).to.equal(true);
    expect(await citizenNFT.hasCitizenNFT(lc.addr)).to.equal(true);

    const nftAddr = await citizenNFT.getAddress();
    await citizenNFT.connect(target).createAttestationRequest("commit:1");
    await lc.legacy.connect(ctrl).execute(nftAddr, 0, citizenNFT.interface.encodeFunctionData("approveRequest", [0, false]));
    await expect(viaSafe(ctrl, lc.safe, nftAddr, citizenNFT.interface.encodeFunctionData("approveRequest", [0, true])))
      .to.be.revertedWithCustomError(citizenNFT, "AlreadyVoted");
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending);
  });

  it("a pending revocation follows the target to its new account; the target can't vote on it", async function () {
    const ctx = await deployV3();
    const { citizenNFT, attA, attB, attC, citB, signers } = ctx;
    const nftAddr = await citizenNFT.getAddress();
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    await citizenNFT.connect(citB).createRevocationRequest(lc.addr, "r");
    await citizenNFT.connect(attA).approveRequest(0, true);

    const count = await citizenNFT.citizenCount();
    await moveCitizen(ctx, ctrl, lc);
    await expect(viaSafe(ctrl, lc.safe, nftAddr, citizenNFT.interface.encodeFunctionData("rejectRequest", [0, false])))
      .to.be.revertedWithCustomError(citizenNFT, "TargetCannotVote");

    await citizenNFT.connect(attB).approveRequest(0, true);
    await citizenNFT.connect(attC).approveRequest(0, true);
    await expect(citizenNFT.connect(citB).approveRequest(0, false))
      .to.emit(citizenNFT, "CitizenNFTRevoked");
    expect(await citizenNFT.hasCitizenNFT(lc.safeAddr)).to.equal(false); // the right account
    expect(await citizenNFT.hasCitizenNFT(citB.address)).to.equal(true);
    expect(await citizenNFT.citizenCount()).to.equal(count - 1n);
    expect(await citizenNFT.getVotes(lc.safeAddr)).to.equal(0n);
    expect(await citizenNFT.currentHolderOf(lc.addr)).to.equal(ethers.ZeroAddress);
  });

  it("a stale attestation request of an account that later moved away can never mint to it", async function () {
    const ctx = await deployV3();
    const { citizenNFT, attA, attB, citB, owner, signers } = ctx;
    const nftAddr = await citizenNFT.getAddress();
    const ctrl = signers[10];
    const { legacy, safe } = await legacyWithSafe(ctrl);
    const la = await legacy.getAddress();
    // legacy applies before bootstrap …
    await legacy.connect(ctrl).execute(nftAddr, 0, citizenNFT.interface.encodeFunctionData("createAttestationRequest", ["c"]));
    // … is bootstrapped and moves
    await ctx.v2Cit.setHolder(la, true);
    await citizenNFT.connect(owner).bootstrapFromV2([la]);
    await viaSafeThroughLegacy(ctrl, safe, legacy, nftAddr, citizenNFT.interface.encodeFunctionData("moveTo", [await safe.getAddress()]));
    await citizenNFT.connect(attA).approveRequest(0, true);
    await citizenNFT.connect(attB).approveRequest(0, true);
    await expect(citizenNFT.connect(citB).approveRequest(0, false))
      .to.be.revertedWithCustomError(citizenNFT, "AccountMovedAway").withArgs(la);
    // and the moved-away account cannot apply again
    await expect(legacy.connect(ctrl).execute(nftAddr, 0, citizenNFT.interface.encodeFunctionData("createAttestationRequest", ["c"])))
      .to.be.revertedWithCustomError(citizenNFT, "AccountMovedAway");
  });

  it("citizen-side thresholds are unchanged by a move", async function () {
    const ctx = await deployV3();
    const { citizenNFT, citB, target, signers } = ctx;
    const ctrl = signers[10];
    const lc = await legacyCitizen(ctx, ctrl);
    await citizenNFT.connect(target).createAttestationRequest("c");
    await citizenNFT.connect(citB).createRevocationRequest(lc.addr, "r");
    const before = [await citizenNFT.requiredCitizenRejectionsFor(0), await citizenNFT.requiredAttesterApprovalsFor(1)];
    await moveCitizen(ctx, ctrl, lc);
    await citizenNFT.connect(signers[16]).createAttestationRequest("c");
    await citizenNFT.connect(citB).createRevocationRequest(lc.safeAddr, "r");
    expect(await citizenNFT.requiredCitizenRejectionsFor(2)).to.equal(before[0]);
    expect(await citizenNFT.requiredAttesterApprovalsFor(3)).to.equal(before[1]);
  });
});
