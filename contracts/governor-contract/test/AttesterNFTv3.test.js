const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { Status, deployV3, legacyWithSafe, viaSafeThroughLegacy, viaSafe } = require("./v3-helpers");

async function legacyAttester(ctx, controller) {
  const { legacy, safe } = await legacyWithSafe(controller);
  const addr = await legacy.getAddress();
  await ctx.v2Att.setHolder(addr, true);
  await ctx.attesterNFT.connect(ctx.owner).bootstrapFromV2([addr]);
  return { legacy, safe, addr, safeAddr: await safe.getAddress() };
}

async function moveAttester(ctx, controller, { legacy, safe }, dest) {
  const nft = ctx.attesterNFT;
  const data = nft.interface.encodeFunctionData("moveTo", [dest ?? (await safe.getAddress())]);
  return viaSafeThroughLegacy(controller, safe, legacy, await nft.getAddress(), data);
}

describe("AttesterNFTv3 — v2 semantics", function () {
  it("bootstrap mints the v2 holders and sets attesterCount", async function () {
    const { attesterNFT, attA, attB, attC } = await deployV3();
    for (const a of [attA, attB, attC]) expect(await attesterNFT.balanceOf(a.address)).to.equal(1n);
    expect(await attesterNFT.attesterCount()).to.equal(3n);
  });

  it("is soulbound", async function () {
    const { attesterNFT, attA, other } = await deployV3();
    const id = await attesterNFT.tokenOfOwnerByIndex(attA.address, 0);
    await expect(attesterNFT.connect(attA).transferFrom(attA.address, other.address, id))
      .to.be.revertedWithCustomError(attesterNFT, "Soulbound");
  });

  it("snapshots requiredApprovals at creation (3 of 3) and mints on the 3rd approval", async function () {
    const { attesterNFT, attA, attB, attC, target } = await deployV3();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    expect(await attesterNFT.requiredApprovalsFor(0)).to.equal(3n);
    await attesterNFT.connect(attA).approveRequest(0);
    await attesterNFT.connect(attB).approveRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Pending);
    await attesterNFT.connect(attC).approveRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Executed);
    expect(await attesterNFT.attesterCount()).to.equal(4n);
  });

  it("uses the snapshot, not later band changes", async function () {
    const { attesterNFT, owner, attA, attB, target, other } = await deployV3();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    await attesterNFT.connect(owner).setApprovalBand([0, 1, 1]);
    await attesterNFT.connect(attA).approveRequest(0);
    await attesterNFT.connect(attB).approveRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Pending);
    await attesterNFT.connect(other).createAttestationRequest("ipfs://e");
    expect(await attesterNFT.requiredApprovalsFor(1)).to.equal(1n);
    await attesterNFT.connect(attA).approveRequest(1);
    expect((await attesterNFT.getRequest(1)).status).to.equal(Status.Executed);
  });

  it("respects the cap as the set grows", async function () {
    const { attesterNFT, v2Att, signers, target } = await deployV3();
    const extra = signers.slice(8, 20).map((s) => s.address);
    for (const a of extra) await v2Att.setHolder(a, true);
    await attesterNFT.bootstrapFromV2(extra);
    const count = Number(await attesterNFT.attesterCount());
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    expect(await attesterNFT.requiredApprovalsFor(0)).to.equal(BigInt(Math.min(7, Math.ceil(count / 2))));
  });

  it("revocation decrements attesterCount", async function () {
    const { attesterNFT, owner, attA, attB, attC } = await deployV3();
    await attesterNFT.connect(owner).setApprovalBand([0, 2, 2]);
    await attesterNFT.connect(attA).createRevocationRequest(attC.address, "ipfs://e");
    await attesterNFT.connect(attA).approveRequest(0);
    await attesterNFT.connect(attB).approveRequest(0);
    expect(await attesterNFT.hasAttesterNFT(attC.address)).to.equal(false);
    expect(await attesterNFT.attesterCount()).to.equal(2n);
  });

  it("rejection band flips status; double votes and target votes are blocked", async function () {
    const { attesterNFT, attA, attB, attC, target } = await deployV3();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    await attesterNFT.connect(attA).rejectRequest(0);
    await expect(attesterNFT.connect(attA).approveRequest(0))
      .to.be.revertedWithCustomError(attesterNFT, "AlreadyVoted");
    await attesterNFT.connect(attB).rejectRequest(0);
    await attesterNFT.connect(attC).rejectRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Rejected);
    await attesterNFT.connect(attA).createRevocationRequest(attC.address, "x");
    await expect(attesterNFT.connect(attC).rejectRequest(1))
      .to.be.revertedWithCustomError(attesterNFT, "TargetCannotVote");
  });

  it("band setters are owner-only and keep v2 validation (no extra floors)", async function () {
    const { attesterNFT, owner, other } = await deployV3();
    await expect(attesterNFT.connect(other).setApprovalBand([5000, 2, 5]))
      .to.be.revertedWithCustomError(attesterNFT, "OwnableUnauthorizedAccount");
    await expect(attesterNFT.connect(other).setRejectionBand([5000, 2, 5]))
      .to.be.revertedWithCustomError(attesterNFT, "OwnableUnauthorizedAccount");
    await expect(attesterNFT.connect(owner).setApprovalBand([5000, 0, 5])).to.be.revertedWith("floor >= 1");
    await expect(attesterNFT.connect(owner).setApprovalBand([5000, 5, 3])).to.be.revertedWith("cap >= floor");
    await expect(attesterNFT.connect(owner).setApprovalBand([10001, 1, 5])).to.be.revertedWith("bps <= 10000");
    await attesterNFT.connect(owner).setApprovalBand([0, 1, 1]); // floor 1 still allowed, as in v2
  });

  it("has no expiry: after 2 years an attester still holds and can approve", async function () {
    const { attesterNFT, attA, target } = await deployV3();
    await time.increase(2 * 365 * 24 * 60 * 60);
    expect(await attesterNFT.hasAttesterNFT(attA.address)).to.equal(true);
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    await attesterNFT.connect(attA).approveRequest(0);
  });
});

describe("AttesterNFTv3 — bootstrap + owner", function () {
  it("reverts for a non-v2-holder, skips existing holders", async function () {
    const { attesterNFT, owner, attA, other } = await deployV3();
    await expect(attesterNFT.connect(owner).bootstrapFromV2([other.address]))
      .to.be.revertedWithCustomError(attesterNFT, "NotV2Holder").withArgs(other.address);
    await attesterNFT.connect(owner).bootstrapFromV2([attA.address]);
    expect(await attesterNFT.attesterCount()).to.equal(3n);
  });

  it("bootstrap after finalize reverts", async function () {
    const { attesterNFT, v2Att, owner, other } = await deployV3();
    await attesterNFT.connect(owner).finalizeBootstrap();
    await v2Att.setHolder(other.address, true);
    await expect(attesterNFT.connect(owner).bootstrapFromV2([other.address]))
      .to.be.revertedWithCustomError(attesterNFT, "BootstrapAlreadyFinalized");
  });

  it("non-owner calls revert", async function () {
    const { attesterNFT, other, attA } = await deployV3();
    for (const [fn, args] of [["bootstrapFromV2", [[attA.address]]], ["finalizeBootstrap", []], ["closeMoveWindow", []], ["transferOwnership", [other.address]]]) {
      await expect(attesterNFT.connect(other)[fn](...args))
        .to.be.revertedWithCustomError(attesterNFT, "OwnableUnauthorizedAccount");
    }
  });

  it("Attester Safe → Timelock handover (Ownable2Step, contract owners)", async function () {
    const [, ctrlSafe, ctrlTl] = await ethers.getSigners();
    const Safe = await ethers.getContractFactory("MockSafe");
    const safe = await Safe.deploy(ctrlSafe.address);
    const timelock = await Safe.deploy(ctrlTl.address);
    const ctx = await deployV3({ ownerAddress: await safe.getAddress() });
    const { attesterNFT, attA, attB, attC } = ctx;
    const a = await attesterNFT.getAddress();
    const enc = (fn, args) => attesterNFT.interface.encodeFunctionData(fn, args);
    await viaSafe(ctrlSafe, safe, a, enc("bootstrapFromV2", [[attA.address, attB.address, attC.address]]));
    await viaSafe(ctrlSafe, safe, a, enc("finalizeBootstrap", []));
    await viaSafe(ctrlSafe, safe, a, enc("closeMoveWindow", []));
    expect(await attesterNFT.bootstrapFinalized()).to.equal(true);
    expect(await attesterNFT.moveWindowClosed()).to.equal(true);
    await viaSafe(ctrlSafe, safe, a, enc("transferOwnership", [await timelock.getAddress()]));
    await viaSafe(ctrlTl, timelock, a, enc("acceptOwnership", []));
    expect(await attesterNFT.owner()).to.equal(await timelock.getAddress());
    await expect(viaSafe(ctrlSafe, safe, a, enc("setApprovalBand", [[5000, 3, 7]])))
      .to.be.revertedWithCustomError(attesterNFT, "OwnableUnauthorizedAccount");
    await viaSafe(ctrlTl, timelock, a, enc("setApprovalBand", [[5000, 3, 7]]));
    await viaSafe(ctrlTl, timelock, a, enc("setRejectionBand", [[5000, 3, 7]]));
  });
});

describe("AttesterNFTv3 — moveTo", function () {
  it("happy path: same id, count constant, receiver hook hit, origin recorded", async function () {
    const ctx = await deployV3();
    const { attesterNFT, signers } = ctx;
    const ctrl = signers[10];
    const la = await legacyAttester(ctx, ctrl);
    const id = await attesterNFT.tokenOfOwnerByIndex(la.addr, 0);
    const count = await attesterNFT.attesterCount();
    await expect(moveAttester(ctx, ctrl, la))
      .to.emit(attesterNFT, "Moved").withArgs(la.addr, la.safeAddr, id, id);
    expect(await attesterNFT.hasAttesterNFT(la.addr)).to.equal(false);
    expect(await attesterNFT.hasAttesterNFT(la.safeAddr)).to.equal(true);
    expect(await attesterNFT.hasEverHeldAttesterNFT(la.safeAddr)).to.equal(true);
    expect(await attesterNFT.ownerOf(id)).to.equal(la.safeAddr);
    expect(await attesterNFT.attesterCount()).to.equal(count);
    expect(await attesterNFT.originOf(la.safeAddr)).to.equal(la.addr);
    expect(await la.safe.received()).to.equal(1n);
  });

  it("reverts: no link, destination holder, closed window, non-holder", async function () {
    const ctx = await deployV3();
    const { attesterNFT, owner, attA, other, signers } = ctx;
    const ctrl = signers[10];
    const la = await legacyAttester(ctx, ctrl);
    await expect(moveAttester(ctx, ctrl, la, signers[11].address))
      .to.be.revertedWithCustomError(attesterNFT, "NotLinked");
    await la.legacy.connect(ctrl).setAdmin(attA.address, true);
    await expect(moveAttester(ctx, ctrl, la, attA.address))
      .to.be.revertedWithCustomError(attesterNFT, "DestinationAlreadyUsed");
    await expect(attesterNFT.connect(other).moveTo(signers[11].address))
      .to.be.revertedWithCustomError(attesterNFT, "NotHolder");
    await expect(attesterNFT.connect(attA).moveTo(signers[11].address))
      .to.be.revertedWithCustomError(attesterNFT, "LinkCheckFailed");
    await attesterNFT.connect(owner).closeMoveWindow();
    await expect(moveAttester(ctx, ctrl, la))
      .to.be.revertedWithCustomError(attesterNFT, "MoveWindowAlreadyClosed");
  });

  it("thresholds after an attester moves are unchanged (AttesterNFTv3 and CitizenNFTv3)", async function () {
    const ctx = await deployV3();
    const { attesterNFT, citizenNFT, attA, citB, target, signers } = ctx;
    const ctrl = signers[10];
    const la = await legacyAttester(ctx, ctrl); // 4 attesters
    await attesterNFT.connect(target).createAttestationRequest("e");
    await citizenNFT.connect(target).createAttestationRequest("e");
    await citizenNFT.connect(citB).createRevocationRequest(attA.address, "r");
    const before = [
      await attesterNFT.requiredApprovalsFor(0), await attesterNFT.requiredRejectionsFor(0),
      await citizenNFT.requiredAttesterApprovalsFor(0), await citizenNFT.requiredAttesterApprovalsFor(1),
      await citizenNFT.requiredAttesterRejectionsFor(0),
    ];
    await moveAttester(ctx, ctrl, la);
    expect(await attesterNFT.attesterCount()).to.equal(4n);
    await attesterNFT.connect(signers[16]).createAttestationRequest("e");
    await citizenNFT.connect(signers[16]).createAttestationRequest("e");
    await citizenNFT.connect(citB).createRevocationRequest(attA.address, "r");
    const after = [
      await attesterNFT.requiredApprovalsFor(1), await attesterNFT.requiredRejectionsFor(1),
      await citizenNFT.requiredAttesterApprovalsFor(2), await citizenNFT.requiredAttesterApprovalsFor(3),
      await citizenNFT.requiredAttesterRejectionsFor(2),
    ];
    expect(after).to.deep.equal(before);
    // the moved attester signs on the citizen contract from its new address
    const approve = citizenNFT.interface.encodeFunctionData("approveRequest", [2, true]);
    await viaSafe(ctrl, la.safe, await citizenNFT.getAddress(), approve);
    expect((await citizenNFT.getRequest(2)).attesterSignatures).to.equal(1n);
  });

  it("a pending request whose approver moved: counted once, no second vote", async function () {
    const ctx = await deployV3();
    const { attesterNFT, attA, attB, target, signers } = ctx;
    const nftAddr = await attesterNFT.getAddress();
    const ctrl = signers[10];
    const la = await legacyAttester(ctx, ctrl); // 4 attesters → 50% = 2, floor 3 → 3
    await attesterNFT.connect(target).createAttestationRequest("e");
    const approve = attesterNFT.interface.encodeFunctionData("approveRequest", [0]);
    await la.legacy.connect(ctrl).execute(nftAddr, 0, approve);
    await moveAttester(ctx, ctrl, la);
    expect((await attesterNFT.getRequest(0)).signatureCount).to.equal(1n);
    expect(await attesterNFT.hasApprovedRequest(0, la.safeAddr)).to.equal(true);
    await expect(viaSafe(ctrl, la.safe, nftAddr, approve))
      .to.be.revertedWithCustomError(attesterNFT, "AlreadyVoted");
    await attesterNFT.connect(attA).approveRequest(0);
    await attesterNFT.connect(attB).approveRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Executed);
  });

  it("a pending revocation follows the moved attester", async function () {
    const ctx = await deployV3();
    const { attesterNFT, owner, attA, attB, signers } = ctx;
    const ctrl = signers[10];
    const la = await legacyAttester(ctx, ctrl);
    await attesterNFT.connect(owner).setApprovalBand([0, 2, 2]);
    await attesterNFT.connect(attA).createRevocationRequest(la.addr, "r");
    await attesterNFT.connect(attA).approveRequest(0);
    await moveAttester(ctx, ctrl, la);
    await expect(viaSafe(ctrl, la.safe, await attesterNFT.getAddress(),
      attesterNFT.interface.encodeFunctionData("rejectRequest", [0])))
      .to.be.revertedWithCustomError(attesterNFT, "TargetCannotVote");
    await attesterNFT.connect(attB).approveRequest(0);
    expect(await attesterNFT.hasAttesterNFT(la.safeAddr)).to.equal(false);
    expect(await attesterNFT.hasAttesterNFT(attA.address)).to.equal(true);
    expect(await attesterNFT.attesterCount()).to.equal(3n);
  });
});
