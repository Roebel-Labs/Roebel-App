/**
 * NSP-14 R1 — deploy OrgRegistry into the ONCHAIN TEST ENVIRONMENT and drive the
 * full org lifecycle with real Safe 1.4.1 accounts on Gnosis mainnet.
 *
 *   1. Deploy OrgRegistry (owner = burner, attester set = the TEST AttesterNFTv2).
 *   2. Deploy two Safes (1-of-1, owner = burner) through the canonical factory.
 *   3. Org A: Safe requests registration → co-signers approve → Safe authorises a
 *      Nostr key and sets an admin role.
 *   4. Org B: registered the same way, then revoked by co-signer attesters.
 *   5. Assert every view, and write the result into deployments/gnosis-test.json.
 *
 * Idempotent: an existing manifest `orgRegistry` is reused, and finished steps are
 * skipped, so a run interrupted by a flaky RPC can simply be restarted.
 *
 * Real run (needs the burner key in .env; refuses unless it IS the manifest owner):
 *   ROEBEL_TEST_ENV=1 node scripts/test-env/org-registry-e2e.cjs [--dry-run] [--fresh]
 *
 * Rehearsal on a Gnosis fork (no key; impersonates the burner + co-signers):
 *   ORG_E2E_REHEARSAL=1 GNOSIS_FORK=1 ROEBEL_TEST_ENV=1 npx hardhat run scripts/test-env/org-registry-e2e.cjs
 */
const { ethers } = require("ethers");
const L = require("./lib.cjs");

const DRY = process.argv.includes("--dry-run");
// --fresh: deploy a new registry even if the manifest has one (after a contract change).
const FRESH = process.argv.includes("--fresh") || process.env.ORG_E2E_FRESH === "1";
const REHEARSAL = process.env.ORG_E2E_REHEARSAL === "1";

// Safe 1.4.1 canonical deployments — the same ones the passkey stack uses.
const SAFE = {
  singletonL2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
};
const SAFE_ABI = [
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
  "function getOwners() view returns (address[])",
  "event ExecutionFailure(bytes32 txHash, uint256 payment)",
];
const FACTORY_ABI = [
  "function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns (address)",
  "function proxyCreationCode() pure returns (bytes)",
  "event ProxyCreation(address indexed proxy, address singleton)",
];

// NSP-14 canonical ids for two fixed test uuids (orgIdFromUuid in @netizen-labs/protocol).
const ORG_ID_PREFIX = "netizen:org:v1:";
const TEST_ORGS = {
  A: { uuid: "00000000-0000-4000-8000-0000000000a1", saltNonce: 14001n },
  B: { uuid: "00000000-0000-4000-8000-0000000000b2", saltNonce: 14002n },
};
const orgIdOf = (uuid) => ethers.id(ORG_ID_PREFIX + uuid);
const TEST_NOSTR_KEY = ethers.id("netizen:org:v1:test-env:nostr-key-a");

// Design defaults (spec §2): approval 50%/2/5, rejection 25%/2/5, revocation 67%/3/no cap.
const BANDS = {
  approval: { percentBps: 5000, floor: 2, cap: 5 },
  rejection: { percentBps: 2500, floor: 2, cap: 5 },
  revocation: { percentBps: 6700, floor: 3, cap: L.NO_CAP },
};

const Role = { Admin: 2 };
const Status = ["Pending", "Rejected", "Executed"];

function log(...a) {
  console.log(...a);
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
    throw new Error(
      `REFUSING: DEPLOYER_PRIVATE_KEY is ${burner.address}, not the test-env owner ${manifest.owner}.`,
    );
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
  const sig = ethers.concat([ethers.zeroPadValue(owner.address, 32), ethers.ZeroHash, "0x01"]);
  const rcpt = await send(
    label,
    safe.connect(owner).execTransaction(to, 0, data, 0, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sig),
  );
  // Safe does not revert on an inner failure; it emits ExecutionFailure.
  const failed = rcpt.logs.some((l) => {
    try {
      return safe.interface.parseLog(l)?.name === "ExecutionFailure";
    } catch {
      return false;
    }
  });
  if (failed) throw new Error(`${label}: the Safe's inner call reverted`);
  return rcpt;
}

async function deploySafe(burner, saltNonce) {
  const safeIface = new ethers.Interface(SAFE_ABI);
  const initializer = safeIface.encodeFunctionData("setup", [
    [burner.address],
    1,
    ethers.ZeroAddress,
    "0x",
    SAFE.fallbackHandler,
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);
  const factory = new ethers.Contract(SAFE.proxyFactory, FACTORY_ABI, burner);
  // Deterministic CREATE2 (SafeProxyFactory 1.4.1): same initializer + nonce → same
  // address, so a rerun finds the Safe it already deployed.
  const salt = ethers.keccak256(ethers.solidityPacked(["bytes32", "uint256"], [ethers.keccak256(initializer), saltNonce]));
  const initCode = ethers.concat([await factory.proxyCreationCode(), ethers.zeroPadValue(SAFE.singletonL2, 32)]);
  const predicted = ethers.getCreate2Address(SAFE.proxyFactory, salt, ethers.keccak256(initCode));
  if ((await burner.provider.getCode(predicted)) !== "0x") return predicted;
  const rcpt = await send(`deploy Safe (nonce ${saltNonce})`, factory.createProxyWithNonce(SAFE.singletonL2, initializer, saltNonce));
  const ev = rcpt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "ProxyCreation");
  if (!ev) throw new Error("no ProxyCreation event");
  if (ev.args.proxy.toLowerCase() !== predicted.toLowerCase()) throw new Error(`Safe landed at ${ev.args.proxy}, predicted ${predicted}`);
  return ev.args.proxy;
}

/** Vote with co-signers that are attesters, haven't voted, and don't co-own the Safe. */
async function driveQuorum(registry, requestId, cosigners, attesterNft) {
  for (const c of cosigners) {
    const req = await registry.getRequest(requestId);
    if (Status[Number(req.status)] !== "Pending") break;
    if (!(await attesterNft.hasAttesterNFT(c.address))) continue;
    if (await registry.hasVoted(requestId, c.address)) continue;
    if (await registry.isOrgOwner(req.orgId, c.address)) continue;
    await send(`approve #${requestId} as ${c.address.slice(0, 8)}…`, registry.connect(c).approveRequest(requestId));
  }
  const final = await registry.getRequest(requestId);
  if (Status[Number(final.status)] !== "Executed") {
    throw new Error(`request #${requestId} is ${Status[Number(final.status)]} with ${final.approvals}/${final.requiredApprovals} approvals`);
  }
}

async function ensureRegistered(registry, safe, burner, key, cosigners, attesterNft) {
  const orgId = orgIdOf(TEST_ORGS[key].uuid);
  if (await registry.isRegistered(orgId)) {
    log(`  • org ${key} already registered`);
    return orgId;
  }
  const [open, openId] = await registry.openRegistrationOf(await safe.getAddress());
  let requestId = openId;
  if (!open) {
    const data = registry.interface.encodeFunctionData("requestRegistration", [orgId, `netizen-test://org/${key}`]);
    await execAsSafe(safe, burner, await registry.getAddress(), data, `org ${key}: Safe requests registration`);
    requestId = (await registry.requestCount()) - 1n;
  }
  await driveQuorum(registry, requestId, cosigners, attesterNft);
  return orgId;
}

async function main() {
  L.assertTestEnvOptIn();
  const manifest = L.loadManifest();
  const attesterAddr = manifest.contracts.attesterNFTv2;
  L.assertNotProduction(attesterAddr);

  const { burner, cosigners, provider } = await signers(manifest);
  const net = await provider.getNetwork();
  // A Hardhat fork of Gnosis reports 31337; the Safe-code check below proves it is a fork.
  const expected = REHEARSAL ? 31337n : 100n;
  if (net.chainId !== expected) throw new Error(`REFUSING: chain ${net.chainId}, expected ${expected}`);

  const art = L.loadArtifact("OrgRegistry");
  const attesterNft = new ethers.Contract(
    attesterAddr,
    ["function hasAttesterNFT(address) view returns (bool)", "function attesterCount() view returns (uint256)"],
    provider,
  );
  const attesterCount = await attesterNft.attesterCount();
  const cosignerAttesters = (await Promise.all(cosigners.map((c) => attesterNft.hasAttesterNFT(c.address)))).filter(Boolean).length;
  const revokeNeeds = Math.max(3, Math.ceil((Number(attesterCount) * 6700) / 10000));

  log(`mode:            ${REHEARSAL ? "REHEARSAL (Gnosis fork, impersonated)" : DRY ? "DRY RUN" : "LIVE on Gnosis"}`);
  log(`burner:          ${burner.address}`);
  log(`test attesters:  ${attesterCount} (co-signers holding one: ${cosignerAttesters})`);
  log(`revocation needs ${revokeNeeds} attester votes`);
  if (cosignerAttesters < revokeNeeds) {
    throw new Error("co-signers cannot reach the revocation band — see ONCHAIN_TEST_ENVIRONMENT.md gotchas");
  }
  for (const [k, a] of Object.entries(SAFE)) {
    if ((await provider.getCode(a)) === "0x") throw new Error(`Safe ${k} ${a} has no code on this chain`);
  }
  if (DRY) {
    log(REHEARSAL ? "" : `burner balance:  ${ethers.formatEther(await provider.getBalance(burner.address))} xDAI`);
    log("dry run: nothing sent.");
    return;
  }

  // 1. Registry
  let registryAddr = manifest.contracts.orgRegistry;
  if (FRESH && registryAddr) {
    manifest.orgRegistryArchived = [...(manifest.orgRegistryArchived ?? []), registryAddr];
    delete manifest.testOrgs;
    registryAddr = undefined;
  }
  if (registryAddr && (await provider.getCode(registryAddr)) !== "0x") {
    log(`OrgRegistry: reusing ${registryAddr}`);
  } else {
    log("OrgRegistry: deploying");
    const factory = new ethers.ContractFactory(art.abi, art.bytecode, burner);
    const c = await factory.deploy(burner.address, attesterAddr, BANDS.approval, BANDS.rejection, BANDS.revocation);
    const rcpt = await c.deploymentTransaction().wait();
    registryAddr = await c.getAddress();
    manifest.contracts.orgRegistry = registryAddr;
    manifest.orgRegistryDeployBlock = rcpt.blockNumber;
    log(`  ✓ OrgRegistry ${registryAddr} (block ${rcpt.blockNumber})`);
    if (!REHEARSAL) L.saveManifest(manifest);
  }
  L.assertNotProduction(registryAddr);
  const registry = new ethers.Contract(registryAddr, art.abi, burner);

  // 2. Safes
  const safeA = new ethers.Contract(await deploySafe(burner, TEST_ORGS.A.saltNonce), SAFE_ABI, burner);
  const safeB = new ethers.Contract(await deploySafe(burner, TEST_ORGS.B.saltNonce), SAFE_ABI, burner);
  log(`Safe A: ${await safeA.getAddress()}\nSafe B: ${await safeB.getAddress()}`);

  // 3. Org A — register, key, role
  const orgA = await ensureRegistered(registry, safeA, burner, "A", cosigners, attesterNft);
  if (!(await registry.isNostrKeyAuthorized(orgA, TEST_NOSTR_KEY))) {
    const data = registry.interface.encodeFunctionData("setNostrKey", [orgA, TEST_NOSTR_KEY, true]);
    await execAsSafe(safeA, burner, registryAddr, data, "org A: Safe authorises a Nostr key");
  }
  if (Number(await registry.roleOf(orgA, cosigners[0].address)) !== Role.Admin) {
    const data = registry.interface.encodeFunctionData("setRole", [orgA, cosigners[0].address, Role.Admin]);
    await execAsSafe(safeA, burner, registryAddr, data, "org A: Safe makes co-signer 1 an admin");
  }

  // 4. Org B — register, then revoke
  const orgB = orgIdOf(TEST_ORGS.B.uuid);
  const revokedBefore = !!manifest.testOrgs?.B?.revoked;
  if (!revokedBefore) {
    await ensureRegistered(registry, safeB, burner, "B", cosigners, attesterNft);
    const [open, openId] = await registry.openRevocationOf(orgB);
    let rid = openId;
    if (!open) {
      await send("org B: attester opens revocation", registry.connect(cosigners[0]).requestRevocation(orgB, "netizen-test://revoke/B"));
      rid = (await registry.requestCount()) - 1n;
    }
    await driveQuorum(registry, rid, cosigners, attesterNft);
  }

  // 5. Assertions against the chain
  const safeAAddr = await safeA.getAddress();
  const checks = [
    ["org A registered", await registry.isRegistered(orgA), true],
    ["org A NFT held by Safe A", (await registry.ownerOf(BigInt(orgA))).toLowerCase(), safeAAddr.toLowerCase()],
    ["org A key authorised", await registry.isNostrKeyAuthorized(orgA, TEST_NOSTR_KEY), true],
    ["co-signer 1 is admin of A", Number(await registry.roleOf(orgA, cosigners[0].address)), Role.Admin],
    ["burner owns A (live from Safe)", await registry.isOrgOwner(orgA, burner.address), true],
    ["org B revoked", await registry.isRegistered(orgB), false],
    ["org count", Number(await registry.orgCount()), 1],
  ];
  let ok = true;
  for (const [name, got, want] of checks) {
    const pass = got === want;
    ok &&= pass;
    log(`  ${pass ? "✓" : "✗"} ${name}${pass ? "" : ` (got ${got}, want ${want})`}`);
  }
  if (!ok) throw new Error("post-conditions failed");

  manifest.testOrgs = {
    A: { uuid: TEST_ORGS.A.uuid, orgId: orgA, safe: safeAAddr, nostrKey: TEST_NOSTR_KEY, admin: cosigners[0].address },
    B: { uuid: TEST_ORGS.B.uuid, orgId: orgB, safe: await safeB.getAddress(), revoked: true },
  };
  manifest.orgRegistryBands = BANDS;
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
