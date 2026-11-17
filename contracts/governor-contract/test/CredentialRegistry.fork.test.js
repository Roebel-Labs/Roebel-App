// Gnosis-fork test of CredentialRegistry against the LIVE OrgRegistry, CitizenNFTv2,
// AttesterNFTv2 and real Safe 1.4.1 contracts. Local fork only: nothing is broadcast.
// Skipped unless both env vars are set:
//
//   CREDREG_FORK_TEST=1 GNOSIS_FORK=1 [GNOSIS_RPC_URL=…] \
//     npx hardhat test test/CredentialRegistry.fork.test.js
//
// The tests share one fork and run in order: each builds on the state of the previous.
const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const {
  CITIZEN_TYPE, ATTESTER_TYPE, RESERVED_URIS, Kind, Policy, OrgRole, LeafKind, DAY,
  orgIdOf, LOCAL, typeId, cfg, leaf, tree,
} = require("./credential-helpers");

const CITIZEN_V2 = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5";
const ATTESTER_V2 = "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82";
const ORG_REGISTRY = "0x320b4ea2f4E31b81245e684D08AF593DE05E9919";
const ATTESTER_SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const TEST_ENV = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "gnosis-test.json"), "utf8"));

const LIVE_FROM_BLOCK = Number(process.env.CREDREG_FORK_FROM_BLOCK || 46_800_000);
const CHUNK = Number(process.env.CREDREG_FORK_LOG_CHUNK || 200_000);

// Safe 1.4.1 canonical deployments (scripts/test-env/org-registry-e2e.cjs).
const SAFE = {
  singletonL2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
};
const SAFE_ABI = [
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
  "function getOwners() view returns (address[])",
];
const EXECUTION_SUCCESS = ethers.id("ExecutionSuccess(bytes32,uint256)");
const EXECUTION_FAILURE = ethers.id("ExecutionFailure(bytes32,uint256)");
const FACTORY_ABI = [
  "function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns (address)",
  "event ProxyCreation(address indexed proxy, address singleton)",
];
const ORG_ABI = [
  "function orgCount() view returns (uint256)",
  "function migrationFinalized() view returns (bool)",
  "function owner() view returns (address)",
  "function isRegistered(bytes32) view returns (bool)",
  "function isOrgOwner(bytes32,address) view returns (bool)",
  "function roleOf(bytes32,address) view returns (uint8)",
  "function migrationRegister(bytes32[] orgIds,address[] safes,string[] metadataURIs,bytes32[] nostrPubkeys)",
  "function setRole(bytes32 orgId,address account,uint8 role)",
  "function requestRevocation(bytes32 orgId,string evidenceURI) returns (uint256)",
  "function approveRequest(uint256 requestId)",
  "function openRevocationOf(bytes32) view returns (bool open,uint256 requestId)",
  "function hasVoted(uint256,address) view returns (bool)",
  "event OrgRevoked(bytes32 indexed orgId, address indexed safe, uint256 indexed requestId, uint64 generation)",
];
const NFT_ABI = [
  "function hasCitizenNFT(address) view returns (bool)",
  "function hasAttesterNFT(address) view returns (bool)",
];

const enabled = process.env.CREDREG_FORK_TEST === "1" && process.env.GNOSIS_FORK === "1";
const d = enabled ? describe : describe.skip;

/** Current holders reconstructed from ERC-721 Transfer logs (pattern: V3Bootstrap.fork.test.js). */
async function holdersFromLogs(address, fromBlock) {
  const topic = ethers.id("Transfer(address,address,uint256)");
  const latest = await ethers.provider.getBlockNumber();
  const owner = new Map(); // tokenId → owner
  for (let from = fromBlock; from <= latest; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, latest);
    const logs = await ethers.provider.getLogs({ address, topics: [topic], fromBlock: from, toBlock: to });
    for (const l of logs) {
      const recipient = ethers.getAddress("0x" + l.topics[2].slice(26));
      const id = BigInt(l.topics[3]);
      if (recipient === ethers.ZeroAddress) owner.delete(id);
      else owner.set(id, recipient);
    }
  }
  return [...new Set(owner.values())];
}

async function impersonate(addr) {
  await network.provider.send("hardhat_impersonateAccount", [addr]);
  await network.provider.send("hardhat_setBalance", [addr, "0x56BC75E2D63100000"]); // 100 xDAI
  return ethers.getSigner(addr);
}

/** Deploy a 1-of-1 Safe 1.4.1 owned by `owner` through the canonical factory. */
async function deploySafe(owner) {
  const safeIface = new ethers.Interface(SAFE_ABI);
  const initializer = safeIface.encodeFunctionData("setup", [
    [owner.address], 1, ethers.ZeroAddress, "0x", SAFE.fallbackHandler, ethers.ZeroAddress, 0, ethers.ZeroAddress,
  ]);
  const factory = new ethers.Contract(SAFE.proxyFactory, FACTORY_ABI, owner);
  const saltNonce = BigInt(ethers.hexlify(ethers.randomBytes(8)));
  const rcpt = await (await factory.createProxyWithNonce(SAFE.singletonL2, initializer, saltNonce)).wait();
  const ev = rcpt.logs
    .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
    .find((e) => e?.name === "ProxyCreation");
  if (!ev) throw new Error("no ProxyCreation event");
  return new ethers.Contract(ev.args.proxy, SAFE_ABI, owner);
}

/**
 * 1-of-1 Safe tx sent by its owner with a pre-validated signature (r = owner, s = 0, v = 1).
 * Safe does not revert on an inner failure, so ExecutionFailure is turned into an error.
 */
async function execAsSafe(safe, owner, target, fn, args) {
  const data = target.interface.encodeFunctionData(fn, args);
  const sig = ethers.concat([ethers.zeroPadValue(owner.address, 32), ethers.ZeroHash, "0x01"]);
  const rcpt = await (
    await safe.connect(owner).execTransaction(
      await target.getAddress(), 0, data, 0, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sig,
    )
  ).wait();
  // Match by topic: Safe 1.4.1 indexes txHash, so the events are not decoded by name here.
  const topics = rcpt.logs
    .filter((l) => l.address.toLowerCase() === String(safe.target).toLowerCase())
    .map((l) => l.topics[0]);
  if (topics.includes(EXECUTION_FAILURE) || !topics.includes(EXECUTION_SUCCESS)) {
    throw new Error(`${fn}: the Safe's inner call failed`);
  }
  return rcpt;
}

d("CredentialRegistry — Gnosis fork, live OrgRegistry + NFTs + Safe 1.4.1", function () {
  this.timeout(10 * 60 * 1000);

  const s = {}; // shared state across the ordered tests

  before(async function () {
    // Hardhat has no hardfork history for chain 100, so calls AT the fork block fail;
    // mine one local block so every call runs on a local (known-hardfork) block.
    await network.provider.send("hardhat_mine", ["0x1"]);
    for (const a of [CITIZEN_V2, ATTESTER_V2, ORG_REGISTRY, ATTESTER_SAFE, SAFE.proxyFactory, SAFE.singletonL2]) {
      expect(await ethers.provider.getCode(a), `${a} has code`).to.not.equal("0x");
    }

    const signers = await ethers.getSigners();
    [s.deployer, s.orgOwner, s.memberOwner, s.admin, s.outsider] = signers;
    s.orgs = new ethers.Contract(ORG_REGISTRY, ORG_ABI, ethers.provider);
    s.citV2 = new ethers.Contract(CITIZEN_V2, NFT_ABI, ethers.provider);
    s.attV2 = new ethers.Contract(ATTESTER_V2, NFT_ABI, ethers.provider);
    expect(await s.orgs.owner()).to.equal(ATTESTER_SAFE);
    s.migrationFinalized = await s.orgs.migrationFinalized();
    if (s.migrationFinalized) {
      throw new Error("live OrgRegistry migration is finalized: register through requestRegistration + attester approvals instead");
    }

    s.attesterSafe = await impersonate(ATTESTER_SAFE);
    s.registry = await (await ethers.getContractFactory("CredentialRegistry")).deploy(
      ATTESTER_SAFE, CITIZEN_V2, ATTESTER_V2, ORG_REGISTRY, RESERVED_URIS,
    );

    s.citizens = await holdersFromLogs(CITIZEN_V2, LIVE_FROM_BLOCK);
    s.attesters = await holdersFromLogs(ATTESTER_V2, LIVE_FROM_BLOCK);
    console.log(`      live citizens=${s.citizens.length}, attesters=${s.attesters.length}, orgCount=${await s.orgs.orgCount()}`);
  });

  it("reserved types follow the live NFTs", async function () {
    const { registry, citizens, attesters, citV2, attV2 } = s;
    expect(citizens.length).to.be.gte(3);
    expect(attesters.length).to.be.gte(1);
    for (const c of citizens.slice(0, 3)) {
      expect(await citV2.hasCitizenNFT(c), c).to.equal(true);
      expect(await registry.holds(CITIZEN_TYPE, c), c).to.equal(true);
      expect(await registry.balanceOf(c, BigInt(CITIZEN_TYPE)), c).to.equal(1n);
    }
    for (const a of attesters) {
      expect(await attV2.hasAttesterNFT(a), a).to.equal(true);
      expect(await registry.holds(ATTESTER_TYPE, a), a).to.equal(true);
    }
    const fresh = ethers.Wallet.createRandom().address;
    expect(await registry.holds(CITIZEN_TYPE, fresh)).to.equal(false);
    expect(await registry.holds(ATTESTER_TYPE, fresh)).to.equal(false);
  });

  it("a real Safe is an org authority", async function () {
    const { registry, orgs, orgOwner, memberOwner, outsider, attesterSafe } = s;
    s.orgSafe = await deploySafe(orgOwner);
    s.memberSafe = await deploySafe(memberOwner);
    s.orgId = orgIdOf(ethers.hexlify(ethers.randomBytes(16)).slice(2));
    const orgSafeAddr = await s.orgSafe.getAddress();

    await orgs.connect(attesterSafe).migrationRegister([s.orgId], [orgSafeAddr], ["netizen-test://credreg-fork"], [ethers.ZeroHash]);
    expect(await orgs.isRegistered(s.orgId)).to.equal(true);
    expect(await orgs.isOrgOwner(s.orgId, orgOwner.address)).to.equal(true);
    expect(await registry.canManage(s.orgId, orgSafeAddr)).to.equal(true);
    expect(await registry.canManage(s.orgId, outsider.address)).to.equal(false);

    // The Safe creates a type and publishes a batch through execTransaction.
    const local = LOCAL("fork-members");
    s.typeId = typeId(s.orgId, local);
    await execAsSafe(s.orgSafe, orgOwner, registry, "createType", [s.orgId, local, Kind.Membership, Policy.IssuerBatch, cfg()]);
    const t = await registry.getType(s.typeId);
    expect(t.orgId).to.equal(s.orgId);
    expect(await registry.isTypeActive(s.typeId)).to.equal(true);

    s.leaves = {
      member: leaf(LeafKind.Account, s.typeId, await s.memberSafe.getAddress()),
      outsider: leaf(LeafKind.Account, s.typeId, outsider.address),
    };
    s.tree = tree([s.leaves.member, s.leaves.outsider]);
    await execAsSafe(s.orgSafe, orgOwner, registry, "addBatch", [s.typeId, s.tree.root, 2]);
    s.batchId = await registry.batchCount();
    const b = await registry.getBatch(s.batchId);
    expect(b.issuer).to.equal(orgSafeAddr);
    expect(b.root).to.equal(s.tree.root);

    // The Safe's owner creates a type directly (isOrgOwner path, read live from the Safe).
    const ownerLocal = LOCAL("fork-owner-badge");
    await expect(registry.connect(orgOwner).createType(s.orgId, ownerLocal, Kind.Badge, Policy.IssuerBatch, cfg()))
      .to.emit(registry, "TypeCreated");
    expect(await registry.typeExists(typeId(s.orgId, ownerLocal))).to.equal(true);
    await expect(registry.connect(outsider).createType(s.orgId, LOCAL("nope"), Kind.Badge, Policy.IssuerBatch, cfg()))
      .to.be.revertedWithCustomError(registry, "NotAuthorised");
  });

  it("a live Admin role issues", async function () {
    const { registry, orgs, orgOwner, admin } = s;
    expect(await registry.canIssue(s.typeId, admin.address)).to.equal(false);
    await execAsSafe(s.orgSafe, orgOwner, orgs, "setRole", [s.orgId, admin.address, OrgRole.Admin]);
    expect(Number(await orgs.roleOf(s.orgId, admin.address))).to.equal(OrgRole.Admin);
    expect(await registry.canIssue(s.typeId, admin.address)).to.equal(true);

    const t = tree([leaf(LeafKind.Account, s.typeId, ethers.Wallet.createRandom().address)]);
    await expect(registry.connect(admin).addBatch(s.typeId, t.root, 1))
      .to.emit(registry, "BatchAdded").withArgs(s.batchId + 1n, s.typeId, admin.address, t.root, 1n);
  });

  it("a Safe account claims", async function () {
    const { registry, memberOwner } = s;
    const memberAddr = await s.memberSafe.getAddress();
    expect(await registry.holds(s.typeId, memberAddr)).to.equal(false);
    await execAsSafe(s.memberSafe, memberOwner, registry, "claim", [
      s.batchId, s.leaves.member, s.tree.proof(s.leaves.member), "0x",
    ]);
    expect(await registry.holds(s.typeId, memberAddr)).to.equal(true);
    expect(await registry.balanceOf(memberAddr, BigInt(s.typeId))).to.equal(1n);
    expect((await registry.getType(s.typeId)).supply).to.equal(1n);
    const h = await registry.holdingOf(s.typeId, memberAddr);
    expect(h.batchId).to.equal(s.batchId);
  });

  it("revoking the org on the live registry kills its credentials", async function () {
    const { registry, orgs, attesters, outsider, attV2 } = s;
    const memberAddr = await s.memberSafe.getAddress();
    const live = [];
    for (const a of attesters) if (await attV2.hasAttesterNFT(a)) live.push(a);

    const first = await impersonate(live[0]);
    await orgs.connect(first).requestRevocation(s.orgId, "netizen-test://credreg-fork/revoke");
    const [open, requestId] = await orgs.openRevocationOf(s.orgId);
    expect(open).to.equal(true);

    let revoked = false;
    for (const a of live) {
      const signer = await impersonate(a);
      const rcpt = await (await orgs.connect(signer).approveRequest(requestId)).wait();
      if (rcpt.logs.some((l) => { try { return orgs.interface.parseLog(l)?.name === "OrgRevoked"; } catch { return false; } })) {
        revoked = true;
        break;
      }
    }
    expect(revoked, "OrgRevoked emitted").to.equal(true);
    expect(await orgs.isRegistered(s.orgId)).to.equal(false);

    expect(await registry.isTypeActive(s.typeId)).to.equal(false);
    expect(await registry.holds(s.typeId, memberAddr)).to.equal(false);
    expect(await registry.balanceOf(memberAddr, BigInt(s.typeId))).to.equal(0n);
    await expect(
      registry.connect(outsider).claim(s.batchId, s.leaves.outsider, s.tree.proof(s.leaves.outsider), "0x"),
    ).to.be.revertedWithCustomError(registry, "TypeInactive").withArgs(s.typeId);

    await expect(registry.connect(outsider).prune(s.typeId, memberAddr))
      .to.emit(registry, "Pruned").withArgs(s.typeId, memberAddr);
    expect((await registry.holdingOf(s.typeId, memberAddr)).since).to.equal(0n);
    expect((await registry.getType(s.typeId)).supply).to.equal(0n);
    await expect(registry.connect(outsider).prune(s.typeId, memberAddr))
      .to.be.revertedWithCustomError(registry, "NotHeld");
  });

  it("sources hand-over", async function () {
    const { registry, attesterSafe, citizens, citV2, orgs, orgOwner, memberOwner } = s;
    const testC = TEST_ENV.contracts;
    const testCit = new ethers.Contract(testC.citizenNFTv2, NFT_ABI, ethers.provider);

    // A second, live org on the live registry with a type and a holder, to follow across the swap.
    const liveSafe = await deploySafe(orgOwner);
    const liveSafeAddr = await liveSafe.getAddress();
    const liveOrgId = orgIdOf(ethers.hexlify(ethers.randomBytes(16)).slice(2));
    await orgs.connect(attesterSafe).migrationRegister([liveOrgId], [liveSafeAddr], ["netizen-test://credreg-fork/live"], [ethers.ZeroHash]);
    const liveLocal = LOCAL("fork-live-members");
    const liveType = typeId(liveOrgId, liveLocal);
    await execAsSafe(liveSafe, orgOwner, registry, "createType", [liveOrgId, liveLocal, Kind.Membership, Policy.IssuerBatch, cfg()]);
    expect(await registry.typeRegistryOf(liveType)).to.equal(ORG_REGISTRY);
    const liveLeaf = leaf(LeafKind.Account, liveType, memberOwner.address);
    const liveTree = tree([liveLeaf]);
    await execAsSafe(liveSafe, orgOwner, registry, "addBatch", [liveType, liveTree.root, 1]);
    const liveBatch = await registry.batchCount();
    await registry.connect(memberOwner).claim(liveBatch, liveLeaf, liveTree.proof(liveLeaf), "0x");
    expect(await registry.holds(liveType, memberOwner.address)).to.equal(true);

    await expect(registry.connect(attesterSafe).proposeSources(testC.citizenNFTv2, testC.attesterNFTv2, testC.orgRegistry))
      .to.emit(registry, "SourcesProposed");
    const [, , , eta] = await registry.pendingSources();
    await expect(registry.connect(attesterSafe).applySources())
      .to.be.revertedWithCustomError(registry, "SourcesNotReady").withArgs(eta);

    // Accounts whose citizen status differs between the live and the test NFT.
    const testCitizens = await holdersFromLogs(testC.citizenNFTv2, TEST_ENV.deployBlock);
    const testOnly = [];
    for (const a of testCitizens) if ((await testCit.hasCitizenNFT(a)) && !(await citV2.hasCitizenNFT(a))) testOnly.push(a);
    const liveOnly = [];
    for (const a of citizens) if (!(await testCit.hasCitizenNFT(a))) liveOnly.push(a);
    expect(testOnly.length + liveOnly.length, "live and test citizen sets differ").to.be.gte(1);
    for (const a of testOnly) expect(await registry.holds(CITIZEN_TYPE, a), a).to.equal(false);
    for (const a of liveOnly) expect(await registry.holds(CITIZEN_TYPE, a), a).to.equal(true);

    await network.provider.send("evm_increaseTime", [2 * DAY]);
    await network.provider.send("evm_mine");
    await expect(registry.connect(attesterSafe).applySources())
      .to.emit(registry, "SourcesApplied").withArgs(testC.citizenNFTv2, testC.attesterNFTv2, testC.orgRegistry);
    expect(await registry.citizenNFT()).to.equal(testC.citizenNFTv2);
    expect(await registry.attesterNFT()).to.equal(testC.attesterNFTv2);
    expect(await registry.orgRegistry()).to.equal(testC.orgRegistry);

    for (const a of testOnly) expect(await registry.holds(CITIZEN_TYPE, a), a).to.equal(true);
    for (const a of liveOnly) expect(await registry.holds(CITIZEN_TYPE, a), a).to.equal(false);
    console.log(`      test-only citizens=${testOnly.length}, live-only citizens=${liveOnly.length}`);

    // Org types stay bound to the live registry: inactive until rebound, holdings not prunable.
    expect(await registry.isTypeActive(liveType)).to.equal(false);
    expect(await registry.holds(liveType, memberOwner.address)).to.equal(false);
    // Not registered in the test registry yet: not rebindable, but still alive in the
    // registry it is bound to, so its holdings cannot be pruned meanwhile.
    await expect(registry.rebindType(liveType)).to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(liveType);
    await expect(registry.connect(s.outsider).prune(liveType, memberOwner.address))
      .to.be.revertedWithCustomError(registry, "StillValid");
    // The org revoked on the live registry earlier never revives, even once imported.
    const testOrgs = new ethers.Contract(testC.orgRegistry, ORG_ABI, ethers.provider);
    expect(await testOrgs.migrationFinalized(), "test OrgRegistry migration still open").to.equal(false);
    const testOwner = await impersonate(await testOrgs.owner());
    const deadSafe = await deploySafe(orgOwner);
    await testOrgs.connect(testOwner).migrationRegister(
      [liveOrgId, s.orgId], [liveSafeAddr, await deadSafe.getAddress()], ["", ""], [ethers.ZeroHash, ethers.ZeroHash],
    );
    await expect(registry.rebindType(s.typeId)).to.be.revertedWithCustomError(registry, "NotRebindable").withArgs(s.typeId);
    expect(await registry.isTypeActive(s.typeId)).to.equal(false);
    await expect(registry.connect(s.outsider).prune(liveType, memberOwner.address))
      .to.be.revertedWithCustomError(registry, "StillValid");

    // Anyone rebinds the live type; it continues under the test registry.
    await expect(registry.connect(s.outsider).rebindType(liveType))
      .to.emit(registry, "TypeRebound").withArgs(liveType, testC.orgRegistry, 0n);
    expect(await registry.typeRegistryOf(liveType)).to.equal(testC.orgRegistry);
    expect(await registry.isTypeActive(liveType)).to.equal(true);
    expect(await registry.holds(liveType, memberOwner.address)).to.equal(true);
    expect(await registry.canManage(liveOrgId, liveSafeAddr)).to.equal(true);
  });
});
