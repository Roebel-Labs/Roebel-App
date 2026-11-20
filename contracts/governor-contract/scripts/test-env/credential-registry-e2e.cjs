/**
 * Credential register — deploy CredentialRegistry into the ONCHAIN TEST ENVIRONMENT and
 * drive one full issue → claim → prove → revoke → guest cycle on Gnosis mainnet.
 *
 *   1. Deploy CredentialRegistry (owner = burner; sources = the TEST CitizenNFTv2,
 *      AttesterNFTv2 and OrgRegistry; test reserved URIs).
 *   2. Test org A's Safe (1-of-1, owner = burner) creates a Membership type.
 *   3. The Safe adds a batch of three leaves: account leaves for co-signers 1 and 2,
 *      one claim-key leaf.
 *   4. Co-signer 1 claims publicly; co-signer 2 stays private (checkLeaf → Valid);
 *      co-signer 3 claims the claim-key leaf with the key's EIP-712 signature.
 *   5. The Safe revokes co-signer 1's leaf (which burns the holding).
 *   6. Co-signer 4 self-claims Guest.
 *   7. Assert holds() for a test citizen and a test attester and every state above,
 *      then write the result into deployments/gnosis-test.json.
 *
 * Idempotent: an existing manifest `credentialRegistry` is reused, leaves are
 * deterministic, and finished steps are skipped, so an interrupted run can simply be
 * restarted.
 *
 * Real run (needs the burner key in .env; refuses unless it IS the manifest owner):
 *   ROEBEL_TEST_ENV=1 node scripts/test-env/credential-registry-e2e.cjs [--dry-run] [--fresh]
 *
 * Rehearsal on a Gnosis fork (no key; impersonates the burner + co-signers; writes nothing):
 *   CRED_E2E_REHEARSAL=1 GNOSIS_FORK=1 ROEBEL_TEST_ENV=1 npx hardhat run scripts/test-env/credential-registry-e2e.cjs
 */
const { ethers } = require("ethers");
const L = require("./lib.cjs");

const DRY = process.argv.includes("--dry-run");
// --fresh: deploy a new registry even if the manifest has one (after a contract change).
const FRESH = process.argv.includes("--fresh") || process.env.CRED_E2E_FRESH === "1";
const REHEARSAL = process.env.CRED_E2E_REHEARSAL === "1";

const SAFE_ABI = [
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
  "function getOwners() view returns (address[])",
];
// Safe 1.4.1 indexes txHash in both events, so match them by topic, not by a decoded name.
const EXECUTION_SUCCESS = ethers.id("ExecutionSuccess(bytes32,uint256)");
const EXECUTION_FAILURE = ethers.id("ExecutionFailure(bytes32,uint256)");

const NFT_ABI = [
  "function hasCitizenNFT(address) view returns (bool)",
  "function hasAttesterNFT(address) view returns (bool)",
];

const RESERVED_URIS = [
  "netizen-test://credential-type/citizen.json",
  "netizen-test://credential-type/attester.json",
  "netizen-test://credential-type/guest.json",
];
const MEMBERSHIP_LOCAL = ethers.id("netizen:credential-type:v1:test-env:membership");
const MEMBERSHIP_URI = "netizen-test://credential-type/org-a/membership.json";
const GUEST_TYPE = "0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7";
const CITIZEN_TYPE = "0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3";
const ATTESTER_TYPE = "0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d";

const Kind = { Role: 0, Membership: 1, Badge: 2 };
const Policy = { IssuerBatch: 0, SelfClaim: 1, External: 2 };
const LeafKind = { Account: 0, ClaimKey: 1 };
const LeafStatus = ["Invalid", "Valid", "Expired", "Revoked", "Inactive"];

function log(...a) {
  console.log(...a);
}

// ---------------------------------------------------------------------------
// Leaves and tree — same construction as test/credential-helpers.js (sorted leaves,
// commutative pair hashing, unpaired last node moves up, double-hashed leaf).
// ---------------------------------------------------------------------------

function hashLeaf(l) {
  const inner = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "bytes32", "address", "uint64", "bytes32"],
      [l.kind, l.typeId, l.subject, l.validUntil, l.salt],
    ),
  );
  return ethers.keccak256(inner);
}
const cmp = (a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
const hashPair = (a, b) => (cmp(a, b) < 0 ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a])));

function tree(leaves) {
  const layer0 = leaves.map(hashLeaf).sort(cmp);
  const layers = [layer0];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    layers.push(next);
  }
  const proof = (l) => {
    let idx = layer0.indexOf(hashLeaf(l));
    if (idx < 0) throw new Error("leaf not in tree");
    const out = [];
    for (let d = 0; d < layers.length - 1; d++) {
      if ((idx ^ 1) < layers[d].length) out.push(layers[d][idx ^ 1]);
      idx >>= 1;
    }
    return out;
  };
  return { root: layers[layers.length - 1][0], proof };
}

/** Deterministic salts, so a rerun rebuilds the same root and finds its batch. */
const saltOf = (name) => ethers.id(`netizen:credential-registry:test-env:salt:${name}`);

/**
 * The claim key. Live: derived from the burner key (not public, so nobody can
 * front-run the binding). Rehearsal: a random throwaway.
 */
function claimKeyWallet() {
  if (REHEARSAL) return ethers.Wallet.createRandom();
  return new ethers.Wallet(ethers.keccak256(ethers.solidityPacked(["bytes32", "string"], [L.burnerKey(), "netizen:credential-registry:test-env:claim-key"])));
}

async function signers(manifest) {
  if (REHEARSAL) {
    const hre = require("hardhat");
    // Right after forking, "latest" IS the fork block, which Hardhat treats as
    // historical and refuses to execute for chain 100. One local block fixes it.
    await hre.network.provider.send("hardhat_mine", ["0x1"]);
    const impersonate = async (addr) => {
      await hre.network.provider.send("hardhat_setBalance", [addr, "0x56BC75E2D63100000"]); // 100 xDAI
      return hre.ethers.getImpersonatedSigner(addr);
    };
    return {
      burner: await impersonate(manifest.owner),
      cosigners: await Promise.all(manifest.cosigners.map(impersonate)),
      provider: hre.ethers.provider,
    };
  }
  const provider = L.provider();
  const burner = L.burnerWallet(provider);
  if (burner.address.toLowerCase() !== manifest.owner.toLowerCase()) {
    throw new Error(`REFUSING: DEPLOYER_PRIVATE_KEY is ${burner.address}, not the test-env owner ${manifest.owner}.`);
  }
  const cosigners = L.deriveCosigners(manifest.cosigners.length).map((w) => w.connect(provider));
  cosigners.forEach((w, i) => {
    if (w.address.toLowerCase() !== manifest.cosigners[i].toLowerCase()) {
      throw new Error(`co-signer ${i + 1} derives to ${w.address}, manifest says ${manifest.cosigners[i]}`);
    }
  });
  return { burner, cosigners, provider };
}

async function send(label, txPromise) {
  const tx = await txPromise;
  const rcpt = await tx.wait();
  if (!rcpt || rcpt.status !== 1) throw new Error(`${label}: transaction failed (${tx.hash})`);
  log(`  ✓ ${label}  ${tx.hash}`);
  return rcpt;
}

/** 1-of-1 Safe tx where the owner is msg.sender: a "pre-validated" signature (v=1). */
async function execAsSafe(safe, owner, to, data, label) {
  L.assertNotProduction(await safe.getAddress(), to);
  const sig = ethers.concat([ethers.zeroPadValue(owner.address, 32), ethers.ZeroHash, "0x01"]);
  const tx = await safe
    .connect(owner)
    .execTransaction(to, 0, data, 0, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sig);
  const rcpt = await tx.wait();
  if (!rcpt || rcpt.status !== 1) throw new Error(`${label}: transaction failed (${tx.hash})`);
  // Safe does not revert on an inner failure; it emits ExecutionFailure.
  const safeAddr = (await safe.getAddress()).toLowerCase();
  const topics = rcpt.logs.filter((l) => l.address.toLowerCase() === safeAddr).map((l) => l.topics[0]);
  if (topics.includes(EXECUTION_FAILURE) || !topics.includes(EXECUTION_SUCCESS)) {
    throw new Error(`${label}: the Safe's inner call failed (${tx.hash})`);
  }
  log(`  ✓ ${label}  ${tx.hash}`);
  return rcpt;
}

/** The id of the batch with this type and root, or 0n. */
async function findBatch(registry, typeId, root) {
  const n = await registry.batchCount();
  for (let id = n; id >= 1n; id--) {
    const b = await registry.getBatch(id);
    if (b.typeId === typeId && b.root === root) return id;
  }
  return 0n;
}

async function main() {
  L.assertTestEnvOptIn();
  const manifest = L.loadManifest();
  const citizenAddr = manifest.contracts.citizenNFTv2;
  const attesterAddr = manifest.contracts.attesterNFTv2;
  const orgRegistryAddr = manifest.contracts.orgRegistry;
  const orgA = manifest.testOrgs?.A;
  if (!orgRegistryAddr || !orgA?.safe) throw new Error("test OrgRegistry / org A missing — run org-registry-e2e.cjs first");
  L.assertNotProduction(citizenAddr, attesterAddr, orgRegistryAddr, orgA.safe);

  const { burner, cosigners, provider } = await signers(manifest);
  if (cosigners.length < 4) throw new Error("need at least four co-signers");
  const net = await provider.getNetwork();
  // A Hardhat fork of Gnosis reports 31337; the code checks below prove it is a fork.
  const expected = REHEARSAL ? 31337n : 100n;
  if (net.chainId !== expected) throw new Error(`REFUSING: chain ${net.chainId}, expected ${expected}`);

  for (const [k, a] of [["CitizenNFTv2", citizenAddr], ["AttesterNFTv2", attesterAddr], ["OrgRegistry", orgRegistryAddr], ["org A Safe", orgA.safe]]) {
    if ((await provider.getCode(a)) === "0x") throw new Error(`test ${k} ${a} has no code on this chain`);
  }
  const orgs = new ethers.Contract(orgRegistryAddr, ["function isRegistered(bytes32) view returns (bool)"], provider);
  if (!(await orgs.isRegistered(orgA.orgId))) throw new Error(`test org A ${orgA.orgId} is not registered`);
  const safeA = new ethers.Contract(orgA.safe, SAFE_ABI, burner);
  const safeOwners = (await safeA.getOwners()).map((a) => a.toLowerCase());
  if (safeOwners.length !== 1 || safeOwners[0] !== burner.address.toLowerCase()) {
    throw new Error(`org A Safe owners are ${safeOwners}, expected only the burner`);
  }

  const nft = new ethers.Contract(citizenAddr, NFT_ABI, provider);
  const attNft = new ethers.Contract(attesterAddr, NFT_ABI, provider);
  const testCitizen = cosigners[0].address;
  const testAttester = cosigners[0].address;

  log(`mode:            ${REHEARSAL ? "REHEARSAL (Gnosis fork, impersonated)" : DRY ? "DRY RUN" : "LIVE on Gnosis"}`);
  log(`burner:          ${burner.address}`);
  log(`test sources:    citizen ${citizenAddr}, attester ${attesterAddr}, orgs ${orgRegistryAddr}`);
  log(`org A Safe:      ${orgA.safe} (owner = burner)`);
  if (DRY) {
    log(REHEARSAL ? "" : `burner balance:  ${ethers.formatEther(await provider.getBalance(burner.address))} xDAI`);
    log(`registry:        ${manifest.contracts.credentialRegistry && !FRESH ? `reuse ${manifest.contracts.credentialRegistry}` : "would deploy"}`);
    log("dry run: nothing sent.");
    return;
  }

  // 1. Registry
  const art = L.loadArtifact("CredentialRegistry");
  let registryAddr = manifest.contracts.credentialRegistry;
  if (FRESH && registryAddr) {
    manifest.credentialRegistryArchived = [...(manifest.credentialRegistryArchived ?? []), registryAddr];
    delete manifest.credentialRegistryE2E;
    registryAddr = undefined;
  }
  if (registryAddr && (await provider.getCode(registryAddr)) !== "0x") {
    log(`CredentialRegistry: reusing ${registryAddr}`);
  } else {
    log("CredentialRegistry: deploying");
    const factory = new ethers.ContractFactory(art.abi, art.bytecode, burner);
    const c = await factory.deploy(burner.address, citizenAddr, attesterAddr, orgRegistryAddr, RESERVED_URIS);
    const rcpt = await c.deploymentTransaction().wait();
    registryAddr = await c.getAddress();
    manifest.contracts.credentialRegistry = registryAddr;
    manifest.credentialRegistryDeployBlock = rcpt.blockNumber;
    log(`  ✓ CredentialRegistry ${registryAddr} (block ${rcpt.blockNumber})`);
    if (!REHEARSAL) L.saveManifest(manifest);
  }
  L.assertNotProduction(registryAddr);
  const registry = new ethers.Contract(registryAddr, art.abi, burner);
  const asC = (i) => registry.connect(cosigners[i]);

  // 2. Membership type for org A
  const typeId = await registry.typeIdOf(orgA.orgId, MEMBERSHIP_LOCAL);
  if (await registry.typeExists(typeId)) {
    log(`  • Membership type ${typeId} exists`);
  } else {
    const cfg = { metadataURI: MEMBERSHIP_URI, defaultValidity: 0, claimStart: 0, claimEnd: 0, supplyCap: 0, publicClaim: true };
    const data = registry.interface.encodeFunctionData("createType", [orgA.orgId, MEMBERSHIP_LOCAL, Kind.Membership, Policy.IssuerBatch, cfg]);
    await execAsSafe(safeA, burner, registryAddr, data, "org A: Safe creates a Membership type");
  }

  // 3. Batch of three leaves
  const key = claimKeyWallet();
  const leaves = {
    public: { kind: LeafKind.Account, typeId, subject: cosigners[0].address, validUntil: 0, salt: saltOf("public") },
    private: { kind: LeafKind.Account, typeId, subject: cosigners[1].address, validUntil: 0, salt: saltOf("private") },
    claimKey: { kind: LeafKind.ClaimKey, typeId, subject: key.address, validUntil: 0, salt: saltOf("claim-key") },
  };
  const t = tree([leaves.public, leaves.private, leaves.claimKey]);
  const h = Object.fromEntries(Object.entries(leaves).map(([k, l]) => [k, hashLeaf(l)]));
  for (const [k, l] of Object.entries(leaves)) {
    if ((await registry.leafHash(l)) !== h[k]) throw new Error(`leaf hash mismatch for ${k} (script vs contract)`);
  }
  let batchId = await findBatch(registry, typeId, t.root);
  if (batchId) {
    log(`  • batch #${batchId} exists`);
  } else {
    const data = registry.interface.encodeFunctionData("addBatch", [typeId, t.root, 3]);
    await execAsSafe(safeA, burner, registryAddr, data, "org A: Safe adds a batch of three leaves");
    batchId = await findBatch(registry, typeId, t.root);
    if (!batchId) throw new Error("batch not found after addBatch");
  }

  // 4. Claims
  const revokedPublic = await registry.leafRevoked(batchId, h.public);
  if (!revokedPublic && (await registry.leafBoundTo(batchId, h.public)) === ethers.ZeroAddress) {
    await send("co-signer 1 claims its account leaf publicly", asC(0).claim(batchId, leaves.public, t.proof(leaves.public), "0x"));
  }
  if ((await registry.leafBoundTo(batchId, h.claimKey)) === ethers.ZeroAddress) {
    const domain = { name: "CredentialRegistry", version: "1", chainId: net.chainId, verifyingContract: registryAddr };
    const types = { Claim: [{ name: "batchId", type: "uint64" }, { name: "leaf", type: "bytes32" }, { name: "account", type: "address" }] };
    const sig = await key.signTypedData(domain, types, { batchId, leaf: h.claimKey, account: cosigners[2].address });
    if (ethers.TypedDataEncoder.hash(domain, types, { batchId, leaf: h.claimKey, account: cosigners[2].address }) !== (await registry.claimDigest(batchId, h.claimKey, cosigners[2].address))) {
      throw new Error("claim digest mismatch (script vs contract)");
    }
    await send("co-signer 3 claims the claim-key leaf", asC(2).claim(batchId, leaves.claimKey, t.proof(leaves.claimKey), sig));
  }

  // 5. Revoke co-signer 1's leaf (burns its holding)
  if (!revokedPublic) {
    const data = registry.interface.encodeFunctionData("revokeLeaves", [batchId, [h.public]]);
    await execAsSafe(safeA, burner, registryAddr, data, "org A: Safe revokes co-signer 1's leaf");
  }

  // 6. Guest
  if (!(await registry.holds(GUEST_TYPE, cosigners[3].address))) {
    await send("co-signer 4 self-claims Guest", asC(3).selfClaim(GUEST_TYPE));
  }

  // 7. Assertions against the chain
  const [privStatus, privBound] = await registry.checkLeaf(batchId, leaves.private, t.proof(leaves.private));
  const [pubStatus] = await registry.checkLeaf(batchId, leaves.public, t.proof(leaves.public));
  const [keyStatus, keyBound] = await registry.checkLeaf(batchId, leaves.claimKey, t.proof(leaves.claimKey));
  const lc = (a) => a.toLowerCase();
  const checks = [
    ["owner is the burner", lc(await registry.owner()), lc(burner.address)],
    ["sources are the test contracts", [await registry.citizenNFT(), await registry.attesterNFT(), await registry.orgRegistry()].map(lc).join(","), [citizenAddr, attesterAddr, orgRegistryAddr].map(lc).join(",")],
    ["Membership type active", await registry.isTypeActive(typeId), true],
    ["type bound to the test OrgRegistry", lc(await registry.typeRegistryOf(typeId)), lc(orgRegistryAddr)],
    ["private leaf: checkLeaf Valid", LeafStatus[Number(privStatus)], "Valid"],
    ["private leaf: unbound, not held", `${privBound}|${await registry.holds(typeId, cosigners[1].address)}`, `${ethers.ZeroAddress}|false`],
    ["claim-key leaf: Valid, bound to co-signer 3", `${LeafStatus[Number(keyStatus)]}|${lc(keyBound)}`, `Valid|${lc(cosigners[2].address)}`],
    ["co-signer 3 holds Membership", await registry.holds(typeId, cosigners[2].address), true],
    ["co-signer 3 balanceOf = 1", Number(await registry.balanceOf(cosigners[2].address, BigInt(typeId))), 1],
    ["revoked leaf: checkLeaf Revoked", LeafStatus[Number(pubStatus)], "Revoked"],
    ["co-signer 1 no longer holds Membership", await registry.holds(typeId, cosigners[0].address), false],
    ["co-signer 1 holding burned", Number(await registry.balanceOf(cosigners[0].address, BigInt(typeId))), 0],
    ["Membership supply", Number((await registry.getType(typeId)).supply), 1],
    ["co-signer 4 holds Guest", await registry.holds(GUEST_TYPE, cosigners[3].address), true],
    ["test citizen holds Citizen", await registry.holds(CITIZEN_TYPE, testCitizen), true],
    ["  … matches CitizenNFTv2", await nft.hasCitizenNFT(testCitizen), true],
    ["test attester holds Attester", await registry.holds(ATTESTER_TYPE, testAttester), true],
    ["  … matches AttesterNFTv2", await attNft.hasAttesterNFT(testAttester), true],
    ["burner (no NFT) does not hold Citizen", await registry.holds(CITIZEN_TYPE, burner.address), await nft.hasCitizenNFT(burner.address)],
  ];
  let ok = true;
  for (const [name, got, want] of checks) {
    const pass = got === want;
    ok &&= pass;
    log(`  ${pass ? "✓" : "✗"} ${name}${pass ? "" : ` (got ${got}, want ${want})`}`);
  }
  if (!ok) throw new Error("post-conditions failed");

  manifest.credentialRegistryE2E = {
    ranAt: new Date().toISOString(),
    membershipType: typeId,
    membershipLocalId: MEMBERSHIP_LOCAL,
    org: orgA.orgId,
    batchId: Number(batchId),
    root: t.root,
    leaves: {
      publicClaimedThenRevoked: { subject: cosigners[0].address, leaf: h.public },
      privateValid: { subject: cosigners[1].address, leaf: h.private },
      claimKey: { key: key.address, leaf: h.claimKey, boundTo: cosigners[2].address },
    },
    guest: cosigners[3].address,
    holdsCitizen: testCitizen,
    holdsAttester: testAttester,
    reservedURIs: RESERVED_URIS,
  };
  if (REHEARSAL) {
    log("\nrehearsal complete — manifest NOT written.");
  } else {
    L.saveManifest(manifest);
    log(`\nmanifest updated: ${L.MANIFEST}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
