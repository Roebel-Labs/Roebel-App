const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const H = require("./credential-helpers");
const v = require("../../../packages/credential-registry/test/vectors/credential-vector.json");

const { deployRegister, asSafe, cfg, hashLeaf, tree, signClaim, LeafStatus, Kind, Policy, ORG_A } = H;

const asLeaf = (l) => ({
  kind: BigInt(l.tuple[0]), typeId: l.tuple[1], subject: l.tuple[2], validUntil: BigInt(l.tuple[3]), salt: l.tuple[4],
});

const CLAIM_TYPES = { Claim: [
  { name: "batchId", type: "uint64" },
  { name: "leaf", type: "bytes32" },
  { name: "account", type: "address" },
] };

async function vectorFixture() {
  const ctx = await deployRegister();
  // ORG_A is orgIdFromUuid("6f1c2c7e-...") — the vector's org.
  await asSafe(ctx.safe, ctx.orgOwner, ctx.registry, "createType", [
    v.orgId, v.localId, Kind.Membership, Policy.IssuerBatch, cfg(),
  ]);
  await asSafe(ctx.safe, ctx.orgOwner, ctx.registry, "addBatch", [v.typeId, v.root, 3]);
  return ctx;
}

describe("CredentialRegistry cross-language vector", () => {
  it("fixture org is the vector org", () => expect(ORG_A).to.equal(v.orgId));

  it("type id", async () => {
    const { registry } = await loadFixture(vectorFixture);
    expect(await registry.typeIdOf(v.orgId, v.localId)).to.equal(v.typeId);
  });

  it("leaf hashes", async () => {
    const { registry } = await loadFixture(vectorFixture);
    for (const l of v.leaves) {
      expect(await registry.leafHash(l.tuple)).to.equal(l.hash);
      expect(hashLeaf(asLeaf(l))).to.equal(l.hash);
    }
  });

  it("helper tree equals the vector tree", () => {
    const t = tree(v.leaves.map(asLeaf));
    expect(t.root).to.equal(v.root);
    for (const l of v.leaves) expect(t.proof(asLeaf(l))).to.deep.equal(l.proof);
  });

  it("every vector proof verifies on chain", async () => {
    const { registry } = await loadFixture(vectorFixture);
    expect(BigInt(await time.latest())).to.be.lessThan(1798761600n);
    for (const l of v.leaves) {
      expect((await registry.checkLeaf(1, l.tuple, l.proof))[0]).to.equal(LeafStatus.Valid);
    }
  });

  it("the vector digest is the EIP-712 digest for the vector domain", () => {
    const domain = { name: "CredentialRegistry", version: "1", chainId: v.claim.chainId, verifyingContract: v.claim.registry };
    expect(ethers.TypedDataEncoder.hash(domain, CLAIM_TYPES,
      { batchId: v.claim.batchId, leaf: v.leaves[2].hash, account: v.claim.account })).to.equal(v.claim.digest);
  });

  it("the contract's digest follows the same rule for its own domain", async () => {
    const { registry } = await loadFixture(vectorFixture);
    const { chainId } = await ethers.provider.getNetwork();
    const domain = { name: "CredentialRegistry", version: "1", chainId, verifyingContract: await registry.getAddress() };
    const expected = ethers.TypedDataEncoder.hash(domain, CLAIM_TYPES,
      { batchId: v.claim.batchId, leaf: v.leaves[2].hash, account: v.claim.account });
    expect(await registry.claimDigest(1, v.leaves[2].hash, v.claim.account)).to.equal(expected);
  });

  it("the vector claim key claims on chain", async () => {
    const { registry } = await loadFixture(vectorFixture);
    const wallet = new ethers.Wallet(v.claim.privateKey);
    expect(wallet.address).to.equal(v.claim.signer);
    await network.provider.send("hardhat_impersonateAccount", [v.claim.account]);
    await network.provider.send("hardhat_setBalance", [v.claim.account, "0x56BC75E2D63100000"]);
    const claimer = await ethers.getSigner(v.claim.account);
    const l = v.leaves[2];
    const sig = await signClaim(wallet, registry, 1, l.hash, v.claim.account);
    await expect(registry.connect(claimer).claim(1, l.tuple, l.proof, sig))
      .to.emit(registry, "Claimed");
    expect(await registry.balanceOf(v.claim.account, v.typeId)).to.equal(1n);
    await network.provider.send("hardhat_stopImpersonatingAccount", [v.claim.account]);
  });
});
