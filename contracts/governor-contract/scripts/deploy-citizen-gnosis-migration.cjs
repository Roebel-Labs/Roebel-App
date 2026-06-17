/**
 * Gnosis Phase 0 (minimal): deploy AttesterNFT + CitizenNFT on Gnosis Chain and
 * migration-mint the existing Röbel citizen/attester set (read from Base).
 *
 *   DEPLOYER_PRIVATE_KEY=0x<burner> GNOSIS_RPC_URL=https://rpc.gnosischain.com \
 *     pnpm hardhat run scripts/deploy-citizen-gnosis-migration.cjs --network gnosis
 *
 * Design:
 *  - NFT owner = the deployer (burner) so it can run the one-shot migrationMint,
 *    then finalizeMigration() permanently disables bulk-mint. Ownership is later
 *    transferred to the real Safe (once that Safe is deployed + verified on Gnosis).
 *  - The full governance stack (gatekeeper/timelock/governor/MACI) is a separate
 *    Phase 0 step and is intentionally NOT deployed here.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Authoritative holder sets, read from the live Base production contracts
// (scripts/circles/enumerate-v2.ts). 15 citizens, 5 attesters (attesters ⊂ citizens).
const CITIZENS = [
  "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28",
  "0x90F677dC480e76a127Ec1dCE42263a370e396313",
  "0xf468d87FCa0E15bC2c383eF482D38b9b77812b29",
  "0xCa598EcD6541177897c7a30cE378e53F5557e951",
  "0xD7cA07c0F152fC27F0E48d5326e07026e4fDD4bA",
  "0x3B49287F15F5605036d135A296C2bAC2aFbFA24c",
  "0xEbf3C1694FBD80b1a7ab8F82e19A1291Cd795227",
  "0x466587C1102a99726b2751712c69338cf0401f43",
  "0x5Ddf5ee5ac3b5DeB9eae2920E71997e2a07A406B",
  "0xa6B3defbBe135f3fcE045e59b3e984c23d43E5a8",
  "0x1a3cD237400b032DCfB3d45Ef694674f2dEcdee0",
  "0x2645530306321e4758FF93559A4F44a826C6EfA6",
  "0x1916bAC01118EE53A7F7eca0F312431b68011Ce4",
  "0xd1A7d945fCCa08f67E30E526E34cf4Aaa2725D03",
  "0x0e9C37cfc94E1BAFCd53450998Cc26d10A6b5D20",
];
const ATTESTERS = [
  "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28",
  "0x90F677dC480e76a127Ec1dCE42263a370e396313",
  "0xf468d87FCa0E15bC2c383eF482D38b9b77812b29",
  "0xD7cA07c0F152fC27F0E48d5326e07026e4fDD4bA",
  "0x3B49287F15F5605036d135A296C2bAC2aFbFA24c",
];

// Permanent owner: the 3-of-5 Attester Safe on Gnosis (deployed + verified, 171-byte proxy).
const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";

async function deployContract(name, signer, ...args) {
  const F = await hre.ethers.getContractFactory(name, signer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function main() {
  const { ethers, network } = hre;
  if (network.name !== "gnosis") {
    throw new Error(`Refusing to run on "${network.name}" — expected "gnosis".`);
  }
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startBal = await ethers.provider.getBalance(deployerAddr);

  const citizens = CITIZENS.map((a) => ethers.getAddress(a));
  const attesters = ATTESTERS.map((a) => ethers.getAddress(a));
  // Founders must differ from the AttesterNFT owner (constructor requires it);
  // the burner is not a citizen/attester, so any 3 holders are valid founders.
  const attFounders = attesters.slice(0, 3);
  const citFounders = citizens.slice(0, 3);

  console.log("=== Gnosis migration deploy ===");
  console.log("Deployer/owner (burner):", deployerAddr);
  console.log("Balance:", ethers.formatEther(startBal), "xDAI");
  console.log("Citizens:", citizens.length, "| Attesters:", attesters.length);

  // 1) AttesterNFT (owner = burner; 2-of-5 signatures, 2 rejections)
  console.log("\n[1/4] AttesterNFT…");
  const attesterNFT = await deployContract(
    "AttesterNFT", deployer,
    deployerAddr, "Roebel Attester", "ROEBEL-ATTESTER", attFounders, 2, 2,
  );
  const attesterNFTAddr = await attesterNFT.getAddress();
  console.log("      →", attesterNFTAddr);

  // 2) CitizenNFT (owner = burner; 1+1 attestation/revocation/rejection thresholds)
  console.log("[2/4] CitizenNFT…");
  const citizenNFT = await deployContract(
    "CitizenNFT", deployer,
    attesterNFTAddr, deployerAddr, citFounders, 1, 1, 1, 1, 1, 1,
  );
  const citizenNFTAddr = await citizenNFT.getAddress();
  console.log("      →", citizenNFTAddr);

  // 3) migrationMint the full sets (founders already minted are skipped)
  console.log("[3/4] migrationMint…");
  await (await attesterNFT.migrationMint(attesters)).wait();
  await (await citizenNFT.migrationMint(citizens)).wait();
  await (await attesterNFT.finalizeMigration()).wait();
  await (await citizenNFT.finalizeMigration()).wait();
  console.log("      → minted + finalized (bulk-mint now permanently disabled)");

  // 4) verify counts on-chain
  console.log("[4/4] verifying…");
  let cOk = 0, aOk = 0;
  for (const a of citizens) if (await citizenNFT.hasCitizenNFT(a)) cOk++;
  for (const a of attesters) if (await attesterNFT.hasAttesterNFT(a)) aOk++;
  const finA = await attesterNFT.migrationFinalized();
  const finC = await citizenNFT.migrationFinalized();
  console.log(`      → citizens minted: ${cOk}/${citizens.length}; attesters: ${aOk}/${attesters.length}; finalized: ${finA && finC}`);
  if (cOk !== citizens.length || aOk !== attesters.length || !(finA && finC)) {
    throw new Error("Verification mismatch BEFORE ownership transfer — aborting, owner still burner.");
  }

  // 5) Hand ownership to the permanent Safe (now deployed + verified on Gnosis).
  const safe = ethers.getAddress(SAFE);
  const safeCode = await ethers.provider.getCode(safe);
  if (safeCode === "0x") throw new Error(`Safe ${safe} has no code on Gnosis — refusing to transfer ownership.`);
  console.log("[5/5] transferOwnership → Safe", safe, "…");
  await (await attesterNFT.transferOwnership(safe)).wait();
  await (await citizenNFT.transferOwnership(safe)).wait();
  const ownA = await attesterNFT.owner();
  const ownC = await citizenNFT.owner();
  console.log(`      → AttesterNFT.owner()=${ownA}; CitizenNFT.owner()=${ownC}`);
  if (ethers.getAddress(ownA) !== safe || ethers.getAddress(ownC) !== safe) {
    throw new Error("Ownership transfer did not land on the Safe — investigate.");
  }

  const out = {
    chain: "gnosis", chainId: 100, deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    owner: safe,
    note: "Owner = 3-of-5 Attester Safe on Gnosis. migrationMint finalized (bulk-mint permanently disabled). Burner is now safe to delete.",
    addresses: { attesterNFT: attesterNFTAddr, citizenNFT: citizenNFTAddr, ownerSafe: safe },
    holders: { citizens, attesters },
  };
  const outFile = path.resolve(__dirname, "../deployments/gnosis.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

  const endBal = await ethers.provider.getBalance(deployerAddr);
  console.log("\nGas spent:", ethers.formatEther(startBal - endBal), "xDAI");
  console.log("Written:", outFile);
  console.log("\nAddresses:");
  console.log("  AttesterNFT:", attesterNFTAddr);
  console.log("  CitizenNFT: ", citizenNFTAddr);
  console.log("  Owner (both):", safe, "(3-of-5 Safe)");
  console.log("\nOwnership handed to the Safe and migration finalized → the burner can now be deleted.");
  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
