const { expect } = require("chai");
const { ethers } = require("hardhat");

// NSP-14 canonical id: keccak256("netizen:org:v1:" + lowercase uuid).
const orgId = (uuid) => ethers.id(`netizen:org:v1:${uuid.toLowerCase()}`);
const ORG_A = orgId("6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10");
const ORG_B = orgId("0b9e4c55-7a1f-4e3a-8d2c-5a6b7c8d9e0f");
const PUB_1 = "0x" + "11".repeat(32);
const PUB_2 = "0x" + "22".repeat(32);

const Role = { None: 0n, Member: 1n, Admin: 2n };
const Status = { Pending: 0n, Rejected: 1n, Executed: 2n };

// approval 50%/floor2/cap5, rejection 25%/floor2/cap5, revocation 67%/floor3/no cap
const band = (percentBps, floor, cap) => ({ percentBps, floor, cap });
const APPROVAL = band(5000, 2, 5);
const REJECTION = band(2500, 2, 5);
const REVOCATION = band(6700, 3, 65535);

async function deploy() {
  const [deployer, a1, a2, a3, a4, orgOwner, orgOwner2, member, stranger] = await ethers.getSigners();
  const attesters = await (await ethers.getContractFactory("MockAttesterSet")).deploy();
  for (const a of [a1, a2, a3, a4]) await attesters.set(a.address, true);

  const registry = await (await ethers.getContractFactory("OrgRegistry")).deploy(
    deployer.address,
    await attesters.getAddress(),
    APPROVAL,
    REJECTION,
    REVOCATION,
  );
  const Safe = await ethers.getContractFactory("MockSafe");
  const safe = await Safe.deploy([orgOwner.address, orgOwner2.address]);
  const safe2 = await Safe.deploy([orgOwner.address]);
  return { registry, attesters, safe, safe2, deployer, a1, a2, a3, a4, orgOwner, orgOwner2, member, stranger };
}

/** Execute a registry call as the Safe (the Safe is msg.sender). */
async function asSafe(safe, signer, registry, fn, args) {
  const data = registry.interface.encodeFunctionData(fn, args);
  return safe.connect(signer).exec(await registry.getAddress(), data);
}

async function registered() {
  const ctx = await deploy();
  const { registry, safe, orgOwner, a1, a2 } = ctx;
  await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, "ipfs://meta"]);
  await registry.connect(a1).approveRequest(0);
  await registry.connect(a2).approveRequest(0);
  return ctx;
}

describe("OrgRegistry — registration", function () {
  it("a Safe requests, attesters approve, the Safe holds the soulbound OrgNFT", async function () {
    const { registry, safe, orgOwner, a1, a2 } = await deploy();
    await expect(asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, "ipfs://meta"]))
      .to.emit(registry, "RegistrationRequested")
      .withArgs(0, ORG_A, await safe.getAddress(), "ipfs://meta");

    expect((await registry.getRequest(0)).requiredApprovals).to.equal(2n); // ceil(4 * 50%)

    await registry.connect(a1).approveRequest(0);
    expect(await registry.isRegistered(ORG_A)).to.equal(false);
    await expect(registry.connect(a2).approveRequest(0))
      .to.emit(registry, "OrgRegistered")
      .withArgs(ORG_A, await safe.getAddress(), 0)
      .and.to.emit(registry, "MetadataURIChanged")
      .withArgs(ORG_A, "ipfs://meta");

    expect(await registry.ownerOf(BigInt(ORG_A))).to.equal(await safe.getAddress());
    expect(await registry.orgIdOfSafe(await safe.getAddress())).to.equal(ORG_A);
    expect(await registry.orgCount()).to.equal(1n);
    expect((await registry.getOrg(ORG_A)).metadataURI).to.equal("ipfs://meta");
    expect((await registry.getRequest(0)).status).to.equal(Status.Executed);
  });

  it("rejects EOAs — an org must be a contract account", async function () {
    const { registry, stranger } = await deploy();
    await expect(registry.connect(stranger).requestRegistration(ORG_A, ""))
      .to.be.revertedWithCustomError(registry, "NotContract");
  });

  it("only attesters vote, once each", async function () {
    const { registry, safe, orgOwner, a1, stranger } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(registry.connect(stranger).approveRequest(0)).to.be.revertedWithCustomError(registry, "NotAttester");
    await registry.connect(a1).approveRequest(0);
    await expect(registry.connect(a1).approveRequest(0)).to.be.revertedWithCustomError(registry, "AlreadyVoted");
    await expect(registry.connect(a1).rejectRequest(0)).to.be.revertedWithCustomError(registry, "AlreadyVoted");
  });

  it("an attester who co-owns the Safe cannot approve it", async function () {
    const { registry, attesters, safe, orgOwner } = await deploy();
    await attesters.set(orgOwner.address, true);
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(registry.connect(orgOwner).approveRequest(0)).to.be.revertedWithCustomError(registry, "SelfApproval");
  });

  it("rejection threshold closes the request and frees the id", async function () {
    const { registry, safe, orgOwner, a1, a2, a3 } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await registry.connect(a1).rejectRequest(0);
    await registry.connect(a2).rejectRequest(0);
    expect((await registry.getRequest(0)).status).to.equal(Status.Rejected);
    await expect(registry.connect(a3).approveRequest(0)).to.be.revertedWithCustomError(registry, "NotPending");
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    expect((await registry.openRequestOf(ORG_A)).requestId).to.equal(1n);
  });

  it("one open request per id; one org per Safe; ids are unique", async function () {
    const { registry, safe, safe2, orgOwner, a1, a2 } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(asSafe(safe2, orgOwner, registry, "requestRegistration", [ORG_A, ""]))
      .to.be.revertedWithCustomError(registry, "RequestOpen");
    await registry.connect(a1).approveRequest(0);
    await registry.connect(a2).approveRequest(0);
    await expect(asSafe(safe2, orgOwner, registry, "requestRegistration", [ORG_A, ""]))
      .to.be.revertedWithCustomError(registry, "OrgExists");
    await expect(asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_B, ""]))
      .to.be.revertedWithCustomError(registry, "SafeInUse");
  });

  it("the Safe may withdraw its pending request; nobody else may", async function () {
    const { registry, safe, safe2, orgOwner } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(asSafe(safe2, orgOwner, registry, "withdrawRequest", [0]))
      .to.be.revertedWithCustomError(registry, "NotOrgSafe");
    await expect(asSafe(safe, orgOwner, registry, "withdrawRequest", [0])).to.emit(registry, "RequestWithdrawn");
    expect((await registry.openRequestOf(ORG_A)).open).to.equal(false);
  });

  it("a request whose Safe got claimed meanwhile closes instead of bricking the id", async function () {
    const { registry, safe, orgOwner, a1, a2, deployer } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await registry.connect(deployer).migrationRegister([ORG_B], [await safe.getAddress()], [""], [ethers.ZeroHash]);
    await registry.connect(a1).approveRequest(0);
    await registry.connect(a2).approveRequest(0); // must not revert
    expect((await registry.getRequest(0)).status).to.equal(Status.Rejected);
    expect(await registry.isRegistered(ORG_A)).to.equal(false);
  });
});

describe("OrgRegistry — self-sovereign record", function () {
  it("the Safe authorises and revokes Nostr keys individually", async function () {
    const { registry, safe, orgOwner } = await registered();
    await expect(asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_1, true]))
      .to.emit(registry, "NostrKeySet").withArgs(ORG_A, PUB_1, true);
    await asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_2, true]);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(true);
    await asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_1, false]);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(false);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_2)).to.equal(true);
    await expect(asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, ethers.ZeroHash, true]))
      .to.be.revertedWithCustomError(registry, "ZeroPubkey");
  });

  it("roles and metadata: the Safe only — not even the registry owner", async function () {
    const { registry, safe, orgOwner, member, deployer, stranger } = await registered();
    await asSafe(safe, orgOwner, registry, "setRole", [ORG_A, member.address, Role.Admin]);
    expect(await registry.roleOf(ORG_A, member.address)).to.equal(Role.Admin);
    await asSafe(safe, orgOwner, registry, "setMetadataURI", [ORG_A, "ipfs://v2"]);
    expect((await registry.getOrg(ORG_A)).metadataURI).to.equal("ipfs://v2");

    for (const who of [deployer, stranger]) {
      await expect(registry.connect(who).setRole(ORG_A, who.address, Role.Admin))
        .to.be.revertedWithCustomError(registry, "NotOrgSafe");
      await expect(registry.connect(who).setNostrKey(ORG_A, PUB_1, true))
        .to.be.revertedWithCustomError(registry, "NotOrgSafe");
    }
  });

  it("owners are read live from the Safe", async function () {
    const { registry, orgOwner, orgOwner2, member } = await registered();
    expect(await registry.isOrgOwner(ORG_A, orgOwner.address)).to.equal(true);
    expect(await registry.isOrgOwner(ORG_A, orgOwner2.address)).to.equal(true);
    expect(await registry.isOrgOwner(ORG_A, member.address)).to.equal(false);
  });

  it("the NFT is soulbound except through rotateSafe, which carries keys and roles", async function () {
    const { registry, safe, safe2, orgOwner, member } = await registered();
    await asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_1, true]);
    await asSafe(safe, orgOwner, registry, "setRole", [ORG_A, member.address, Role.Member]);

    const from = await safe.getAddress();
    const to = await safe2.getAddress();
    await expect(asSafe(safe, orgOwner, registry, "transferFrom", [from, to, BigInt(ORG_A)]))
      .to.be.revertedWithCustomError(registry, "Soulbound");

    await expect(asSafe(safe, orgOwner, registry, "rotateSafe", [ORG_A, to]))
      .to.emit(registry, "SafeRotated").withArgs(ORG_A, from, to);
    expect(await registry.ownerOf(BigInt(ORG_A))).to.equal(to);
    expect(await registry.orgIdOfSafe(from)).to.equal(ethers.ZeroHash);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(true);
    expect(await registry.roleOf(ORG_A, member.address)).to.equal(Role.Member);
    await expect(asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_2, true]))
      .to.be.revertedWithCustomError(registry, "NotOrgSafe");
  });
});

describe("OrgRegistry — revocation", function () {
  it("attesters revoke at the revocation band; keys and roles never resurface", async function () {
    const { registry, safe, orgOwner, member, a1, a2, a3, stranger } = await registered();
    await asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_1, true]);
    await asSafe(safe, orgOwner, registry, "setRole", [ORG_A, member.address, Role.Admin]);

    await expect(registry.connect(stranger).requestRevocation(ORG_A, "ipfs://why"))
      .to.be.revertedWithCustomError(registry, "NotAttester");
    await registry.connect(a1).requestRevocation(ORG_A, "ipfs://why");
    expect((await registry.getRequest(1)).requiredApprovals).to.equal(3n); // ceil(4 * 67%)
    await registry.connect(a1).approveRequest(1);
    await registry.connect(a2).approveRequest(1);
    await expect(registry.connect(a3).approveRequest(1)).to.emit(registry, "OrgRevoked");

    expect(await registry.isRegistered(ORG_A)).to.equal(false);
    expect(await registry.orgCount()).to.equal(0n);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(false);
    expect(await registry.roleOf(ORG_A, member.address)).to.equal(Role.None);

    // re-registration starts from a clean generation
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await registry.connect(a1).approveRequest(2);
    await registry.connect(a2).approveRequest(2);
    expect(await registry.isRegistered(ORG_A)).to.equal(true);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(false);
    expect(await registry.roleOf(ORG_A, member.address)).to.equal(Role.None);
  });
});

describe("OrgRegistry — bootstrap", function () {
  it("owner migrates existing orgs (optionally with the node's key), then closes migration", async function () {
    const { registry, safe, safe2, deployer, stranger } = await deploy();
    const safes = [await safe.getAddress(), await safe2.getAddress()];
    await expect(registry.connect(stranger).migrationRegister([ORG_A], [safes[0]], [""], [PUB_1]))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

    await registry.connect(deployer).migrationRegister([ORG_A, ORG_B], safes, ["a", "b"], [PUB_1, ethers.ZeroHash]);
    expect(await registry.orgCount()).to.equal(2n);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(true);
    expect(await registry.ownerOf(BigInt(ORG_B))).to.equal(safes[1]);

    await registry.connect(deployer).finalizeMigration();
    await expect(registry.connect(deployer).migrationRegister([orgId("x")], [safes[0]], [""], [ethers.ZeroHash]))
      .to.be.revertedWithCustomError(registry, "MigrationClosed");
  });

  it("owner cannot migrate onto an EOA", async function () {
    const { registry, deployer, stranger } = await deploy();
    await expect(registry.connect(deployer).migrationRegister([ORG_A], [stranger.address], [""], [ethers.ZeroHash]))
      .to.be.revertedWithCustomError(registry, "NotContract");
  });

  it("owner tunes bands; bad bands are refused", async function () {
    const { registry, deployer } = await deploy();
    await registry.connect(deployer).setBands(band(3000, 1, 3), REJECTION, REVOCATION);
    expect((await registry.approvalBand()).floor).to.equal(1n);
    await expect(registry.connect(deployer).setBands(band(3000, 0, 3), REJECTION, REVOCATION))
      .to.be.revertedWith("floor >= 1");
  });
});
