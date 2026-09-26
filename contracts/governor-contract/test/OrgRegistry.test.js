const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// NSP-14 canonical id: keccak256("netizen:org:v1:" + lowercase uuid).
const orgId = (uuid) => ethers.id(`netizen:org:v1:${uuid.toLowerCase()}`);
const ORG_A = orgId("6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10");
const ORG_B = orgId("0b9e4c55-7a1f-4e3a-8d2c-5a6b7c8d9e0f");
const PUB_1 = "0x" + "11".repeat(32);
const PUB_2 = "0x" + "22".repeat(32);
const MIGRATION_ID = ethers.MaxUint256;
const DAY = 24 * 60 * 60;

const Role = { None: 0n, Member: 1n, Admin: 2n };
const Status = { Pending: 0n, Rejected: 1n, Executed: 2n };
const Close = { Approved: 0n, Rejected: 1n, Withdrawn: 2n, Expired: 3n, Superseded: 4n };

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
  const squatter = await Safe.deploy([stranger.address]);
  return { registry, attesters, safe, safe2, squatter, deployer, a1, a2, a3, a4, orgOwner, orgOwner2, member, stranger };
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
      .to.emit(registry, "RegistrationRequested");
    const req = await registry.getRequest(0);
    expect(req.requiredApprovals).to.equal(2n); // ceil(4 * 50%)
    expect(req.expiresAt - req.createdAt).to.equal(BigInt(30 * DAY));

    await registry.connect(a1).approveRequest(0);
    expect(await registry.isRegistered(ORG_A)).to.equal(false);
    await expect(registry.connect(a2).approveRequest(0))
      .to.emit(registry, "OrgRegistered").withArgs(ORG_A, await safe.getAddress(), 0, 0)
      .and.to.emit(registry, "MetadataURIChanged").withArgs(ORG_A, "ipfs://meta")
      .and.to.emit(registry, "RequestClosed").withArgs(0, Status.Executed, Close.Approved)
      .and.to.emit(registry, "Locked").withArgs(BigInt(ORG_A));

    expect(await registry.ownerOf(BigInt(ORG_A))).to.equal(await safe.getAddress());
    expect(await registry.orgIdOfSafe(await safe.getAddress())).to.equal(ORG_A);
    expect(await registry.orgCount()).to.equal(1n);
    expect(await registry.tokenURI(BigInt(ORG_A))).to.equal("ipfs://meta");
    expect(await registry.locked(BigInt(ORG_A))).to.equal(true);
    expect(await registry.supportsInterface("0xb45a3c0e")).to.equal(true);
  });

  it("rejects EOAs and EIP-7702-delegated EOAs — an org must be a contract account", async function () {
    const { registry, deployer, stranger } = await deploy();
    await expect(registry.connect(stranger).requestRegistration(ORG_A, ""))
      .to.be.revertedWithCustomError(registry, "NotContract");
    const delegated = ethers.Wallet.createRandom().address;
    await network.provider.send("hardhat_setCode", [delegated, "0xef0100" + "ab".repeat(20)]);
    await expect(registry.connect(deployer).migrationRegister([ORG_A], [delegated], [""], [ethers.ZeroHash]))
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

  it("an attester who co-owns the Safe cannot approve it, but may reject it", async function () {
    const { registry, attesters, safe, orgOwner } = await deploy();
    await attesters.set(orgOwner.address, true);
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(registry.connect(orgOwner).approveRequest(0)).to.be.revertedWithCustomError(registry, "SelfVote");
    await expect(registry.connect(orgOwner).rejectRequest(0)).to.emit(registry, "RequestRejected");
  });

  it("an expired claim is closed inline when its Safe asks again", async function () {
    const { registry, safe, orgOwner } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await time.increase(30 * DAY + 1);
    await expect(asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Expired);
    expect((await registry.openRegistrationOf(await safe.getAddress())).requestId).to.equal(1n);
  });

  it("anyone closes claims on a taken id (closeStale); live claims cannot be closed that way", async function () {
    const { registry, safe, squatter, orgOwner, stranger, a1, a2 } = await deploy();
    await asSafe(squatter, stranger, registry, "requestRegistration", [ORG_A, ""]); // #0
    await expect(registry.connect(stranger).closeStale(0)).to.be.revertedWithCustomError(registry, "NotStale");
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]); // #1
    await registry.connect(a1).approveRequest(1);
    await registry.connect(a2).approveRequest(1);
    await expect(registry.connect(stranger).closeStale(0))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Superseded);
  });

  it("a claim made before a revocation can never win the id afterwards", async function () {
    const { registry, safe, squatter, orgOwner, stranger, a1, a2, a3, a4 } = await deploy();
    await asSafe(squatter, stranger, registry, "requestRegistration", [ORG_A, ""]); // #0 stale-to-be
    await registry.connect(a4).approveRequest(0); // one mistaken approval
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]); // #1
    await registry.connect(a1).approveRequest(1);
    await registry.connect(a2).approveRequest(1);
    await registry.connect(a1).requestRevocation(ORG_A, ""); // #2
    await registry.connect(a1).approveRequest(2);
    await registry.connect(a2).approveRequest(2);
    await registry.connect(a3).approveRequest(2);
    expect(await registry.isRegistered(ORG_A)).to.equal(false);
    await expect(registry.connect(a3).approveRequest(0))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Superseded);
    expect(await registry.isRegistered(ORG_A)).to.equal(false);
  });

  it("rejection closes the request and puts the Safe on a 7-day cooldown", async function () {
    const { registry, safe, orgOwner, a1, a2, a3 } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await registry.connect(a1).rejectRequest(0);
    await expect(registry.connect(a2).rejectRequest(0))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Rejected);
    await expect(registry.connect(a3).approveRequest(0)).to.be.revertedWithCustomError(registry, "NotPending");
    await expect(asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]))
      .to.be.revertedWithCustomError(registry, "CoolingDown");
    await time.increase(7 * DAY + 1);
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    expect((await registry.openRegistrationOf(await safe.getAddress())).requestId).to.equal(1n);
  });

  it("a squatter cannot block an id: competing claims coexist, the approved one wins, the rest close", async function () {
    const { registry, safe, squatter, orgOwner, stranger, a1, a2, a3, a4 } = await deploy();
    await asSafe(squatter, stranger, registry, "requestRegistration", [ORG_A, ""]); // #0 squat
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]); // #1 the real org
    await registry.connect(a1).approveRequest(1);
    await registry.connect(a2).approveRequest(1);
    expect(await registry.ownerOf(BigInt(ORG_A))).to.equal(await safe.getAddress());
    // even if some attesters approve the squat, it can only close as superseded
    await registry.connect(a3).approveRequest(0);
    await expect(registry.connect(a4).approveRequest(0))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Superseded);
    expect(await registry.ownerOf(BigInt(ORG_A))).to.equal(await safe.getAddress());
  });

  it("one open registration per Safe; one org per Safe; registered ids refuse new claims", async function () {
    const { registry, safe, safe2, orgOwner, a1, a2 } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_B, ""]))
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
    await expect(asSafe(safe, orgOwner, registry, "withdrawRequest", [0]))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Withdrawn);
    expect((await registry.openRegistrationOf(await safe.getAddress())).open).to.equal(false);
  });

  it("migration supersedes a pending claim by the same Safe instead of leaving it dangling", async function () {
    const { registry, safe, orgOwner, a1, deployer } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(registry.connect(deployer).migrationRegister([ORG_B], [await safe.getAddress()], [""], [ethers.ZeroHash]))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Superseded)
      .and.to.emit(registry, "OrgRegistered").withArgs(ORG_B, await safe.getAddress(), MIGRATION_ID, 0);
    await expect(registry.connect(a1).approveRequest(0)).to.be.revertedWithCustomError(registry, "NotPending");
  });

  it("uris are capped at 512 bytes", async function () {
    const { registry, safe, orgOwner } = await deploy();
    await expect(asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, "x".repeat(513)]))
      .to.be.revertedWithCustomError(registry, "UriTooLong");
  });
});

describe("OrgRegistry — liveness", function () {
  it("requests expire; anyone closes an expired one; nobody votes on it after expiry", async function () {
    const { registry, safe, orgOwner, a1, stranger } = await deploy();
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await expect(registry.connect(stranger).expireRequest(0)).to.be.revertedWithCustomError(registry, "NotExpired");
    await time.increase(30 * DAY + 1);
    await expect(registry.connect(a1).approveRequest(0)).to.be.revertedWithCustomError(registry, "Expired");
    await expect(registry.connect(stranger).expireRequest(0))
      .to.emit(registry, "RequestClosed").withArgs(0, Status.Rejected, Close.Expired);
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]); // free again
  });

  it("a revocation stalled by a shrinking attester set expires and frees the slot", async function () {
    const { registry, attesters, a1, a2, a3, a4, stranger } = await registered();
    await registry.connect(a1).requestRevocation(ORG_A, "");
    await registry.connect(a1).approveRequest(1);
    await registry.connect(a2).rejectRequest(1);
    await attesters.set(a3.address, false);
    await attesters.set(a4.address, false); // quorum now unreachable
    await expect(registry.connect(a1).requestRevocation(ORG_A, "")).to.be.revertedWithCustomError(registry, "RequestOpen");
    await time.increase(30 * DAY + 1);
    await registry.connect(stranger).expireRequest(1);
    await registry.connect(a1).requestRevocation(ORG_A, ""); // slot free
  });

  it("thresholds never exceed the attester count", async function () {
    const { registry, attesters, safe, orgOwner, a1, a2, a3, a4 } = await deploy();
    await attesters.set(a3.address, false);
    await attesters.set(a4.address, false); // 2 attesters, revocation floor is 3
    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await registry.connect(a1).approveRequest(0);
    await registry.connect(a2).approveRequest(0);
    await registry.connect(a1).requestRevocation(ORG_A, "");
    expect((await registry.getRequest(1)).requiredApprovals).to.equal(2n);
  });
});

describe("OrgRegistry — self-sovereign record", function () {
  it("the Safe authorises and revokes Nostr keys individually", async function () {
    const { registry, safe, orgOwner } = await registered();
    await expect(asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_1, true]))
      .to.emit(registry, "NostrKeySet").withArgs(ORG_A, PUB_1, true);
    await asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_2, true]);
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
    expect(await registry.tokenURI(BigInt(ORG_A))).to.equal("ipfs://v2");
    for (const who of [deployer, stranger]) {
      await expect(registry.connect(who).setRole(ORG_A, who.address, Role.Admin))
        .to.be.revertedWithCustomError(registry, "NotOrgSafe");
      await expect(registry.connect(who).setNostrKey(ORG_A, PUB_1, true))
        .to.be.revertedWithCustomError(registry, "NotOrgSafe");
    }
  });

  it("owners are read live from the Safe; a malformed isOwner answer means 'not an owner'", async function () {
    const { registry, orgOwner, orgOwner2, member, deployer } = await registered();
    expect(await registry.isOrgOwner(ORG_A, orgOwner.address)).to.equal(true);
    expect(await registry.isOrgOwner(ORG_A, orgOwner2.address)).to.equal(true);
    expect(await registry.isOrgOwner(ORG_A, member.address)).to.equal(false);

    const bad = await (await ethers.getContractFactory("MockMalformedSafe")).deploy();
    await registry.connect(deployer).migrationRegister([ORG_B], [await bad.getAddress()], [""], [ethers.ZeroHash]);
    expect(await registry.isOrgOwner(ORG_B, orgOwner.address)).to.equal(false); // no revert
  });

  it("no approvals and no transfers on the soulbound token", async function () {
    const { registry, safe, safe2, orgOwner } = await registered();
    const from = await safe.getAddress();
    await expect(asSafe(safe, orgOwner, registry, "approve", [await safe2.getAddress(), BigInt(ORG_A)]))
      .to.be.revertedWithCustomError(registry, "Soulbound");
    await expect(asSafe(safe, orgOwner, registry, "setApprovalForAll", [await safe2.getAddress(), true]))
      .to.be.revertedWithCustomError(registry, "Soulbound");
    await expect(asSafe(safe, orgOwner, registry, "transferFrom", [from, await safe2.getAddress(), BigInt(ORG_A)]))
      .to.be.revertedWithCustomError(registry, "Soulbound");
  });

  it("rotation is two-step: the new Safe must accept; keys and roles carry over", async function () {
    const { registry, safe, safe2, squatter, orgOwner, stranger, member } = await registered();
    await asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_1, true]);
    await asSafe(safe, orgOwner, registry, "setRole", [ORG_A, member.address, Role.Member]);
    const from = await safe.getAddress();
    const to = await safe2.getAddress();

    await asSafe(safe, orgOwner, registry, "proposeRotation", [ORG_A, to]);
    expect(await registry.ownerOf(BigInt(ORG_A))).to.equal(from); // nothing moved yet
    await expect(asSafe(squatter, stranger, registry, "acceptRotation", [ORG_A]))
      .to.be.revertedWithCustomError(registry, "NoPendingRotation");

    await expect(asSafe(safe2, orgOwner, registry, "acceptRotation", [ORG_A]))
      .to.emit(registry, "SafeRotated").withArgs(ORG_A, from, to);
    expect(await registry.ownerOf(BigInt(ORG_A))).to.equal(to);
    expect(await registry.orgIdOfSafe(from)).to.equal(ethers.ZeroHash);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(true);
    expect(await registry.roleOf(ORG_A, member.address)).to.equal(Role.Member);
    await expect(asSafe(safe, orgOwner, registry, "setNostrKey", [ORG_A, PUB_2, true]))
      .to.be.revertedWithCustomError(registry, "NotOrgSafe");
  });

  it("accepting a rotation supersedes the successor's own pending registration", async function () {
    const { registry, safe, safe2, orgOwner } = await registered();
    await asSafe(safe2, orgOwner, registry, "requestRegistration", [ORG_B, ""]); // #1
    await asSafe(safe, orgOwner, registry, "proposeRotation", [ORG_A, await safe2.getAddress()]);
    await expect(asSafe(safe2, orgOwner, registry, "acceptRotation", [ORG_A]))
      .to.emit(registry, "RequestClosed").withArgs(1, Status.Rejected, Close.Superseded);
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
    await expect(registry.connect(a3).approveRequest(1))
      .to.emit(registry, "OrgRevoked").withArgs(ORG_A, await safe.getAddress(), 1, 0);

    expect(await registry.isRegistered(ORG_A)).to.equal(false);
    expect(await registry.orgCount()).to.equal(0n);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(false);
    expect(await registry.roleOf(ORG_A, member.address)).to.equal(Role.None);

    await asSafe(safe, orgOwner, registry, "requestRegistration", [ORG_A, ""]);
    await registry.connect(a1).approveRequest(2);
    await expect(registry.connect(a2).approveRequest(2))
      .to.emit(registry, "OrgRegistered").withArgs(ORG_A, await safe.getAddress(), 2, 1);
    expect(await registry.isNostrKeyAuthorized(ORG_A, PUB_1)).to.equal(false);
    expect(await registry.roleOf(ORG_A, member.address)).to.equal(Role.None);
  });

  it("an org that makes every attester a Safe owner is still revocable", async function () {
    const { registry, deployer, a1, a2, a3, a4 } = await deploy();
    const stuffed = await (await ethers.getContractFactory("MockSafe")).deploy(
      [a1, a2, a3, a4].map((a) => a.address),
    );
    await registry.connect(deployer).migrationRegister([ORG_A], [await stuffed.getAddress()], [""], [ethers.ZeroHash]);
    await registry.connect(a1).requestRevocation(ORG_A, "");
    await registry.connect(a1).approveRequest(0);
    await registry.connect(a2).approveRequest(0);
    await expect(registry.connect(a3).approveRequest(0)).to.emit(registry, "OrgRevoked");
  });

  it("an org's own owner-attesters cannot veto its revocation", async function () {
    const { registry, attesters, orgOwner, orgOwner2, a1 } = await registered();
    await attesters.set(orgOwner.address, true);
    await attesters.set(orgOwner2.address, true);
    await registry.connect(a1).requestRevocation(ORG_A, "");
    await expect(registry.connect(orgOwner).rejectRequest(1)).to.be.revertedWithCustomError(registry, "SelfVote");
    await expect(registry.connect(orgOwner2).rejectRequest(1)).to.be.revertedWithCustomError(registry, "SelfVote");
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

  it("owner tunes bands within bounds", async function () {
    const { registry, deployer } = await deploy();
    await expect(registry.connect(deployer).setBands(band(3000, 1, 3), REJECTION, REVOCATION))
      .to.emit(registry, "BandsChanged");
    expect((await registry.approvalBand()).floor).to.equal(1n);
    await expect(registry.connect(deployer).setBands(band(3000, 0, 3), REJECTION, REVOCATION))
      .to.be.revertedWith("floor >= 1");
    await expect(registry.connect(deployer).setBands(APPROVAL, REJECTION, band(6700, 51, 65535)))
      .to.be.revertedWithCustomError(registry, "BandTooHigh");
  });
});
