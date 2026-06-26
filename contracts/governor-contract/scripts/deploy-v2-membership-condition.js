// Deploy a fresh CitizenMembershipCondition gating on CitizenNFTv2, so the Röbel
// Circles group accepts v2 citizens (the v1-gated condition 0x10644F13 is immutable).
//
// Fork dry-run (validates the WHOLE fix against real Gnosis state):
//   GNOSIS_FORK=1 npx hardhat run scripts/deploy-v2-membership-condition.js --network hardhat
// Real deploy (burner signs; prints the Safe tx to swap the gate):
//   PRIVATE_KEY=<burner> npx hardhat run scripts/deploy-v2-membership-condition.js --network gnosis
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

const V2_NFT = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5"; // CitizenNFTv2
const GROUP = "0xAc2CeCdBead594F97358a0d3132454f24F3E470c";
const OLD_COND = "0x10644F137cDBE9Af5651C8607A6FBa8AfA5276f6"; // immutable v1 gate
const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa"; // group owner + v1 NFT owner
const SERVICE = "0xd5028284017A32C672CbD73Fe35aCD897bA874cf"; // group.service() = burner
const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const FAR_EXPIRY = 4102444800n;

async function main() {
  const isFork = hre.network.name === "hardhat";
  console.log("network:", hre.network.name, "| fork-mode:", isFork);

  const F = await ethers.getContractFactory("CitizenMembershipCondition");
  const cond = await F.deploy(V2_NFT);
  await cond.waitForDeployment();
  const condAddr = await cond.getAddress();
  console.log("Deployed CitizenMembershipCondition(v2) ->", condAddr);
  console.log("  citizenNFT() =", await cond.citizenNFT());

  const gIface = new ethers.Interface([
    "function setMembershipCondition(address _condition, bool _enabled)",
    "function trustBatchWithConditions(address[] _members, uint96 _expiry)",
  ]);
  const enableData = gIface.encodeFunctionData("setMembershipCondition", [condAddr, true]);
  const disableData = gIface.encodeFunctionData("setMembershipCondition", [OLD_COND, false]);
  console.log("\n=== SAFE TX (execute both from Safe " + SAFE + ", target = group " + GROUP + ") ===");
  console.log("  call 1 (enable v2 gate):  data:", enableData);
  console.log("  call 2 (disable v1 gate): data:", disableData);

  if (!isFork) {
    console.log("\nReal deploy complete. Run the two Safe calls above to swap the gate.");
    return;
  }

  // ---- FORK: prove the full fix end-to-end ----
  const prov = hre.network.provider;
  const impersonate = async (addr) => {
    await prov.request({ method: "hardhat_impersonateAccount", params: [addr] });
    await prov.request({ method: "hardhat_setBalance", params: [addr, "0x56BC75E2D63100000"] });
    return ethers.getSigner(addr);
  };

  const hub = new ethers.Contract(HUB, ["function isTrusted(address,address) view returns(bool)"], ethers.provider);
  const j = JSON.parse(fs.readFileSync("deployments/gnosis-v2.json", "utf8"));
  const stragglers = [];
  for (const c of j.holders.citizens) if (!(await hub.isTrusted(GROUP, c))) stragglers.push(c);
  console.log("\n[fork] stragglers (untrusted v2 citizens):", stragglers.length);

  const safe = await impersonate(SAFE);
  const groupAsSafe = new ethers.Contract(GROUP, ["function setMembershipCondition(address,bool)"], safe);
  await (await groupAsSafe.setMembershipCondition(condAddr, true)).wait();
  await (await groupAsSafe.setMembershipCondition(OLD_COND, false)).wait();
  console.log("[fork] gate swapped v1 -> v2");

  const svc = await impersonate(SERVICE);
  const groupAsSvc = new ethers.Contract(GROUP, ["function trustBatchWithConditions(address[],uint96)"], svc);
  await (await groupAsSvc.trustBatchWithConditions(stragglers, FAR_EXPIRY)).wait();
  console.log("[fork] trustBatchWithConditions(stragglers) succeeded");

  let ok = 0;
  for (const c of stragglers) if (await hub.isTrusted(GROUP, c)) ok++;
  console.log(`[fork] RESULT: ${ok}/${stragglers.length} stragglers now group-trusted ${ok === stragglers.length ? "✅ ALL" : "⚠️"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
