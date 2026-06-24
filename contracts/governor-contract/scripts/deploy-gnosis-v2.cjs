/**
 * Gnosis v2 deploy — fresh, Sybil-hardened identity layer (AttesterNFTv2 + CitizenNFTv2)
 * with scale-aware percentage-band thresholds, then migration-mint the FULL current
 * Roebel citizen/attester set (read from deployments/base-citizen-set.json, which includes
 * the post-snapshot Base stragglers), finalize, and hand ownership to the Safe.
 *
 *   1) BASE_RPC_URL=… node scripts/enumerate-citizens-base.cjs      # refresh the holder set
 *   2) DEPLOYER_PRIVATE_KEY=0x<burner> GNOSIS_RPC_URL=https://rpc.gnosischain.com \
 *        npx hardhat run scripts/deploy-gnosis-v2.cjs --network gnosis
 *
 * MACI core / SignUpTokenGatekeeper / Timelock / MaciAttesterGovernor are a SEPARATE
 * follow-on script (deploy-maci-gnosis-v2.cjs) so this identity layer can be validated first.
 *
 * Thresholds below are the values frozen 2026-06-24 (see the design doc). Band = [percentBps, floor, cap];
 * cap 65535 == "no cap"; a band [0, n, n] is a FIXED count of n.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const NO_CAP = 65535;

// --- AttesterNFTv2 bands ---
const ATT_APPROVAL_BAND = [5000, 3, 7];   // mint/revoke attester: 50%, floor 3, cap 7
const ATT_REJECTION_BAND = [5000, 3, 7];  // 50%, floor 3, cap 7

// --- CitizenNFTv2 thresholds (CitizenThresholds struct order) ---
const CITIZEN_THRESHOLDS = [
  [3000, 2, 7],         // attestationAttester  30%, floor 2, cap 7
  [0, 1, 1],            // attestationCitizen   FIXED 1  (adoption-critical: never scales with population)
  [6700, 3, NO_CAP],    // revocationAttester   67%, floor 3, NO cap  (anti-malicious-removal supermajority)
  [0, 1, 1],            // revocationCitizen    FIXED 1
  [2500, 2, 5],         // rejectionAttester    25%, floor 2, cap 5
  [2500, 2, 5],         // rejectionCitizen     25%, floor 2, cap 5
];
const VALIDITY_PERIOD = 0; // re-attestation expiry OFF at launch; turn on via governance once renewal UX ships

// Permanent owner: the Attester Safe on Gnosis (currently 3 owners, decentralizing).
const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";

async function deploy(name, signer, ...args) {
  const F = await hre.ethers.getContractFactory(name, signer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

function loadHolderSet() {
  const f = path.resolve(__dirname, "../deployments/base-citizen-set.json");
  if (!fs.existsSync(f)) {
    throw new Error("deployments/base-citizen-set.json missing — run scripts/enumerate-citizens-base.cjs first.");
  }
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  return { citizens: j.citizens, attesters: j.attesters, meta: j.counts, enumeratedAt: j.enumeratedAt };
}

async function main() {
  const { ethers, network } = hre;
  if (network.name !== "gnosis") throw new Error(`Refusing to run on "${network.name}" — expected "gnosis".`);

  const { citizens: rawC, attesters: rawA, meta, enumeratedAt } = loadHolderSet();
  const citizens = rawC.map((a) => ethers.getAddress(a));
  const attesters = rawA.map((a) => ethers.getAddress(a));
  if (citizens.length < 3 || attesters.length < 3) throw new Error("Need >=3 citizens and >=3 attesters.");

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startBal = await ethers.provider.getBalance(deployerAddr);

  // Founders must differ from the AttesterNFTv2 owner (constructor enforces it). The burner
  // is not a citizen/attester, so any 3 holders are valid founders.
  const attFounders = attesters.slice(0, 3);
  const citFounders = citizens.slice(0, 3);

  console.log("=== Gnosis v2 (Sybil-hardened) deploy ===");
  console.log("Holder set enumerated:", enumeratedAt, "| counts:", JSON.stringify(meta));
  console.log("Deployer/owner (burner):", deployerAddr, "| balance:", ethers.formatEther(startBal), "xDAI");
  console.log(`Citizens: ${citizens.length} | Attesters: ${attesters.length}`);

  console.log("\n[1/5] AttesterNFTv2…");
  const attesterNFT = await deploy(
    "AttesterNFTv2", deployer,
    deployerAddr, "Roebel Attester", "ROEBEL-ATTESTER", attFounders, ATT_APPROVAL_BAND, ATT_REJECTION_BAND
  );
  const attesterNFTAddr = await attesterNFT.getAddress();
  console.log("      →", attesterNFTAddr);

  console.log("[2/5] CitizenNFTv2…");
  const citizenNFT = await deploy(
    "CitizenNFTv2", deployer,
    attesterNFTAddr, deployerAddr, citFounders, CITIZEN_THRESHOLDS, VALIDITY_PERIOD
  );
  const citizenNFTAddr = await citizenNFT.getAddress();
  console.log("      →", citizenNFTAddr);

  console.log("[3/5] migrationMint full sets…");
  await (await attesterNFT.migrationMint(attesters)).wait();
  await (await citizenNFT.migrationMint(citizens)).wait();
  await (await attesterNFT.finalizeMigration()).wait();
  await (await citizenNFT.finalizeMigration()).wait();
  console.log("      → minted + finalized");

  console.log("[4/5] verifying counts…");
  let cOk = 0, aOk = 0;
  for (const a of citizens) if (await citizenNFT.hasCitizenNFT(a)) cOk++;
  for (const a of attesters) if (await attesterNFT.hasAttesterNFT(a)) aOk++;
  const cCount = await citizenNFT.citizenCount();
  const aCount = await attesterNFT.attesterCount();
  const finA = await attesterNFT.migrationFinalized();
  const finC = await citizenNFT.migrationFinalized();
  console.log(`      → citizens ${cOk}/${citizens.length} (count=${cCount}); attesters ${aOk}/${attesters.length} (count=${aCount}); finalized ${finA && finC}`);
  if (cOk !== citizens.length || aOk !== attesters.length || cCount !== BigInt(citizens.length) || !(finA && finC)) {
    throw new Error("Verification mismatch BEFORE ownership transfer — aborting (owner still burner).");
  }

  console.log("[5/5] transferOwnership → Safe", SAFE, "…");
  const safe = ethers.getAddress(SAFE);
  if ((await ethers.provider.getCode(safe)) === "0x") throw new Error(`Safe ${safe} has no code on Gnosis.`);
  await (await attesterNFT.transferOwnership(safe)).wait();
  await (await citizenNFT.transferOwnership(safe)).wait();
  if (ethers.getAddress(await attesterNFT.owner()) !== safe || ethers.getAddress(await citizenNFT.owner()) !== safe) {
    throw new Error("Ownership transfer did not land on the Safe.");
  }

  const out = {
    chain: "gnosis", chainId: 100, version: "v2-sybil-hardened",
    deployedAt: new Date().toISOString(), deployer: deployerAddr, owner: safe,
    note: "Sybil-hardened identity layer. Scale-aware %-band thresholds; revocation 67%/floor3 no-cap; "
      + "citizen co-sign fixed 1; re-attestation expiry OFF at launch (validityPeriod=0). migrationMint finalized.",
    thresholds: { attesterApproval: ATT_APPROVAL_BAND, attesterRejection: ATT_REJECTION_BAND, citizen: CITIZEN_THRESHOLDS, validityPeriod: VALIDITY_PERIOD },
    addresses: { attesterNFT: attesterNFTAddr, citizenNFT: citizenNFTAddr, ownerSafe: safe },
    holders: { citizens, attesters },
  };
  const outFile = path.resolve(__dirname, "../deployments/gnosis-v2.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

  console.log("\nGas spent:", ethers.formatEther(startBal - (await ethers.provider.getBalance(deployerAddr))), "xDAI");
  console.log("Written:", outFile);
  console.log("\nAddresses:\n  AttesterNFTv2:", attesterNFTAddr, "\n  CitizenNFTv2: ", citizenNFTAddr, "\n  Owner (Safe): ", safe);
  console.log("\nNEXT: deploy-maci-gnosis-v2.cjs (gatekeeper→CitizenNFTv2, Timelock, MaciAttesterGovernor), then re-wire apps.");
  console.log("=== DONE — burner can be swept. ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
