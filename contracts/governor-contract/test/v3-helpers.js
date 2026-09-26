const { ethers } = require("hardhat");

const Status = { Pending: 0, Approved: 1, Rejected: 2, Executed: 3 };
const Source = { AttesterMultisig: 0, SelfPersonhood: 1 };
const NO_CAP = 65535;

// Production-shaped thresholds (identical to the live v2 set).
const ATTESTER_APPROVAL_BAND = [5000, 3, 7];
const ATTESTER_REJECTION_BAND = [5000, 3, 7];
const CITIZEN_THRESHOLDS = [
  [3000, 2, 7],      // attestationAttester: 30%, floor 2, cap 7
  [0, 1, 1],         // attestationCitizen: fixed 1
  [6700, 3, NO_CAP], // revocationAttester: 67%, floor 3, no cap
  [0, 1, 1],         // revocationCitizen: fixed 1
  [2500, 2, 5],      // rejectionAttester
  [2500, 2, 5],      // rejectionCitizen
];

/**
 * Deploys mock v2 contracts + AttesterNFTv3 + CitizenNFTv3 and bootstraps:
 *   attesters: attA, attB, attC      citizens: attA (dual), citB, citC
 * `owner` may be overridden with a contract address (e.g. a MockSafe).
 */
async function deployV3({ ownerAddress, citizenThresholds = CITIZEN_THRESHOLDS, bootstrap = true } = {}) {
  const signers = await ethers.getSigners();
  const [owner, attA, attB, attC, citB, citC, target, other] = signers;

  const Mock = await ethers.getContractFactory("MockV2Identity");
  const v2Att = await Mock.deploy();
  const v2Cit = await Mock.deploy();

  const ownerAddr = ownerAddress || owner.address;
  const AttesterNFTv3 = await ethers.getContractFactory("AttesterNFTv3");
  const attesterNFT = await AttesterNFTv3.deploy(
    ownerAddr, await v2Att.getAddress(), "Roebel Attester", "ROEBEL-ATTESTER",
    ATTESTER_APPROVAL_BAND, ATTESTER_REJECTION_BAND
  );
  const CitizenNFTv3 = await ethers.getContractFactory("CitizenNFTv3");
  const citizenNFT = await CitizenNFTv3.deploy(
    await attesterNFT.getAddress(), await v2Cit.getAddress(), ownerAddr, citizenThresholds
  );

  for (const a of [attA, attB, attC]) await v2Att.setHolder(a.address, true);
  for (const c of [attA, citB, citC]) await v2Cit.setHolder(c.address, true);
  if (bootstrap && !ownerAddress) {
    await attesterNFT.bootstrapFromV2([attA.address, attB.address, attC.address]);
    await citizenNFT.bootstrapFromV2([attA.address, citB.address, citC.address]);
  }

  return { signers, owner, attA, attB, attC, citB, citC, target, other, v2Att, v2Cit, attesterNFT, citizenNFT };
}

/** A legacy (thirdweb-like) account controlled by `controller`, plus a Safe-like account
 *  (also controlled by `controller`) that the legacy account has made its admin. */
async function legacyWithSafe(controller) {
  const Legacy = await ethers.getContractFactory("MockLegacyAccount");
  const legacy = await Legacy.deploy(controller.address);
  const Safe = await ethers.getContractFactory("MockSafe");
  const safe = await Safe.deploy(controller.address);
  await legacy.connect(controller).setAdmin(await safe.getAddress(), true);
  return { legacy, safe };
}

/** Safe → legacy.execute(target, 0, data): at `target`, msg.sender == legacy. */
async function viaSafeThroughLegacy(controller, safe, legacy, target, data) {
  const inner = legacy.interface.encodeFunctionData("execute", [target, 0, data]);
  return safe.connect(controller).exec(await legacy.getAddress(), inner);
}

/** Safe calls `target` directly: msg.sender == safe. */
async function viaSafe(controller, safe, target, data) {
  return safe.connect(controller).exec(target, data);
}

module.exports = {
  Status, Source, NO_CAP, CITIZEN_THRESHOLDS, ATTESTER_APPROVAL_BAND, ATTESTER_REJECTION_BAND,
  deployV3, legacyWithSafe, viaSafeThroughLegacy, viaSafe,
};
