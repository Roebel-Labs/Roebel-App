const { expect } = require("chai");
const { ethers } = require("hardhat");

const Status = { Pending: 0, Approved: 1, Rejected: 2, Executed: 3 };

async function deployFixture() {
  const [owner, attA, attB, attC, target, other] = await ethers.getSigners();
  const AttesterNFT = await ethers.getContractFactory("AttesterNFT");
  const attesterNFT = await AttesterNFT.deploy(
    owner.address,
    "Roebel Attester",
    "ROEBEL-ATTESTER",
    [attA.address, attB.address, attC.address],
    2, // requiredSignatures
    2  // requiredRejections
  );
  await attesterNFT.waitForDeployment();
  return { owner, attA, attB, attC, target, other, attesterNFT };
}

describe("AttesterNFT — bootstrap rejects duplicates + owner-as-founder", function () {
  it("reverts on duplicate founding attester", async function () {
    const [owner, a, b] = await ethers.getSigners();
    const AttesterNFT = await ethers.getContractFactory("AttesterNFT");
    await expect(
      AttesterNFT.deploy(owner.address, "n", "s", [a.address, a.address, b.address], 2, 2)
    ).to.be.revertedWith("Duplicate founding attester");
  });

  it("reverts when owner is also a founder", async function () {
    const [owner, b, c] = await ethers.getSigners();
    const AttesterNFT = await ethers.getContractFactory("AttesterNFT");
    await expect(
      AttesterNFT.deploy(owner.address, "n", "s", [owner.address, b.address, c.address], 2, 2)
    ).to.be.revertedWith("Owner cannot be founding attester");
  });
});

describe("AttesterNFT — Bug A: O(1) revocation gas", function () {
  it("burn cost stays roughly constant across mint/burn cycles", async function () {
    const { attesterNFT, attA, attB, attC } = await deployFixture();
    const signers = await ethers.getSigners();

    // Helper: full attest+revoke cycle for one address; returns gas of the burn.
    async function cycle(victim) {
      await attesterNFT.connect(victim).createAttestationRequest("ipfs://e");
      const attestId = Number(await attesterNFT.requestCount()) - 1;
      await attesterNFT.connect(attA).approveRequest(attestId);
      await attesterNFT.connect(attB).approveRequest(attestId); // executes mint

      await attesterNFT.connect(attA).createRevocationRequest(victim.address, "ipfs://e");
      const revokeId = Number(await attesterNFT.requestCount()) - 1;
      await attesterNFT.connect(attB).approveRequest(revokeId);
      const tx = await attesterNFT.connect(attC).approveRequest(revokeId);
      const rc = await tx.wait();
      return rc.gasUsed;
    }

    const victims = signers.slice(10, 14);
    const firstBurnGas = await cycle(victims[0]);
    for (let i = 0; i < 10; i++) {
      await cycle(victims[i % victims.length]);
    }
    const laterBurnGas = await cycle(victims[0]);

    expect(laterBurnGas).to.be.lessThan(firstBurnGas * 3n / 2n);
  });
});

describe("AttesterNFT — Bug B: single-rejection veto eliminated", function () {
  it("1 Attester rejection alone does NOT flip status", async function () {
    const { attesterNFT, attA, target } = await deployFixture();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;

    await attesterNFT.connect(attA).rejectRequest(reqId);
    const r = await attesterNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);
  });

  it("2 Attester rejections DO flip status", async function () {
    const { attesterNFT, attA, attB, target } = await deployFixture();
    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;

    await attesterNFT.connect(attA).rejectRequest(reqId);
    await attesterNFT.connect(attB).rejectRequest(reqId);
    const r = await attesterNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Rejected);
  });

  it("target cannot reject their own revocation", async function () {
    const { attesterNFT, attA, attB } = await deployFixture();
    await attesterNFT.connect(attA).createRevocationRequest(attB.address, "ipfs://e");
    await expect(
      attesterNFT.connect(attB).rejectRequest(0)
    ).to.be.revertedWith("Target cannot reject their own request");
  });
});

describe("AttesterNFT — Timelock-tunable thresholds", function () {
  it("setRequiredSignatures reverts for non-owner, succeeds for owner", async function () {
    const { attesterNFT, owner, other } = await deployFixture();
    await expect(attesterNFT.connect(other).setRequiredSignatures(3))
      .to.be.revertedWithCustomError(attesterNFT, "OwnableUnauthorizedAccount");

    await attesterNFT.connect(owner).setRequiredSignatures(3);
    expect(await attesterNFT.requiredSignatures()).to.equal(3n);
  });

  it("setRequiredRejections reverts when set to 0", async function () {
    const { attesterNFT, owner } = await deployFixture();
    await expect(attesterNFT.connect(owner).setRequiredRejections(0))
      .to.be.revertedWith("rejections >= 1");
  });

  it("new requiredSignatures threshold takes effect on subsequent attestation", async function () {
    const { attesterNFT, owner, attA, attB, attC, target } = await deployFixture();
    await attesterNFT.connect(owner).setRequiredSignatures(3);

    await attesterNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;
    await attesterNFT.connect(attA).approveRequest(reqId);
    await attesterNFT.connect(attB).approveRequest(reqId);
    let r = await attesterNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);

    await attesterNFT.connect(attC).approveRequest(reqId);
    r = await attesterNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Executed);
    expect(await attesterNFT.balanceOf(target.address)).to.equal(1n);
  });
});
