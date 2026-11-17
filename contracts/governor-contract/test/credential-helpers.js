const { ethers } = require("hardhat");

// NSP-14 canonical id: keccak256("netizen:org:v1:" + lowercase uuid).
const orgIdOf = (uuid) => ethers.id(`netizen:org:v1:${uuid.toLowerCase()}`);
const ORG_A = orgIdOf("6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10");
const ORG_B = orgIdOf("0b9e4c55-7a1f-4e3a-8d2c-5a6b7c8d9e0f");
const COMMUNITY = ethers.ZeroHash;

const CITIZEN_TYPE = "0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3";
const ATTESTER_TYPE = "0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d";
const GUEST_TYPE = "0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7";
const RESERVED_URIS = ["https://x/citizen.json", "https://x/attester.json", "https://x/guest.json"];

const Kind = { Role: 0n, Membership: 1n, Badge: 2n };
const Policy = { IssuerBatch: 0n, SelfClaim: 1n, External: 2n };
const OrgRole = { None: 0, Member: 1, Admin: 2 };
const DAY = 24 * 60 * 60;

// Bands as in OrgRegistry.test.js: approval 50%/floor2/cap5, rejection 25%/floor2/cap5, revocation 67%/floor3/no cap.
const band = (percentBps, floor, cap) => ({ percentBps, floor, cap });
const APPROVAL = band(5000, 2, 5);
const REJECTION = band(2500, 2, 5);
const REVOCATION = band(6700, 3, 65535);

const LOCAL = (n) => ethers.id(`netizen:credential-type:v1:${n}`);
const typeId = (orgId, localId) =>
  ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [orgId, localId]));

/** A TypeConfig with test defaults. */
function cfg(overrides = {}) {
  return {
    metadataURI: "https://x/meta.json",
    defaultValidity: 0n,
    claimStart: 0n,
    claimEnd: 0n,
    supplyCap: 0n,
    publicClaim: true,
    ...overrides,
  };
}

/** Execute a call on `target` as the Safe (the Safe is msg.sender). */
async function asSafe(safe, signer, target, fn, args) {
  const data = target.interface.encodeFunctionData(fn, args);
  return safe.connect(signer).exec(await target.getAddress(), data);
}

/** Register `orgId` to `safe` through the real request/approve flow (two attesters approve). */
async function registerOrg(ctx, orgId, safe, metadataURI = "") {
  const { orgs, orgOwner, a1, a2 } = ctx;
  await asSafe(safe, orgOwner, orgs, "requestRegistration", [orgId, metadataURI]);
  const [, requestId] = await orgs.openRegistrationOf(await safe.getAddress());
  await orgs.connect(a1).approveRequest(requestId);
  await orgs.connect(a2).approveRequest(requestId);
}

/** Three attesters approve a revocation of `orgId`. */
async function revokeOrg(ctx, orgId) {
  const { orgs, a1, a2, a3 } = ctx;
  await orgs.connect(a1).requestRevocation(orgId, "");
  const [, requestId] = await orgs.openRevocationOf(orgId);
  await orgs.connect(a1).approveRequest(requestId);
  await orgs.connect(a2).approveRequest(requestId);
  await orgs.connect(a3).approveRequest(requestId);
}

/** Register a revoked `orgId` again (the generation has moved on). */
async function reRegisterOrg(ctx, orgId, safe) {
  await registerOrg(ctx, orgId, safe);
}

async function deployRegister() {
  const [owner, a1, a2, a3, a4, orgOwner, orgOwner2, admin, delegate, alice, bob, stranger, member] =
    await ethers.getSigners();

  const identity = await (await ethers.getContractFactory("CredMockIdentity")).deploy();
  for (const a of [a1, a2, a3, a4]) await identity.setAttester(a.address, true);

  const orgs = await (await ethers.getContractFactory("OrgRegistry")).deploy(
    owner.address,
    await identity.getAddress(),
    APPROVAL,
    REJECTION,
    REVOCATION,
  );
  const Safe = await ethers.getContractFactory("OrgMockSafe");
  const safe = await Safe.deploy([orgOwner.address, orgOwner2.address]);
  const safe2 = await Safe.deploy([orgOwner.address]);

  const registry = await (await ethers.getContractFactory("CredentialRegistry")).deploy(
    owner.address,
    await identity.getAddress(),
    await identity.getAddress(),
    await orgs.getAddress(),
    RESERVED_URIS,
  );

  const ctx = {
    registry, orgs, identity, safe, safe2,
    owner, a1, a2, a3, a4, orgOwner, orgOwner2, admin, delegate, alice, bob, stranger, member,
  };
  await registerOrg(ctx, ORG_A, safe);
  await asSafe(safe, orgOwner, orgs, "setRole", [ORG_A, admin.address, OrgRole.Admin]);
  await asSafe(safe, orgOwner, orgs, "setRole", [ORG_A, member.address, OrgRole.Member]);
  return ctx;
}

module.exports = {
  ORG_A, ORG_B, COMMUNITY, CITIZEN_TYPE, ATTESTER_TYPE, GUEST_TYPE, RESERVED_URIS,
  Kind, Policy, OrgRole, DAY, APPROVAL, REJECTION, REVOCATION,
  orgIdOf, LOCAL, typeId, cfg, asSafe, registerOrg, revokeOrg, reRegisterOrg, deployRegister,
};
