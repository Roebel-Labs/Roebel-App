/**
 * CLEAN-SLATE rotation: fresh SignUpTokenGatekeeper + MACI core + Timelock + Governor.
 *
 * Why a FRESH gatekeeper (vs redeploy-maci-governor.cjs, which reuses it):
 *   SignUpTokenGatekeeper.registeredTokenIds[tokenId] is permanent per-instance
 *   and has no resetter. Citizens whose CitizenNFT token was already marked
 *   registered (e.g. with a random per-device MACI key that's since been lost to
 *   a reinstall) can never sign up again on that gatekeeper, and can't vote
 *   (no recoverable stateIndex). Deploying a NEW gatekeeper bound to the SAME
 *   CitizenNFT gives every citizen a fresh one-time signup — which they now do
 *   with a deterministic wallet-derived key, so it can't get lost again.
 *
 * Steps:
 *   0. Deploy SignUpTokenGatekeeper(CitizenNFT)            ← fresh empty registry
 *   1. Deploy MACI core bound to the NEW gatekeeper
 *   2. newGatekeeper.setMaciInstance(NEW_MACI)
 *   3. Deploy fresh TimelockController
 *   4. Deploy fresh MaciAttesterGovernor (maci=NEW_MACI, votingPeriod from env)
 *   5. Wire Timelock roles → Governor, renounce deployer admin
 *
 * Reuses (from deployments/base.json): voiceCreditProxy, Verifier, VkRegistry,
 *   Poseidon T3/T4/T5/T6, PollFactory, MessageProcessorFactory, TallyFactory,
 *   AttesterNFT, CitizenNFT.
 *
 *   pnpm hardhat run scripts/redeploy-maci-fresh-gatekeeper.cjs --network base
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

const REQUIRED_ENV = [
  "VOTING_PERIOD_SECONDS",
  "QUORUM_PERCENTAGE",
  "QUORUM_ABSOLUTE",
  "TALLY_GRACE_PERIOD_SECONDS",
  "TIMELOCK_MIN_DELAY_SECONDS",
  "COORDINATOR_ADDRESS",
  "COORDINATOR_PUBKEY_X",
  "COORDINATOR_PUBKEY_Y",
];

function readEnv() {
  const missing = [];
  const out = {};
  for (const key of REQUIRED_ENV) {
    const v = process.env[key];
    if (!v || v === "0" || v === "0x0000000000000000000000000000000000000000") {
      missing.push(key);
    } else {
      out[key] = v;
    }
  }
  if (missing.length) throw new Error("Missing .env values: " + missing.join(", "));
  return out;
}

async function deployContract(name, signer, ...args) {
  const F = await hre.ethers.getContractFactory(name, signer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function deployLinked(name, signer, libraries, ...args) {
  const F = await hre.ethers.getContractFactory(name, { signer, libraries });
  const fee = await hre.ethers.provider.getFeeData();
  const c = await F.deploy(...args, {
    gasLimit: 6_000_000n,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
  await c.waitForDeployment();
  return c;
}

function loadDeployments() {
  const p = path.resolve(__dirname, "../deployments", "base.json");
  if (!fs.existsSync(p)) throw new Error("Missing " + p);
  return { path: p, data: JSON.parse(fs.readFileSync(p, "utf8")) };
}

async function main() {
  const env = readEnv();
  const { ethers, network } = hre;

  if (network.name !== "base") {
    throw new Error(`Refusing to deploy to "${network.name}" — expected "base".`);
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startBal = await ethers.provider.getBalance(deployerAddr);

  const { path: deploymentsPath, data: prior } = loadDeployments();
  const a = prior.addresses;
  // NOTE: gatekeeper intentionally NOT required — we deploy a fresh one.
  const reqAddrs = [
    "voiceCreditProxy", "verifier", "vkRegistry",
    "poseidonT3", "poseidonT4", "poseidonT5", "poseidonT6",
    "pollFactory", "messageProcessorFactory", "tallyFactory",
    "attesterNFT", "citizenNFT",
  ];
  for (const k of reqAddrs) {
    if (!a[k]) throw new Error(`deployments/base.json missing addresses.${k}`);
  }

  console.log("\n=== CLEAN-SLATE rotation: Gatekeeper + MACI + Timelock + Governor ===");
  console.log("Deployer:                  " + deployerAddr);
  console.log("Balance:                   " + ethers.formatEther(startBal) + " ETH");
  console.log("");
  console.log("Reusing infrastructure from deployments/base.json:");
  console.log("  VoiceCreditProxy:        " + a.voiceCreditProxy);
  console.log("  Verifier:                " + a.verifier);
  console.log("  VkRegistry:              " + a.vkRegistry);
  console.log("  PollFactory:             " + a.pollFactory);
  console.log("  MessageProcessorFactory: " + a.messageProcessorFactory);
  console.log("  TallyFactory:            " + a.tallyFactory);
  console.log("  Poseidon T3/T4/T5/T6:    (linked into MACI)");
  console.log("  AttesterNFT (unchanged): " + a.attesterNFT);
  console.log("  CitizenNFT (unchanged):  " + a.citizenNFT);
  console.log("  Gatekeeper:              FRESH (deployed below)");
  console.log("");
  console.log("Parameters:");
  console.log("  votingPeriod:            " + env.VOTING_PERIOD_SECONDS + " s");
  console.log("  timelockMinDelay:        " + env.TIMELOCK_MIN_DELAY_SECONDS + " s");
  console.log("  quorumPercentage:        " + env.QUORUM_PERCENTAGE);
  console.log("  quorumAbsolute:          " + env.QUORUM_ABSOLUTE);
  console.log("  tallyGracePeriod:        " + env.TALLY_GRACE_PERIOD_SECONDS + " s");
  console.log("  coordinator:             " + env.COORDINATOR_ADDRESS);
  console.log("");

  const poseidonAddrs = {
    PoseidonT3: a.poseidonT3,
    PoseidonT4: a.poseidonT4,
    PoseidonT5: a.poseidonT5,
    PoseidonT6: a.poseidonT6,
  };

  // 0) Fresh gatekeeper bound to the existing CitizenNFT — empty registeredTokenIds.
  console.log("[0/5] SignUpTokenGatekeeper(CitizenNFT " + a.citizenNFT + ")…");
  const gatekeeper = await deployContract("SignUpTokenGatekeeper", deployer, a.citizenNFT);
  const gatekeeperAddr = await gatekeeper.getAddress();
  console.log("      → " + gatekeeperAddr);

  // 1) MACI core, bound to the NEW gatekeeper.
  console.log("[1/5] MACI core (binds to NEW gatekeeper " + gatekeeperAddr + ")…");
  const emptyBallotRoots = genEmptyBallotRoots(STATE_TREE_DEPTH);
  const maci = await deployLinked(
    "MACI",
    deployer,
    poseidonAddrs,
    a.pollFactory,
    a.messageProcessorFactory,
    a.tallyFactory,
    gatekeeperAddr,
    a.voiceCreditProxy,
    STATE_TREE_DEPTH,
    emptyBallotRoots
  );
  const maciAddr = await maci.getAddress();
  const maciReceipt = await maci.deploymentTransaction().wait();
  const maciBlock = maciReceipt.blockNumber;
  console.log("      → " + maciAddr + "  (block " + maciBlock + ")");

  // 2) Bind gatekeeper to the new MACI.
  console.log("[2/5] gatekeeper.setMaciInstance(NEW_MACI)…");
  await (await gatekeeper.setMaciInstance(maciAddr)).wait();
  console.log("      ✓");

  // 3) Fresh Timelock.
  console.log("[3/5] TimelockController (minDelay=" + env.TIMELOCK_MIN_DELAY_SECONDS + " s)…");
  const timelock = await deployContract(
    "TimelockController",
    deployer,
    BigInt(env.TIMELOCK_MIN_DELAY_SECONDS),
    [],
    [ethers.ZeroAddress],
    deployerAddr
  );
  const timelockAddr = await timelock.getAddress();
  console.log("      → " + timelockAddr);

  // 4) Fresh Governor.
  console.log("[4/5] MaciAttesterGovernor (votingPeriod=" + env.VOTING_PERIOD_SECONDS + " s)…");
  const governor = await deployContract("MaciAttesterGovernor", deployer, {
    attesterNFT: a.attesterNFT,
    citizenNFT: a.citizenNFT,
    maci: maciAddr,
    verifier: a.verifier,
    vkRegistry: a.vkRegistry,
    coordinator: env.COORDINATOR_ADDRESS,
    coordinatorPubKey: { x: env.COORDINATOR_PUBKEY_X, y: env.COORDINATOR_PUBKEY_Y },
    treeDepths: {
      intStateTreeDepth: INT_STATE_TREE_DEPTH,
      messageTreeSubDepth: MESSAGE_BATCH_DEPTH,
      messageTreeDepth: MESSAGE_TREE_DEPTH,
      voteOptionTreeDepth: VOTE_OPTION_TREE_DEPTH,
    },
    mode: MODE_NON_QV,
    timelock: timelockAddr,
    votingPeriod: BigInt(env.VOTING_PERIOD_SECONDS),
    quorumPercentage: BigInt(env.QUORUM_PERCENTAGE),
    quorumAbsolute: BigInt(env.QUORUM_ABSOLUTE),
    tallyGracePeriod: BigInt(env.TALLY_GRACE_PERIOD_SECONDS),
  });
  const governorAddr = await governor.getAddress();
  console.log("      → " + governorAddr);

  // 5) Wire Timelock roles → new Governor; renounce deployer admin.
  console.log("\n[5/5] Granting Timelock roles to new Governor + renouncing deployer admin…");
  const TIMELOCK_ABI = [
    "function PROPOSER_ROLE() view returns (bytes32)",
    "function CANCELLER_ROLE() view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function hasRole(bytes32,address) view returns (bool)",
    "function grantRole(bytes32,address)",
    "function renounceRole(bytes32,address)",
  ];
  const tl = new ethers.Contract(timelockAddr, TIMELOCK_ABI, deployer);
  const PROPOSER_ROLE = await tl.PROPOSER_ROLE();
  const CANCELLER_ROLE = await tl.CANCELLER_ROLE();
  const DEFAULT_ADMIN_ROLE = await tl.DEFAULT_ADMIN_ROLE();
  await (await tl.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  await (await tl.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  await (await tl.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr)).wait();
  const stillAdmin = await tl.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  if (stillAdmin) throw new Error("Deployer still holds DEFAULT_ADMIN_ROLE — aborting");
  console.log("→ Timelock locked down.");

  // Persist new addresses, archive previous ones.
  const archived = { ...a };
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  for (const [k, v] of Object.entries({
    gatekeeper: gatekeeperAddr,
    maci: maciAddr,
    timelock: timelockAddr,
    maciAttesterGovernor: governorAddr,
  })) {
    const oldVal = archived[k];
    if (oldVal && oldVal.toLowerCase() !== v.toLowerCase()) {
      archived[`${k}_archived_${ts}`] = oldVal;
    }
    archived[k] = v;
  }

  const out = {
    ...prior,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    addresses: archived,
    maciDeployBlock: maciBlock,
    parameters: {
      ...prior.parameters,
      votingPeriod: Number(env.VOTING_PERIOD_SECONDS),
      quorumPercentage: Number(env.QUORUM_PERCENTAGE),
      quorumAbsolute: Number(env.QUORUM_ABSOLUTE),
      tallyGracePeriod: Number(env.TALLY_GRACE_PERIOD_SECONDS),
      timelockMinDelay: Number(env.TIMELOCK_MIN_DELAY_SECONDS),
    },
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(out, null, 2));
  console.log("\nAddresses written to " + deploymentsPath);

  const endBal = await ethers.provider.getBalance(deployerAddr);
  console.log("\nGas spent: " + ethers.formatEther(startBal - endBal) + " ETH");
  console.log("\nNew addresses:");
  console.log("  Gatekeeper (FRESH):    " + gatekeeperAddr);
  console.log("  MACI core:             " + maciAddr);
  console.log("  TimelockController:    " + timelockAddr);
  console.log("  MaciAttesterGovernor:  " + governorAddr);
  console.log("\nMACI_DEPLOY_BLOCK (use this in the app, buffer -100): " + (maciBlock - 100));

  console.log("\n" + "=".repeat(72));
  console.log("⚠️  POST-ROTATION STEPS");
  console.log("=".repeat(72));
  console.log("1. Update coordinator MACI address:");
  console.log("     fly secrets set -a roebel-maci-coordinator MACI_ADDRESS=" + maciAddr);
  console.log("2. Bump app addresses + MACI_DEPLOY_BLOCK (expo / packages/blockchain / web).");
  console.log("=".repeat(72));

  console.log("\n=== DONE ===\n");

  // Machine-readable summary line for downstream tooling.
  console.log(
    "ROTATION_RESULT " +
      JSON.stringify({ gatekeeper: gatekeeperAddr, maci: maciAddr, timelock: timelockAddr, governor: governorAddr, maciBlock }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
