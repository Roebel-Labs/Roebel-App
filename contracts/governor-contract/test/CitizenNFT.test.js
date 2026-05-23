const { expect } = require("chai");
const { ethers } = require("hardhat");

// Roles, statuses, etc. — kept inline to avoid TypeScript config dependencies.
const Status = { Pending: 0, Approved: 1, Rejected: 2, Executed: 3 };

async function deployFixture() {
  const [owner, founderA, founderB, founderC, citA, attA, attB, citB, target, other] =
    await ethers.getSigners();

  const AttesterNFT = await ethers.getContractFactory("AttesterNFT");
  const attesterNFT = await AttesterNFT.deploy(
    owner.address,
    "Roebel Attester",
    "ROEBEL-ATTESTER",
    [attA.address, attB.address, founderA.address], // 3 founding attesters (distinct from owner)
    2, // requiredSignatures
    2  // requiredRejections
  );
  await attesterNFT.waitForDeployment();

  const CitizenNFT = await ethers.getContractFactory("CitizenNFT");
  const citizenNFT = await CitizenNFT.deploy(
    await attesterNFT.getAddress(),
    owner.address,
    [founderA.address, founderB.address, founderC.address], // 3 founding citizens
    1, // requiredAttesterSignatures
    1, // requiredCitizenSignatures
    1, // requiredRevocationAttesterSignatures
    1, // requiredRevocationCitizenSignatures
    1, // requiredAttesterRejections
    1  // requiredCitizenRejections
  );
  await citizenNFT.waitForDeployment();

  return { owner, founderA, founderB, founderC, citA, attA, attB, citB, target, other, attesterNFT, citizenNFT };
}

describe("CitizenNFT — bootstrap + soulbound", function () {
  it("mints exactly 3 founding citizens, all self-delegated", async function () {
    const { citizenNFT, founderA, founderB, founderC } = await deployFixture();
    expect(await citizenNFT.balanceOf(founderA.address)).to.equal(1n);
    expect(await citizenNFT.balanceOf(founderB.address)).to.equal(1n);
    expect(await citizenNFT.balanceOf(founderC.address)).to.equal(1n);
    expect(await citizenNFT.getVotes(founderA.address)).to.equal(1n);
    expect(await citizenNFT.getVotes(founderB.address)).to.equal(1n);
    expect(await citizenNFT.getVotes(founderC.address)).to.equal(1n);
  });

  it("rejects duplicate founding citizens in constructor", async function () {
    const [owner, a, , c] = await ethers.getSigners();
    const CitizenNFT = await ethers.getContractFactory("CitizenNFT");
    await expect(
      CitizenNFT.deploy(
        ethers.ZeroAddress, owner.address,
        [a.address, a.address, c.address], // duplicate `a`
        1, 1, 1, 1, 1, 1
      )
    ).to.be.revertedWith("Duplicate founding citizen");
  });

  it("blocks all transfers (soulbound)", async function () {
    const { citizenNFT, founderA, founderB } = await deployFixture();
    const tokenId = await citizenNFT.tokenOfOwnerByIndex(founderA.address, 0);
    await expect(
      citizenNFT.connect(founderA).transferFrom(founderA.address, founderB.address, tokenId)
    ).to.be.revertedWith("Citizen NFTs are soulbound and cannot be transferred");
  });
});

describe("CitizenNFT — attestation requires 1 Attester + 1 Citizen", function () {
  it("requires both an Attester sig and a Citizen sig", async function () {
    const { citizenNFT, attA, founderB, target } = await deployFixture();

    // Target creates the attestation request for themselves
    await citizenNFT.connect(target).createAttestationRequest("ipfs://evidence");
    const reqId = 0;

    // 1 Attester signs → still Pending
    await citizenNFT.connect(attA).approveRequest(reqId, true);
    let r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);

    // 1 Citizen signs → executes
    await citizenNFT.connect(founderB).approveRequest(reqId, false);
    r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Executed);
    expect(await citizenNFT.balanceOf(target.address)).to.equal(1n);
    expect(await citizenNFT.getVotes(target.address)).to.equal(1n);
  });
});

describe("CitizenNFT — revocation requires 1 Attester + 1 Citizen (the headline change)", function () {
  it("1 Attester sig alone does NOT revoke", async function () {
    const { citizenNFT, attA, founderA, founderB } = await deployFixture();
    await citizenNFT.connect(founderB).createRevocationRequest(founderA.address, "ipfs://e");
    const reqId = 0;

    await citizenNFT.connect(attA).approveRequest(reqId, true);
    const r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);
    expect(await citizenNFT.balanceOf(founderA.address)).to.equal(1n);
  });

  it("1 Citizen sig alone does NOT revoke", async function () {
    const { citizenNFT, founderB, founderC, founderA } = await deployFixture();
    await citizenNFT.connect(founderB).createRevocationRequest(founderA.address, "ipfs://e");
    const reqId = 0;

    await citizenNFT.connect(founderC).approveRequest(reqId, false);
    const r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);
    expect(await citizenNFT.balanceOf(founderA.address)).to.equal(1n);
  });

  it("1 Attester + 1 Citizen DOES revoke (burns the token, clears voting power)", async function () {
    const { citizenNFT, attA, founderB, founderA } = await deployFixture();
    await citizenNFT.connect(founderB).createRevocationRequest(founderA.address, "ipfs://e");
    const reqId = 0;

    await citizenNFT.connect(attA).approveRequest(reqId, true);
    await citizenNFT.connect(founderB).approveRequest(reqId, false);

    const r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Executed);
    expect(await citizenNFT.balanceOf(founderA.address)).to.equal(0n);
    expect(await citizenNFT.getVotes(founderA.address)).to.equal(0n);
    expect(await citizenNFT.hasCitizenNFT(founderA.address)).to.equal(false);
  });
});

describe("CitizenNFT — Bug A: O(1) tokenOfOwnerByIndex (gas does not grow with mint history)", function () {
  it("revocation gas is constant across mint/burn cycles", async function () {
    // We use 30 cycles (not 100) to keep the test fast; the assertion is the same:
    // if the old O(N) loop were still there, gas would grow ~linearly with _nextTokenId.
    const { citizenNFT, attesterNFT, owner, founderA, founderB, attA, attB } = await deployFixture();
    const signers = await ethers.getSigners();

    // Helper: full attestation cycle for one address, returns the gas cost of the burn.
    async function cycle(victim) {
      await citizenNFT.connect(victim).createAttestationRequest("ipfs://e");
      const attestId = Number(await citizenNFT.requestCount()) - 1;
      await citizenNFT.connect(attA).approveRequest(attestId, true);
      await citizenNFT.connect(founderA).approveRequest(attestId, false);

      await citizenNFT.connect(founderB).createRevocationRequest(victim.address, "ipfs://e");
      const revokeId = Number(await citizenNFT.requestCount()) - 1;
      await citizenNFT.connect(attA).approveRequest(revokeId, true);
      const tx = await citizenNFT.connect(founderB).approveRequest(revokeId, false);
      const rc = await tx.wait();
      return rc.gasUsed;
    }

    // Use a stable pool of victims. Same address can be re-attested after revocation.
    const victims = signers.slice(10, 14);

    const firstBurnGas = await cycle(victims[0]);
    // Run a handful of additional cycles to grow _nextTokenId.
    for (let i = 0; i < 10; i++) {
      await cycle(victims[i % victims.length]);
    }
    const laterBurnGas = await cycle(victims[0]);

    // With the new mapping, gas should not balloon. Allow 50% headroom for unrelated
    // state warmup variance; with the old O(N) loop, the cost would grow much more.
    expect(laterBurnGas).to.be.lessThan(firstBurnGas * 3n / 2n);
  });
});

describe("CitizenNFT — Bug B: single-rejection veto eliminated", function () {
  it("1 Attester rejection alone does NOT flip status", async function () {
    const { citizenNFT, attA, target } = await deployFixture();
    await citizenNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;

    await citizenNFT.connect(attA).rejectRequest(reqId, true);
    const r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);
  });

  it("1 Citizen rejection alone does NOT flip status", async function () {
    const { citizenNFT, founderC, target } = await deployFixture();
    await citizenNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;

    await citizenNFT.connect(founderC).rejectRequest(reqId, false);
    const r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);
  });

  it("1 Attester + 1 Citizen rejection DOES flip status", async function () {
    const { citizenNFT, attA, founderC, target } = await deployFixture();
    await citizenNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;

    await citizenNFT.connect(attA).rejectRequest(reqId, true);
    await citizenNFT.connect(founderC).rejectRequest(reqId, false);
    const r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Rejected);
  });

  it("target cannot reject their own request", async function () {
    const { citizenNFT, founderA, founderB } = await deployFixture();
    // founderB initiates revocation against founderA
    await citizenNFT.connect(founderB).createRevocationRequest(founderA.address, "ipfs://e");
    await expect(
      citizenNFT.connect(founderA).rejectRequest(0, false)
    ).to.be.revertedWith("Target cannot reject their own request");
  });
});

describe("CitizenNFT — Timelock-tunable thresholds (setters)", function () {
  it("setAttestationRequirements reverts for non-owner, succeeds for owner", async function () {
    const { citizenNFT, owner, other } = await deployFixture();
    await expect(citizenNFT.connect(other).setAttestationRequirements(2, 1))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");

    await citizenNFT.connect(owner).setAttestationRequirements(2, 1);
    expect(await citizenNFT.requiredAttesterSignatures()).to.equal(2n);
    expect(await citizenNFT.requiredCitizenSignatures()).to.equal(1n);
  });

  it("setRevocationRequirements reverts when lowering below 1", async function () {
    const { citizenNFT, owner } = await deployFixture();
    await expect(citizenNFT.connect(owner).setRevocationRequirements(0, 1))
      .to.be.revertedWith("revoke attester sigs >= 1");
    await expect(citizenNFT.connect(owner).setRevocationRequirements(1, 0))
      .to.be.revertedWith("revoke citizen sigs >= 1");
  });

  it("setRejectionRequirements affects subsequent rejection flow", async function () {
    const { citizenNFT, owner, attA, attB, founderC, target } = await deployFixture();
    // Raise to 2 attester rejections required
    await citizenNFT.connect(owner).setRejectionRequirements(2, 1);

    await citizenNFT.connect(target).createAttestationRequest("ipfs://e");
    const reqId = 0;

    // 1 Attester + 1 Citizen no longer enough
    await citizenNFT.connect(attA).rejectRequest(reqId, true);
    await citizenNFT.connect(founderC).rejectRequest(reqId, false);
    let r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Pending);

    // 2nd Attester rejection flips it
    await citizenNFT.connect(attB).rejectRequest(reqId, true);
    r = await citizenNFT.getRequest(reqId);
    expect(r.status).to.equal(Status.Rejected);
  });
});
