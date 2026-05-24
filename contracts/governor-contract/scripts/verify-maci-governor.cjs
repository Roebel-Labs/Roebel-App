/**
 * Verify the MACI + Timelock + Governor redeployment from redeploy-maci-governor.cjs
 * on Basescan. Reads addresses from deployments/base.json so this script always
 * targets the latest rotation.
 *
 *   pnpm hardhat run scripts/verify-maci-governor.cjs --network base
 *
 * "Already Verified" responses are treated as success.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { genEmptyBallotRoots } = require("maci-contracts");

const STATE_TREE_DEPTH = 14;
const INT_STATE_TREE_DEPTH = 5;
const MESSAGE_TREE_DEPTH = 9;
const MESSAGE_BATCH_DEPTH = 2;
const VOTE_OPTION_TREE_DEPTH = 3;
const MODE_NON_QV = 1;

async function verify(label, address, constructorArguments, contract) {
  console.log(`\n• Verifying ${label} (${address})…`);
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
      ...(contract ? { contract } : {}),
    });
    console.log(`  ✓ ${label} verified`);
  } catch (e) {
    const msg = (e && (e.message || String(e))) || "";
    if (msg.toLowerCase().includes("already verified")) {
      console.log(`  ✓ ${label} already verified`);
    } else {
      console.log(`  ✗ ${label} failed: ${msg.split("\n")[0]}`);
    }
  }
}

async function main() {
  const env = process.env;
  const deploymentsPath = path.resolve(__dirname, "../deployments", "base.json");
  const d = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const a = d.addresses;
  const p = d.parameters;

  console.log("Targeting addresses from deployments/base.json:");
  console.log("  maci:                 " + a.maci);
  console.log("  timelock:             " + a.timelock);
  console.log("  maciAttesterGovernor: " + a.maciAttesterGovernor);

  // 1) MACI core
  const emptyBallotRoots = genEmptyBallotRoots(STATE_TREE_DEPTH).map((b) => b.toString());
  await verify(
    "MACI",
    a.maci,
    [
      a.pollFactory,
      a.messageProcessorFactory,
      a.tallyFactory,
      a.gatekeeper,
      a.voiceCreditProxy,
      STATE_TREE_DEPTH,
      emptyBallotRoots,
    ],
    "maci-contracts/contracts/MACI.sol:MACI"
  );

  // 2) TimelockController
  await verify(
    "TimelockController",
    a.timelock,
    [
      Number(env.TIMELOCK_MIN_DELAY_SECONDS ?? p.timelockMinDelay),
      [],
      ["0x0000000000000000000000000000000000000000"],
      d.deployer,
    ],
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController"
  );

  // 3) MaciAttesterGovernor
  const initArgs = {
    attesterNFT: a.attesterNFT,
    citizenNFT: a.citizenNFT,
    maci: a.maci,
    verifier: a.verifier,
    vkRegistry: a.vkRegistry,
    coordinator: env.COORDINATOR_ADDRESS,
    coordinatorPubKey: {
      x: env.COORDINATOR_PUBKEY_X,
      y: env.COORDINATOR_PUBKEY_Y,
    },
    treeDepths: {
      intStateTreeDepth: INT_STATE_TREE_DEPTH,
      messageTreeSubDepth: MESSAGE_BATCH_DEPTH,
      messageTreeDepth: MESSAGE_TREE_DEPTH,
      voteOptionTreeDepth: VOTE_OPTION_TREE_DEPTH,
    },
    mode: MODE_NON_QV,
    timelock: a.timelock,
    votingPeriod: Number(env.VOTING_PERIOD_SECONDS ?? p.votingPeriod),
    quorumPercentage: Number(env.QUORUM_PERCENTAGE ?? p.quorumPercentage),
    quorumAbsolute: Number(env.QUORUM_ABSOLUTE ?? p.quorumAbsolute),
    tallyGracePeriod: Number(env.TALLY_GRACE_PERIOD_SECONDS ?? p.tallyGracePeriod),
  };
  await verify(
    "MaciAttesterGovernor",
    a.maciAttesterGovernor,
    [initArgs],
    "contracts/verification-system/MaciAttesterGovernor.sol:MaciAttesterGovernor"
  );

  console.log("\n=== Verification pass complete ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
