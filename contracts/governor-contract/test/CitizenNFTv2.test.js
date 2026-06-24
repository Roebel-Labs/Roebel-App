const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const Status = { Pending: 0, Approved: 1, Rejected: 2, Executed: 3 };
const Source = { AttesterMultisig: 0, SelfPersonhood: 1 };
const NO_CAP = 65535;
const YEAR = 365 * 24 * 60 * 60;

// Default production-shaped thresholds.
const THRESHOLDS = [
  [3000, 2, 7],       // attestationAttester: 30%, floor 2, cap 7
  [0, 1, 1],          // attestationCitizen: fixed 1
  [6700, 3, NO_CAP],  // revocationAttester: 67%, floor 3, no cap
  [0, 1, 1],          // revocationCitizen: fixed 1
  [2500, 2, 5],       // rejectionAttester: 25%, floor 2, cap 5
  [2500, 2, 5],       // rejectionCitizen: 25%, floor 2, cap 5
];

// attA is BOTH an attester and a citizen (mirrors Gnosis: attesters ⊂ citizens).
async function deploy(thresholds = THRESHOLDS, validityPeriod = 0) {
  const signers = await ethers.getSigners();
  const [owner, attA, attB, attC, citB, citC, target, other] = signers;

  const AttesterNFTv2 = await ethers.getContractFactory("AttesterNFTv2");
  const attesterNFT = await AttesterNFTv2.deploy(
    owner.address, "Roebel Attester", "ROEBEL-ATTESTER",
    [attA.address, attB.address, attC.address],
    [5000, 3, 7], [5000, 3, 7]
  );
  await attesterNFT.waitForDeployment();

  const CitizenNFTv2 = await ethers.getContractFactory("CitizenNFTv2");
  const citizenNFT = await CitizenNFTv2.deploy(
    await attesterNFT.getAddress(), owner.address,
    [attA.address, citB.address, citC.address], // attA = dual holder
    thresholds, validityPeriod
  );
  await citizenNFT.waitForDeployment();

  return { signers, owner, attA, attB, attC, citB, citC, target, other, attesterNFT, citizenNFT };
}

describe("CitizenNFTv2 — bootstrap + counter + dual holder", function () {
  it("mints 3 founders, sets citizenCount=3, self-delegates", async function () {
    const { citizenNFT, attA, citB, citC } = await deploy();
    expect(await citizenNFT.citizenCount()).to.equal(3n);
    expect(await citizenNFT.getVotes(citB.address)).to.equal(1n);
    expect(await citizenNFT.hasCitizenNFT(attA.address)).to.equal(true);
  });

  it("records attestationSource = AttesterMultisig for founders", async function () {
    const { citizenNFT, citB } = await deploy();
    expect(await citizenNFT.attestationSource(citB.address)).to.equal(Source.AttesterMultisig);
  });

  it("is soulbound", async function () {
    const { citizenNFT, citB, other } = await deploy();
    const id = await citizenNFT.tokenOfOwnerByIndex(citB.address, 0);
    await expect(
      citizenNFT.connect(citB).transferFrom(citB.address, other.address, id)
    ).to.be.revertedWith("Citizen NFTs are soulbound and cannot be transferred");
  });
});

describe("CitizenNFTv2 — join needs %-attesters + fixed-1 citizen (snapshot)", function () {
  it("at 3 attesters: 2 attester sigs + 1 citizen sig executes; citizenCount++", async function () {
    const { citizenNFT, attA, attB, citB, target } = await deploy();
    await citizenNFT.connect(target).createAttestationRequest("commit:0xabc");
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(2n); // ceil(30% of 3)=1 -> floor 2
    expect(await citizenNFT.requiredCitizenApprovalsFor(0)).to.equal(1n);

    await citizenNFT.connect(attA).approveRequest(0, true);  // attester
    await citizenNFT.connect(attB).approveRequest(0, true);  // attester (2/2)
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending); // citizen still 0
    await citizenNFT.connect(citB).approveRequest(0, false); // citizen (1/1) -> execute
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
    expect(await citizenNFT.balanceOf(target.address)).to.equal(1n);
    expect(await citizenNFT.citizenCount()).to.equal(4n);
  });

  it("attester-side requirement scales with attesterNFT.attesterCount()", async function () {
    const { citizenNFT, attesterNFT, signers, target } = await deploy();
    // grow attester set to ~13 via migrationMint
    await attesterNFT.migrationMint(signers.slice(8, 18).map((s) => s.address));
    const count = Number(await attesterNFT.attesterCount());
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    const expected = Math.min(7, Math.max(2, Math.ceil((count * 30) / 100)));
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(BigInt(expected));
  });
});

describe("CitizenNFTv2 — no-double-sign invariant (dual holder cannot fill both halves)", function () {
  it("a wallet holding BOTH NFTs counts for only one role per request", async function () {
    // 1+1 thresholds make the attack surface obvious.
    const t = [...THRESHOLDS];
    t[0] = [0, 1, 1]; // attestationAttester fixed 1
    const { citizenNFT, attA, citB, target } = await deploy(t);

    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    // attA is attester AND citizen. Signs once as attester.
    await citizenNFT.connect(attA).approveRequest(0, true);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending); // citizen side still 0

    // attA cannot sign again to fill the citizen slot.
    await expect(citizenNFT.connect(attA).approveRequest(0, false)).to.be.revertedWith("Already approved");

    // A genuinely separate citizen is required to complete it.
    await citizenNFT.connect(citB).approveRequest(0, false);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
  });

  it("must hold the role you sign as", async function () {
    const { citizenNFT, citB, target } = await deploy();
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    // citB is a citizen-only holder; cannot sign as attester.
    await expect(citizenNFT.connect(citB).approveRequest(0, true))
      .to.be.revertedWith("Must have Attester NFT to sign as Attester");
  });
});

describe("CitizenNFTv2 — revocation: attester supermajority + 1 citizen", function () {
  it("needs floor-3 attesters + 1 citizen at small scale", async function () {
    const { citizenNFT, attA, attB, attC, citB, citC } = await deploy();
    // citB initiates revocation of citC
    await citizenNFT.connect(citB).createRevocationRequest(citC.address, "reason");
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(3n); // ceil(67% of 3)=3, floor 3
    expect(await citizenNFT.requiredCitizenApprovalsFor(0)).to.equal(1n);

    await citizenNFT.connect(attA).approveRequest(0, true);
    await citizenNFT.connect(attB).approveRequest(0, true);
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending); // only 2 attesters
    await citizenNFT.connect(attC).approveRequest(0, true); // 3 attesters
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Pending); // citizen side 0
    await citizenNFT.connect(citB).approveRequest(0, false); // 1 citizen -> execute
    expect((await citizenNFT.getRequest(0)).status).to.equal(Status.Executed);
    expect(await citizenNFT.hasCitizenNFT(citC.address)).to.equal(false);
    expect(await citizenNFT.citizenCount()).to.equal(2n);
  });
});

describe("CitizenNFTv2 — re-attestation / validUntil dormancy", function () {
  it("period 0 = no expiry: always active", async function () {
    const { citizenNFT, citB } = await deploy(THRESHOLDS, 0);
    expect(await citizenNFT.isActive(citB.address)).to.equal(true);
    expect(await citizenNFT.validUntil(citB.address)).to.equal(0n);
  });

  it("with a period, a citizen goes dormant after validUntil and renewSelf revives", async function () {
    const { citizenNFT, citB } = await deploy(THRESHOLDS, YEAR);
    expect(await citizenNFT.isActive(citB.address)).to.equal(true);

    await time.increase(YEAR + 1);
    expect(await citizenNFT.isActive(citB.address)).to.equal(false); // dormant, NOT burned
    expect(await citizenNFT.hasCitizenNFT(citB.address)).to.equal(true);

    await citizenNFT.connect(citB).renewSelf();
    expect(await citizenNFT.isActive(citB.address)).to.equal(true);
  });

  it("renewByVouch lets one other citizen revive an offline citizen", async function () {
    const { citizenNFT, citB, citC } = await deploy(THRESHOLDS, YEAR);
    await time.increase(YEAR + 1);
    expect(await citizenNFT.isActive(citB.address)).to.equal(false);
    await citizenNFT.connect(citC).renewByVouch(citB.address);
    expect(await citizenNFT.isActive(citB.address)).to.equal(true);
  });

  it("renewByVouch cannot be self and requires both to be citizens", async function () {
    const { citizenNFT, citB, other } = await deploy(THRESHOLDS, YEAR);
    await expect(citizenNFT.connect(citB).renewByVouch(citB.address)).to.be.revertedWith("Cannot vouch for self");
    await expect(citizenNFT.connect(other).renewByVouch(citB.address)).to.be.revertedWith("Only Citizens can vouch");
  });
});

describe("CitizenNFTv2 — governance setters", function () {
  it("setAttestationBands is owner-only and takes effect on new requests", async function () {
    const { citizenNFT, owner, other, target } = await deploy();
    await expect(citizenNFT.connect(other).setAttestationBands([5000, 2, 9], [0, 2, 2]))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await citizenNFT.connect(owner).setAttestationBands([0, 1, 1], [0, 2, 2]);
    await citizenNFT.connect(target).createAttestationRequest("commit:0x1");
    expect(await citizenNFT.requiredAttesterApprovalsFor(0)).to.equal(1n);
    expect(await citizenNFT.requiredCitizenApprovalsFor(0)).to.equal(2n);
  });

  it("setValidityPeriod is owner-only", async function () {
    const { citizenNFT, owner, other } = await deploy();
    await expect(citizenNFT.connect(other).setValidityPeriod(YEAR))
      .to.be.revertedWithCustomError(citizenNFT, "OwnableUnauthorizedAccount");
    await citizenNFT.connect(owner).setValidityPeriod(YEAR);
    expect(await citizenNFT.attestationValidityPeriod()).to.equal(BigInt(YEAR));
  });
});

describe("CitizenNFTv2 — migration", function () {
  it("migrationMint adds citizens, bumps counter, sets source + validUntil; finalize disables", async function () {
    const { citizenNFT, signers } = await deploy(THRESHOLDS, YEAR);
    const newOnes = [signers[8].address, signers[9].address];
    await citizenNFT.migrationMint(newOnes);
    expect(await citizenNFT.citizenCount()).to.equal(5n);
    expect(await citizenNFT.hasCitizenNFT(signers[8].address)).to.equal(true);
    expect(await citizenNFT.isActive(signers[8].address)).to.equal(true);
    expect(await citizenNFT.attestationSource(signers[8].address)).to.equal(Source.AttesterMultisig);
    await citizenNFT.finalizeMigration();
    await expect(citizenNFT.migrationMint([signers[10].address])).to.be.revertedWith("Migration finalized");
  });
});
