const { expect } = require("chai");
const { ethers } = require("hardhat");

// Status enum mirrors the contract.
const Status = { Pending: 0, Approved: 1, Rejected: 2, Executed: 3 };

// Band = [percentBps, floor, cap]. NO_CAP = uint16 max.
const NO_CAP = 65535;
const APPROVAL_BAND = [5000, 3, 7]; // 50%, floor 3, cap 7  (mint + revoke)
const REJECTION_BAND = [5000, 3, 7]; // 50%, floor 3, cap 7

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [owner, attA, attB, attC, target, other] = signers;
  const AttesterNFTv2 = await ethers.getContractFactory("AttesterNFTv2");
  const attesterNFT = await AttesterNFTv2.deploy(
    owner.address,
    "Roebel Attester",
    "ROEBEL-ATTESTER",
    [attA.address, attB.address, attC.address],
    APPROVAL_BAND,
    REJECTION_BAND
  );
  await attesterNFT.waitForDeployment();
  return { signers, owner, attA, attB, attC, target, other, attesterNFT };
}

describe("AttesterNFTv2 — bootstrap + counter", function () {
  it("mints 3 founders and sets attesterCount = 3", async function () {
    const { attesterNFT, attA, attB, attC } = await deployFixture();
    expect(await attesterNFT.balanceOf(attA.address)).to.equal(1n);
    expect(await attesterNFT.balanceOf(attB.address)).to.equal(1n);
    expect(await attesterNFT.balanceOf(attC.address)).to.equal(1n);
    expect(await attesterNFT.attesterCount()).to.equal(3n);
  });

  it("is soulbound (no transfers)", async function () {
    const { attesterNFT, attA, other } = await deployFixture();
    const tokenId = await attesterNFT.tokenOfOwnerByIndex(attA.address, 0);
    await expect(
      attesterNFT.connect(attA).transferFrom(attA.address, other.address, tokenId)
    ).to.be.revertedWith("Attester NFTs are soulbound and cannot be transferred");
  });
});

describe("AttesterNFTv2 — %-band approval threshold (snapshotted at creation)", function () {
  it("snapshots requiredApprovals from attesterCount at creation: 3 needed at size 3", async function () {
    const { attesterNFT, attA, attB, attC, target } = await deployFixture();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;
    // 50% of 3 = 1.5 -> ceil 2, floor 3 -> 3
    expect(await attesterNFT.requiredApprovalsFor(reqId)).to.equal(3n);

    await attesterNFT.connect(attA).approveRequest(reqId);
    await attesterNFT.connect(attB).approveRequest(reqId);
    expect((await attesterNFT.getRequest(reqId)).status).to.equal(Status.Pending);

    await attesterNFT.connect(attC).approveRequest(reqId); // 3rd -> executes
    expect((await attesterNFT.getRequest(reqId)).status).to.equal(Status.Executed);
    expect(await attesterNFT.balanceOf(target.address)).to.equal(1n);
    expect(await attesterNFT.attesterCount()).to.equal(4n);
  });

  it("uses the snapshot, not later band changes (no moving goalposts)", async function () {
    const { attesterNFT, owner, attA, attB, target, other } = await deployFixture();
    // First request snapshots requiredApprovals = 3
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    expect(await attesterNFT.requiredApprovalsFor(0)).to.equal(3n);

    // Owner relaxes the band to fixed-1
    await attesterNFT.connect(owner).setApprovalBand([0, 1, 1]);

    // The already-open request still needs 3 (2 approvals stays Pending)
    await attesterNFT.connect(attA).approveRequest(0);
    await attesterNFT.connect(attB).approveRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Pending);

    // A NEW request snapshots the new band -> needs 1
    await attesterNFT.connect(other).createAttestationRequest("ipfs://e");
    expect(await attesterNFT.requiredApprovalsFor(1)).to.equal(1n);
    await attesterNFT.connect(attA).approveRequest(1);
    expect((await attesterNFT.getRequest(1)).status).to.equal(Status.Executed);
  });

  it("respects the cap as the attester set grows", async function () {
    const { attesterNFT, signers, target } = await deployFixture();
    // Inflate the attester set to 20 via migrationMint (cheap bulk add)
    const extra = signers.slice(6, 20).map((s) => s.address); // 14 more -> wait, need 17 to reach 20
    // signers has 20; 3 are founders (idx1-3), use idx 6..19 = 14 addresses -> count 17
    await attesterNFT.migrationMint(extra);
    const count = await attesterNFT.attesterCount();
    // 50% of count, capped at 7
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    const expected = Math.min(7, Math.ceil((Number(count) * 50) / 100));
    expect(await attesterNFT.requiredApprovalsFor(0)).to.equal(BigInt(expected));
  });
});

describe("AttesterNFTv2 — counter decrements on revoke", function () {
  it("attesterCount drops when an attester is revoked", async function () {
    const { attesterNFT, attA, attB, attC } = await deployFixture();
    // Revoke attC: revocation also uses approvalBand snapshot (3 needed). attA + attB + ... but
    // only 3 attesters exist and the target can't sign, so lower the band first to make it feasible.
    // Use governance to set approvalBand to fixed-2 so 2 non-target attesters can revoke.
    const { owner } = await deployFixture(); // fresh not needed; use connect(owner) below
    // setApprovalBand via the same instance's owner:
    const ownerSigner = (await ethers.getSigners())[0];
    await attesterNFT.connect(ownerSigner).setApprovalBand([0, 2, 2]);

    await attesterNFT.connect(attA).createRevocationRequest(attC.address, "ipfs://e");
    expect(await attesterNFT.requiredApprovalsFor(0)).to.equal(2n);
    await attesterNFT.connect(attA).approveRequest(0);
    await attesterNFT.connect(attB).approveRequest(0); // executes revoke
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Executed);
    expect(await attesterNFT.hasAttesterNFT(attC.address)).to.equal(false);
    expect(await attesterNFT.attesterCount()).to.equal(2n);
  });
});

describe("AttesterNFTv2 — rejection band + governance setters", function () {
  it("requires the snapshotted rejection count to flip status", async function () {
    const { attesterNFT, attA, attB, attC, target } = await deployFixture();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    // 50% of 3 floor 3 -> 3 rejections needed
    expect(await attesterNFT.requiredRejectionsFor(0)).to.equal(3n);
    await attesterNFT.connect(attA).rejectRequest(0);
    await attesterNFT.connect(attB).rejectRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Pending);
    await attesterNFT.connect(attC).rejectRequest(0);
    expect((await attesterNFT.getRequest(0)).status).to.equal(Status.Rejected);
  });

  it("setApprovalBand / setRejectionBand are owner-only and validated", async function () {
    const { attesterNFT, owner, other } = await deployFixture();
    await expect(attesterNFT.connect(other).setApprovalBand([5000, 2, 5]))
      .to.be.revertedWithCustomError(attesterNFT, "OwnableUnauthorizedAccount");
    await expect(attesterNFT.connect(owner).setApprovalBand([5000, 0, 5]))
      .to.be.revertedWith("floor >= 1");
    await expect(attesterNFT.connect(owner).setApprovalBand([5000, 5, 3]))
      .to.be.revertedWith("cap >= floor");
    await expect(attesterNFT.connect(owner).setApprovalBand([10001, 1, 5]))
      .to.be.revertedWith("bps <= 10000");
    await attesterNFT.connect(owner).setApprovalBand([5000, 2, 5]); // ok
  });

  it("blocks double-approval by the same wallet", async function () {
    const { attesterNFT, attA, target } = await deployFixture();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    await attesterNFT.connect(attA).approveRequest(0);
    await expect(attesterNFT.connect(attA).approveRequest(0)).to.be.revertedWith("Already approved");
  });
});

describe("AttesterNFTv2 — migration", function () {
  it("migrationMint adds attesters + bumps counter, then finalize disables it", async function () {
    const { attesterNFT, signers } = await deployFixture();
    const newOnes = [signers[6].address, signers[7].address];
    await attesterNFT.migrationMint(newOnes);
    expect(await attesterNFT.attesterCount()).to.equal(5n);
    expect(await attesterNFT.hasAttesterNFT(signers[6].address)).to.equal(true);
    await attesterNFT.finalizeMigration();
    await expect(attesterNFT.migrationMint([signers[8].address])).to.be.revertedWith("Migration finalized");
  });
});
