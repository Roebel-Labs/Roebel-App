/**
 * Governor-only redeploy on Gnosis — change the voting period (e.g. 1h → 1 week)
 * WITHOUT touching the MACI identity layer, so NO citizen re-signup is needed.
 *
 * Why this is safe to do without redeploying MACI:
 *   - MACI.deployPoll is `public virtual` with NO access control (permissionless),
 *     so a brand-new Governor can drive the EXISTING MACI core (0x6663…) directly.
 *   - We reuse the live verifier / vkRegistry / treeDepths / coordinatorPubKey
 *     verbatim, so polls the new Governor deploys are byte-for-byte compatible
 *     with the live MACI + the Shamir coordinator that already holds the key.
 *   - `votingPeriod` is `onlyGovernance` on the deployed Governor (no admin
 *     setter), so a redeploy is the only way to change it before proposal #1.
 *
 * What it does:
 *   1. Deploys a fresh TimelockController (Governor._executor is immutable, and
 *      the old timelock renounced its admin so its roles can't be re-granted).
 *   2. Deploys a fresh MaciAttesterGovernor — identical to the live one except
 *      votingPeriod = VOTING_PERIOD_SECONDS (read from .env).
 *   3. Grants PROPOSER/CANCELLER on the new timelock to the new governor and
 *      renounces the deployer's admin role.
 *   4. Merges the new governor + timelock into deployments/gnosis-v2.json,
 *      archiving the previous addresses. MACI/NFTs/coordinator are untouched.
 *
 *   pnpm hardhat run scripts/redeploy-governor-only-gnosis.cjs --network gnosis
 *
 * AFTER it runs (frontend cutover — separate code change):
 *   - apps/web/src/lib/contracts.ts  → MACI_GOVERNOR_ADDRESS
 *   - apps/expo governor constant
 *   - packages/blockchain governor export
 *   - verify the coordinator's GOVERNOR_ADDRESS env (poll↔proposal mapping).
 *     MACI_ADDRESS is UNCHANGED, so no coordinator key/MACI update is needed.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// MUST match the live MACI/vkRegistry configuration (from deploy-maci-gnosis-v2.cjs).
const INT_STATE_TREE_DEPTH = 5;
const MESSAGE_TREE_DEPTH = 9;
const MESSAGE_BATCH_DEPTH = 2; // == messageTreeSubDepth
const VOTE_OPTION_TREE_DEPTH = 3;
const MODE_NON_QV = 1;

const DEPLOYMENTS = path.resolve(__dirname, "../deployments/gnosis-v2.json");

async function deployContract(name, signer, ...args) {
  const F = await hre.ethers.getContractFactory(name, signer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function main() {
  const { ethers, network } = hre;
  if (network.name !== "gnosis" && network.name !== "hardhat") {
    throw new Error(`Refusing to deploy to "${network.name}" — expected "gnosis" (or "hardhat" for a fork dry-run).`);
  }

  const votingPeriod = process.env.VOTING_PERIOD_SECONDS;
  if (!votingPeriod || votingPeriod === "0") {
    throw new Error("VOTING_PERIOD_SECONDS is not set in .env");
  }

  const j = JSON.parse(fs.readFileSync(DEPLOYMENTS, "utf8"));
  const a = j.addresses;
  const p = j.parameters || {};
  for (const k of ["attesterNFT", "citizenNFT", "maci", "verifier", "vkRegistry", "coordinator", "maciAttesterGovernor", "timelock"]) {
    if (!a[k]) throw new Error(`gnosis-v2.json missing addresses.${k}`);
  }
  if (!p.coordinatorPubKey || !p.coordinatorPubKey.x || !p.coordinatorPubKey.y) {
    throw new Error("gnosis-v2.json missing parameters.coordinatorPubKey");
  }

  // Preserve every governor parameter EXCEPT votingPeriod.
  const timelockMinDelay = BigInt(p.timelockMinDelay ?? 3600);
  const quorumPercentage = BigInt(p.quorumPercentage ?? 10);
  const quorumAbsolute = BigInt(p.quorumAbsolute ?? 2);
  const tallyGracePeriod = BigInt(p.tallyGracePeriod ?? 604800);

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startBal = await ethers.provider.getBalance(deployerAddr);

  console.log("=== Governor-only redeploy on Gnosis (reuse MACI; change votingPeriod) ===");
  console.log("Deployer:           ", deployerAddr, "| balance:", ethers.formatEther(startBal), "xDAI");
  console.log("Reusing MACI:       ", a.maci, "(permissionless deployPoll → no re-signup)");
  console.log("Reusing verifier:   ", a.verifier);
  console.log("Reusing vkRegistry: ", a.vkRegistry);
  console.log("Reusing coordinator:", a.coordinator);
  console.log("Old governor:       ", a.maciAttesterGovernor);
  console.log("Old timelock:       ", a.timelock);
  console.log("");
  console.log("votingPeriod:       ", votingPeriod, "s  (" + (Number(votingPeriod) / 86400).toFixed(2) + " days)");
  console.log("Unchanged:          quorum " + quorumPercentage + "%/abs " + quorumAbsolute +
    ", tallyGrace " + tallyGracePeriod + "s, timelockMinDelay " + timelockMinDelay + "s\n");

  // 1) Fresh Timelock.
  console.log("[1/2] TimelockController(minDelay=" + timelockMinDelay + ")…");
  const timelock = await deployContract(
    "TimelockController", deployer,
    timelockMinDelay, [], [ethers.ZeroAddress], deployerAddr,
  );
  const timelockAddr = await timelock.getAddress();
  console.log("      →", timelockAddr);

  // 2) Fresh Governor — identical to live except votingPeriod.
  console.log("[2/2] MaciAttesterGovernor(votingPeriod=" + votingPeriod + ")…");
  const governor = await deployContract("MaciAttesterGovernor", deployer, {
    attesterNFT: a.attesterNFT,
    citizenNFT: a.citizenNFT,
    maci: a.maci,
    verifier: a.verifier,
    vkRegistry: a.vkRegistry,
    coordinator: a.coordinator,
    coordinatorPubKey: { x: p.coordinatorPubKey.x, y: p.coordinatorPubKey.y },
    treeDepths: {
      intStateTreeDepth: INT_STATE_TREE_DEPTH,
      messageTreeSubDepth: MESSAGE_BATCH_DEPTH,
      messageTreeDepth: MESSAGE_TREE_DEPTH,
      voteOptionTreeDepth: VOTE_OPTION_TREE_DEPTH,
    },
    mode: MODE_NON_QV,
    timelock: timelockAddr,
    votingPeriod: BigInt(votingPeriod),
    quorumPercentage,
    quorumAbsolute,
    tallyGracePeriod,
  });
  const governorAddr = await governor.getAddress();
  console.log("      →", governorAddr);

  // Wire timelock roles → new governor, then renounce deployer admin.
  console.log("\nLocking down Timelock (Governor = proposer/canceller; deployer renounces admin)…");
  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), governorAddr)).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), governorAddr)).wait();
  await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployerAddr)).wait();
  const stillAdmin = await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(), deployerAddr);
  if (stillAdmin) throw new Error("Deployer still holds DEFAULT_ADMIN_ROLE — aborting");
  console.log("→ Timelock locked.");

  // Merge into gnosis-v2.json, archiving the previous governor + timelock.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  a[`maciAttesterGovernor_archived_${ts}`] = a.maciAttesterGovernor;
  a[`timelock_archived_${ts}`] = a.timelock;
  a.maciAttesterGovernor = governorAddr;
  a.timelock = timelockAddr;
  j.parameters = { ...p, votingPeriod: Number(votingPeriod) };
  j.governanceDeployedAt = new Date().toISOString();
  fs.writeFileSync(DEPLOYMENTS, JSON.stringify(j, null, 2));
  console.log("\nMerged into", DEPLOYMENTS);

  const endBal = await ethers.provider.getBalance(deployerAddr);
  console.log("\nGas spent:", ethers.formatEther(startBal - endBal), "xDAI");
  console.log("\nNEW addresses:");
  console.log("  MaciAttesterGovernor:", governorAddr);
  console.log("  TimelockController:  ", timelockAddr);
  console.log("\nNEXT — frontend cutover (separate code change):");
  console.log("  apps/web/src/lib/contracts.ts   MACI_GOVERNOR_ADDRESS =", governorAddr);
  console.log("  apps/expo governor constant     =", governorAddr);
  console.log("  packages/blockchain governor    =", governorAddr);
  console.log("  coordinator GOVERNOR_ADDRESS env (poll↔proposal mapping) — verify/update.");
  console.log("  MACI_ADDRESS UNCHANGED → no coordinator key/MACI update, no re-signup.");
  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
