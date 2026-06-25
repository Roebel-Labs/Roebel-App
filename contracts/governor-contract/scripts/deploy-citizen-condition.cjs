/**
 * Deploy CitizenMembershipCondition on Gnosis — the CitizenNFT gate for the Röbel
 * Circles group (only citizens can join → only citizens convert CRC → Röbel-Taler).
 *
 *   DEPLOYER_PRIVATE_KEY=0x<burner> GNOSIS_RPC_URL=https://rpc.gnosischain.com \
 *     pnpm hardhat run scripts/deploy-citizen-condition.cjs --network gnosis
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// CitizenNFTv2 (Sybil-hardened, 2026-06-25; supersedes v1 0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4).
const CITIZEN_NFT_GNOSIS = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5";

async function main() {
  const { ethers, network } = hre;
  if (network.name !== "gnosis") throw new Error(`expected gnosis, got ${network.name}`);
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const F = await ethers.getContractFactory("CitizenMembershipCondition", deployer);
  const c = await F.deploy(CITIZEN_NFT_GNOSIS);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("\n✓ CitizenMembershipCondition:", addr);

  // sanity: it passes for a known citizen, fails for the zero address
  const sample = "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28"; // a citizen
  console.log("  passes(citizen):", await c.passesMembershipCondition(sample));
  console.log("  passes(0xdead):", await c.passesMembershipCondition("0x000000000000000000000000000000000000dEaD"));

  const outFile = path.resolve(__dirname, "../deployments/gnosis.json");
  const j = JSON.parse(fs.readFileSync(outFile, "utf8"));
  j.addresses.citizenMembershipCondition = addr;
  fs.writeFileSync(outFile, JSON.stringify(j, null, 2));
  console.log("\nWritten to deployments/gnosis.json");
  console.log("Next: register the Röbel group with initialConditions=[" + addr + "]");
}

main().catch((e) => { console.error(e); process.exit(1); });
