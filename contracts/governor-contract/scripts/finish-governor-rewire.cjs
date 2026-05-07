/**
 * Finish wiring up an already-deployed Timelock + Governor pair when the original
 * deploy script crashed mid-rewiring (e.g. ethers eth_call timing race against a
 * just-deployed contract).
 *
 * Idempotent: skips role grants that are already in place. Safe to re-run.
 *
 * Usage:
 *   TIMELOCK=<addr> GOVERNOR=<addr> npx hardhat run scripts/finish-governor-rewire.cjs --network base
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  if (!process.env.TIMELOCK || !process.env.GOVERNOR) {
    throw new Error("Set TIMELOCK=<addr> and GOVERNOR=<addr>");
  }
  const timelockAddr = process.env.TIMELOCK;
  const governorAddr = process.env.GOVERNOR;

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  console.log("Deployer:" + deployerAddr);
  console.log("Timelock:" + timelockAddr);
  console.log("Governor:" + governorAddr);

  const timelock = await ethers.getContractAt("TimelockController", timelockAddr, deployer);
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

  if (await timelock.hasRole(PROPOSER_ROLE, governorAddr)) {
    console.log("✓ Governor already has PROPOSER_ROLE");
  } else {
    console.log("→ granting PROPOSER_ROLE to Governor…");
    await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  }

  if (await timelock.hasRole(CANCELLER_ROLE, governorAddr)) {
    console.log("✓ Governor already has CANCELLER_ROLE");
  } else {
    console.log("→ granting CANCELLER_ROLE to Governor…");
    await (await timelock.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  }

  if (!(await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr))) {
    console.log("✓ Deployer admin already renounced");
  } else {
    console.log("→ renouncing deployer's DEFAULT_ADMIN_ROLE…");
    await (await timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr)).wait();
  }

  // Update base.json
  const baseJsonPath = path.resolve(__dirname, "../deployments", network.name + ".json");
  const prior = JSON.parse(fs.readFileSync(baseJsonPath, "utf8"));
  const a = prior.addresses;
  const archived = { ...a };
  if (a.maciAttesterGovernor && a.maciAttesterGovernor.toLowerCase() !== governorAddr.toLowerCase()) {
    archived["maciAttesterGovernor_archived_" + new Date().toISOString().replace(/[:.]/g, "-")] = a.maciAttesterGovernor;
  }
  if (a.timelock && a.timelock.toLowerCase() !== timelockAddr.toLowerCase()) {
    archived["timelock_archived_" + new Date().toISOString().replace(/[:.]/g, "-")] = a.timelock;
  }
  archived.maciAttesterGovernor = governorAddr;
  archived.timelock = timelockAddr;

  const out = {
    ...prior,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    addresses: archived,
    parameters: {
      ...prior.parameters,
      votingPeriod: Number(process.env.VOTING_PERIOD_SECONDS || prior.parameters.votingPeriod),
      quorumPercentage: Number(process.env.QUORUM_PERCENTAGE || prior.parameters.quorumPercentage),
      quorumAbsolute: Number(process.env.QUORUM_ABSOLUTE || prior.parameters.quorumAbsolute || 0),
      tallyGracePeriod: Number(process.env.TALLY_GRACE_PERIOD_SECONDS || prior.parameters.tallyGracePeriod),
      timelockMinDelay: Number(process.env.TIMELOCK_MIN_DELAY_SECONDS || prior.parameters.timelockMinDelay),
    },
  };
  fs.writeFileSync(baseJsonPath, JSON.stringify(out, null, 2));
  console.log("\nWrote " + baseJsonPath);
  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
