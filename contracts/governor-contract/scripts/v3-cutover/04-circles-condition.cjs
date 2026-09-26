/**
 * v3 cutover, step 4: Circles membership gate on CitizenNFTv3.
 *
 *  1. Deploys CitizenMembershipCondition(CitizenNFTv3) (contracts/verification-system/
 *     CitizenMembershipCondition.sol; the v2 one is 0x5850A045…, deployed by
 *     scripts/deploy-v2-membership-condition.js). The condition is immutable, so a new
 *     NFT needs a new condition.
 *  2. Writes ONE Safe Transaction Builder file for the Circles group OWNER (read on-chain,
 *     today the old Attester Safe 0x3A08…): setMembershipCondition(v3, true) and
 *     setMembershipCondition(<every currently enabled condition>, false) in one MultiSend,
 *     so the group is never gated on both (conditions are AND-ed: a citizen who moved to a
 *     Safe holds only v3 and would fail the v2 gate) and never on none.
 *
 * Execute the Safe file only AFTER the v3 bootstrap parts are executed (every current
 * citizen holds v3), otherwise trustBatchWithConditions rejects citizens that are not yet
 * bootstrapped. Existing group trust is not re-checked by the swap; it only gates new adds.
 * Spec D3: Circles itself migrates last; this step only re-points the gate.
 *
 *   npx hardhat run scripts/v3-cutover/04-circles-condition.cjs --network gnosis   (+ CONFIRM_MAINNET)
 */
require("dotenv").config();
const path = require("path");
const hre = require("hardhat");
const L = require("./lib.cjs");

const GROUP_ABI = [
  "function owner() view returns (address)",
  "function service() view returns (address)",
  "function getMembershipConditions() view returns (address[])",
  "function setMembershipCondition(address _condition, bool _enabled)",
];

async function run(hre, opts = {}) {
  const { ethers } = hre;
  await L.guardChain(hre, "04-circles-condition");
  const manifestPath = L.v3ManifestPath(opts);
  const v3 = L.readJson(manifestPath);
  const v2 = L.readJson(L.V2_MANIFEST);
  const CIT = ethers.getAddress(v3.addresses.citizenNFT);
  const groupAddr = ethers.getAddress(process.env.CIRCLES_GROUP || v2.addresses.circlesGroup);
  const group = new ethers.Contract(groupAddr, GROUP_ABI, ethers.provider);
  const groupOwner = ethers.getAddress(await group.owner());
  const current = (await group.getMembershipConditions()).map((a) => ethers.getAddress(a));
  console.log(`  group ${groupAddr}: owner ${groupOwner}, service ${await group.service()}, conditions [${current.join(", ")}]`);

  let condAddr = v3.addresses.circlesMembershipCondition;
  if (condAddr) {
    console.log("  reusing condition from manifest:", condAddr);
  } else {
    const [deployer] = await ethers.getSigners();
    const F = await ethers.getContractFactory("CitizenMembershipCondition", deployer);
    const cond = await F.deploy(CIT);
    await cond.waitForDeployment();
    condAddr = await cond.getAddress();
    console.log("  CitizenMembershipCondition(v3) →", condAddr);
  }
  const cond = await ethers.getContractAt("CitizenMembershipCondition", condAddr);
  if (ethers.getAddress(await cond.citizenNFT()) !== CIT) throw new Error("condition does not point at CitizenNFTv3");

  const iface = new ethers.Interface(GROUP_ABI);
  const txs = [{
    to: groupAddr, data: iface.encodeFunctionData("setMembershipCondition", [condAddr, true]),
    method: `setMembershipCondition(${condAddr}, true)`, note: "enable CitizenNFTv3 gate",
  }];
  for (const old of current) {
    if (old === ethers.getAddress(condAddr)) continue;
    txs.push({
      to: groupAddr, data: iface.encodeFunctionData("setMembershipCondition", [old, false]),
      method: `setMembershipCondition(${old}, false)`, note: "disable previous gate",
    });
  }
  const file = path.join(L.outDir(opts), "04-circles-swap-condition.json");
  L.writeJson(file, L.safeBatch({
    chainId: Number(process.env.SAFE_CHAIN_ID || 100),
    safe: groupOwner,
    name: "Circles: gate Röbel group on CitizenNFTv3",
    description: `Group ${groupAddr}: enable ${condAddr} (CitizenNFTv3), disable [${current.join(", ")}]. ` +
      "Execute only after every v3 bootstrap part is executed.",
    txs,
    extra: { step: "04-circles", group: groupAddr, groupOwner, previousConditions: current, newCondition: condAddr },
  }));

  const out = L.readJson(manifestPath);
  out.addresses.circlesMembershipCondition = condAddr;
  out.addresses.circlesGroup = groupAddr;
  out.circles = { groupOwnerAtDeploy: groupOwner, previousConditions: current, swapSafeTx: path.basename(file) };
  L.writeJson(manifestPath, out);
  console.log("  wrote", file, `(signer: group owner Safe ${groupOwner})`);
  return { condition: condAddr, file, groupOwner, previous: current };
}

module.exports = { run };

if (require.main === module) {
  run(hre).catch((e) => { console.error(e); process.exit(1); });
}
