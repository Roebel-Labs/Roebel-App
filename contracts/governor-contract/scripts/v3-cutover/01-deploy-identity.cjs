/**
 * v3 cutover, step 1: deploy AttesterNFTv3 + CitizenNFTv3.
 *
 *  - Bands are READ from the live v2 contracts on-chain (not copied from a manifest), so v3
 *    starts with exactly the rules citizens know. Max: "Threshold bands stay as in v2."
 *  - Owner = NEW_ATTESTER_SAFE, set in the constructor (Ownable2Step). The deployer EOA
 *    never owns anything, so there is no handover step to forget.
 *  - NEW_ATTESTER_SAFE must be a Safe with threshold >= 3 and >= 5 owners, no modules and
 *    no EOA owners (Max: "at least 3-of-5"; spec security finding on 0x3A08 = 1-of-4 + EOA).
 *  - Writes deployments/gnosis-v3.json (or V3_MANIFEST).
 *
 * Fork rehearsal (preferred, see rehearse.cjs which runs 01→04 in one process):
 *   GNOSIS_FORK=1 npx hardhat run scripts/v3-cutover/rehearse.cjs
 * Mainnet (only after the rehearsal passed):
 *   DEPLOYER_PRIVATE_KEY=<fresh burner, from your shell> NEW_ATTESTER_SAFE=0x… \
 *   CONFIRM_MAINNET=yes-i-mean-it npx hardhat run scripts/v3-cutover/01-deploy-identity.cjs --network gnosis
 */
require("dotenv").config();
const hre = require("hardhat");
const L = require("./lib.cjs");

const BAND_ABI = "view returns (uint16 percentBps, uint16 floor, uint16 cap)";

async function readV2Bands(ethers, v2) {
  const att = new ethers.Contract(v2.addresses.attesterNFT, [
    `function approvalBand() ${BAND_ABI}`, `function rejectionBand() ${BAND_ABI}`,
    "function name() view returns (string)", "function symbol() view returns (string)",
    "function attesterCount() view returns (uint256)",
  ], ethers.provider);
  const cit = new ethers.Contract(v2.addresses.citizenNFT, [
    `function attestationAttesterBand() ${BAND_ABI}`, `function attestationCitizenBand() ${BAND_ABI}`,
    `function revocationAttesterBand() ${BAND_ABI}`, `function revocationCitizenBand() ${BAND_ABI}`,
    `function rejectionAttesterBand() ${BAND_ABI}`, `function rejectionCitizenBand() ${BAND_ABI}`,
    "function citizenCount() view returns (uint256)",
  ], ethers.provider);
  const b = (r) => [Number(r[0]), Number(r[1]), Number(r[2])];
  const out = {
    attesterName: await att.name(),
    attesterSymbol: await att.symbol(),
    attesterApproval: b(await att.approvalBand()),
    attesterRejection: b(await att.rejectionBand()),
    citizen: [
      b(await cit.attestationAttesterBand()), b(await cit.attestationCitizenBand()),
      b(await cit.revocationAttesterBand()), b(await cit.revocationCitizenBand()),
      b(await cit.rejectionAttesterBand()), b(await cit.rejectionCitizenBand()),
    ],
    v2AttesterCount: await att.attesterCount(),
    v2CitizenCount: await cit.citizenCount(),
  };
  // Cross-check with the frozen 2026-06-24 manifest: a difference means a band was changed
  // by a Safe tx since then. On-chain wins, but the operator must know.
  const m = v2.thresholds || {};
  const same = JSON.stringify([m.attesterApproval, m.attesterRejection, m.citizen]) ===
    JSON.stringify([out.attesterApproval, out.attesterRejection, out.citizen]);
  if (!same) console.warn("  ⚠️  v2 bands on-chain differ from gnosis-v2.json thresholds — using ON-CHAIN values.");
  return out;
}

async function run(hre, opts = {}) {
  const { ethers } = hre;
  const { chainId } = await L.guardChain(hre, "01-deploy-identity");
  const v2 = L.readJson(L.V2_MANIFEST);
  const safe = L.requireEnvAddress(hre, "NEW_ATTESTER_SAFE", opts.newAttesterSafe);
  if (safe === ethers.getAddress(v2.addresses.ownerSafe) && process.env.ALLOW_OLD_SAFE !== "yes") {
    throw new Error("NEW_ATTESTER_SAFE is the old 1-of-4 Safe 0x3A08…; D5 requires a NEW Safe.");
  }
  await L.assertAttesterSafe(hre, safe);

  const manifestPath = L.v3ManifestPath(opts);
  const bands = await readV2Bands(ethers, v2);
  console.log("  v2 bands (on-chain):", JSON.stringify({ att: [bands.attesterApproval, bands.attesterRejection], cit: bands.citizen }));
  console.log(`  v2 counts: attesters=${bands.v2AttesterCount} citizens=${bands.v2CitizenCount}`);

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  if (safe === deployerAddr) throw new Error("NEW_ATTESTER_SAFE must not be the deployer");
  const startBal = await ethers.provider.getBalance(deployerAddr);
  console.log("  deployer:", deployerAddr, "balance", ethers.formatEther(startBal));

  const A = await ethers.getContractFactory("AttesterNFTv3", deployer);
  const att = await A.deploy(safe, v2.addresses.attesterNFT, bands.attesterName, bands.attesterSymbol,
    bands.attesterApproval, bands.attesterRejection);
  await att.waitForDeployment();
  const attAddr = await att.getAddress();
  const attBlock = (await att.deploymentTransaction().wait()).blockNumber;
  console.log("  AttesterNFTv3 →", attAddr);

  const C = await ethers.getContractFactory("CitizenNFTv3", deployer);
  const cit = await C.deploy(attAddr, v2.addresses.citizenNFT, safe, bands.citizen);
  await cit.waitForDeployment();
  const citAddr = await cit.getAddress();
  console.log("  CitizenNFTv3  →", citAddr);

  // Post-deploy verification: owner, pending owner, v2 links, bands.
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const bandOf = async (c, f) => (await c[f]()).slice(0, 3).map(Number);
  const checks = {
    attOwner: ethers.getAddress(await att.owner()) === safe,
    citOwner: ethers.getAddress(await cit.owner()) === safe,
    attPending: (await att.pendingOwner()) === ethers.ZeroAddress,
    citPending: (await cit.pendingOwner()) === ethers.ZeroAddress,
    citAttesterLink: ethers.getAddress(await cit.attesterNFT()) === attAddr,
    attApproval: eq(await bandOf(att, "approvalBand"), bands.attesterApproval),
    attRejection: eq(await bandOf(att, "rejectionBand"), bands.attesterRejection),
    citBands: eq([
      await bandOf(cit, "attestationAttesterBand"), await bandOf(cit, "attestationCitizenBand"),
      await bandOf(cit, "revocationAttesterBand"), await bandOf(cit, "revocationCitizenBand"),
      await bandOf(cit, "rejectionAttesterBand"), await bandOf(cit, "rejectionCitizenBand"),
    ], bands.citizen),
    notFinalized: !(await att.bootstrapFinalized()) && !(await cit.bootstrapFinalized()),
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) throw new Error("post-deploy checks failed: " + failed.join(", "));
  console.log("  post-deploy checks OK:", Object.keys(checks).join(", "));

  const manifest = {
    chain: "gnosis",
    chainId: Number(chainId),
    version: "v3-passkey-migration",
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    owner: safe,
    note: "v3 identity: Ownable2Step (owner = new >=3-of-5 Attester Safe), bootstrapFromV2 (one-way finalize), " +
      "self-serve moveTo gated by legacy.isAdmin(new) (one-way window close). Bands copied from live v2 on-chain.",
    thresholds: { attesterApproval: bands.attesterApproval, attesterRejection: bands.attesterRejection, citizen: bands.citizen },
    addresses: {
      attesterNFT: attAddr,
      citizenNFT: citAddr,
      ownerSafe: safe,
      attesterNFTv2: v2.addresses.attesterNFT,
      citizenNFTv2: v2.addresses.citizenNFT,
    },
    identityDeployBlock: attBlock,
    status: { bootstrapFinalized: false, moveWindowClosed: false, governance: "not deployed (run 03)" },
  };
  L.writeJson(manifestPath, manifest);
  console.log("  gas spent:", ethers.formatEther(startBal - (await ethers.provider.getBalance(deployerAddr))), "xDAI");
  console.log("  wrote", manifestPath);
  console.log("  NEXT: 02-bootstrap-calldata.cjs (Safe signs the bootstrap batches).");
  return manifest;
}

module.exports = { run, readV2Bands };

if (require.main === module) {
  run(hre).catch((e) => { console.error(e); process.exit(1); });
}
