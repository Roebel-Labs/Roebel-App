/**
 * Redeploy AttesterNFT, CitizenNFT, SignUpTokenGatekeeper, and MaciAttesterGovernor
 * on Base mainnet. Reuses the existing MACI core / Verifier / VkRegistry / Poseidon
 * stack (read from deployments/base.json) and deploys a fresh TimelockController
 * paired with the new Governor.
 *
 *   pnpm hardhat run scripts/redeploy-verification.cjs --network base
 *
 * Required .env:
 *   DEPLOYER_PRIVATE_KEY      — burner key, funded with ~0.02 ETH on Base
 *   VOTING_PERIOD_SECONDS
 *   QUORUM_PERCENTAGE
 *   QUORUM_ABSOLUTE
 *   TALLY_GRACE_PERIOD_SECONDS
 *   TIMELOCK_MIN_DELAY_SECONDS
 *   COORDINATOR_ADDRESS
 *   COORDINATOR_PUBKEY_X
 *   COORDINATOR_PUBKEY_Y
 *
 * Optional .env:
 *   NFT_INITIAL_OWNER         — pre-handoff owner of new NFTs. If unset (default),
 *                                the burner is used and the script auto-transfers
 *                                ownership to the new Timelock at the end. If set
 *                                to a non-deployer address (e.g. for a migration),
 *                                the script skips the transferOwnership step so the
 *                                named owner can perform any migration first.
 *   FOUNDING_ATTESTER_1/2/3   — defaults to project constants
 *   FOUNDING_CITIZEN_1/2/3    — defaults to founding attesters
 *   REQUIRED_ATTESTER_SIGNATURES (default 1)
 *   REQUIRED_CITIZEN_SIGNATURES  (default 1)
 *   REQUIRED_REVOCATION_ATTESTER_SIGNATURES (default 1)
 *   REQUIRED_REVOCATION_CITIZEN_SIGNATURES  (default 1)
 *   REQUIRED_ATTESTER_REJECTIONS (default 1)
 *   REQUIRED_CITIZEN_REJECTIONS  (default 1)
 *   ATTESTER_REQUIRED_SIGNATURES (default 2)
 *   ATTESTER_REQUIRED_REJECTIONS (default 2)
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const hre = require("hardhat");

const DEFAULT_FOUNDING_ATTESTERS = [
  "0xc49de63ccfee46c6c5c3e393293f66779799fb28",
  "0x90f677dc480e76a127ec1dce42263a370e396313",
  "0xf468d87fca0e15bc2c383ef482d38b9b77812b29",
];
// Pre-handoff NFT owner. By default the deployer holds ownership briefly and
// the script auto-transfers to the new Timelock at the end. Override via
// NFT_INITIAL_OWNER env if a different address needs interim control
// (e.g. to run a one-shot bulk-mint migration before handoff).
const MAXBRYCH_ETH = "0x1C11F068c83D364Ad0A015C01D51d2cC6c62d1f9";

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

// Mirrors deploy-maci-base.cjs — keep in sync with the production ceremony params.
const STATE_TREE_DEPTH = 14;
const INT_STATE_TREE_DEPTH = 5;
const MESSAGE_TREE_DEPTH = 9;
const MESSAGE_BATCH_DEPTH = 2;
const VOTE_OPTION_TREE_DEPTH = 3;
const MODE_NON_QV = 1;

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
  if (missing.length > 0) {
    throw new Error("Missing .env values: " + missing.join(", "));
  }
  return out;
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid ${name}: ${v}`);
  }
  return n;
}

function envAddr(name, fallback) {
  return process.env[name] || fallback;
}

async function deployContract(name, signer, ...args) {
  const F = await hre.ethers.getContractFactory(name, signer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

function loadInfra() {
  const baseJsonPath = path.resolve(__dirname, "../deployments", "base.json");
  if (!fs.existsSync(baseJsonPath)) {
    throw new Error("Missing " + baseJsonPath + " — needed for MACI/Verifier/VkRegistry addresses");
  }
  const prior = JSON.parse(fs.readFileSync(baseJsonPath, "utf8"));
  const a = prior.addresses;
  for (const k of ["maci", "verifier", "vkRegistry"]) {
    if (!a[k]) throw new Error(`deployments/base.json.addresses.${k} missing`);
  }
  return { prior, infra: { maci: a.maci, verifier: a.verifier, vkRegistry: a.vkRegistry } };
}

async function main() {
  const env = readEnv();
  const { ethers, network } = hre;

  if (network.name !== "base" && network.name !== "baseSepolia" && network.name !== "hardhat") {
    throw new Error(`Refusing to deploy to network "${network.name}" — expected "base" or "baseSepolia".`);
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startingBalance = await ethers.provider.getBalance(deployerAddr);

  const founders = [
    envAddr("FOUNDING_ATTESTER_1", DEFAULT_FOUNDING_ATTESTERS[0]),
    envAddr("FOUNDING_ATTESTER_2", DEFAULT_FOUNDING_ATTESTERS[1]),
    envAddr("FOUNDING_ATTESTER_3", DEFAULT_FOUNDING_ATTESTERS[2]),
  ];
  const citizenFounders = [
    envAddr("FOUNDING_CITIZEN_1", founders[0]),
    envAddr("FOUNDING_CITIZEN_2", founders[1]),
    envAddr("FOUNDING_CITIZEN_3", founders[2]),
  ];

  // Default initialOwner = deployer → script auto-transfers ownership to the new
  // Timelock at the end (full automation, no manual step). Override via NFT_INITIAL_OWNER
  // only if you need an interim owner (e.g. for a one-shot migration).
  const initialOwnerRaw = envAddr("NFT_INITIAL_OWNER", deployerAddr);
  const initialOwner = ethers.getAddress(initialOwnerRaw);
  const autoHandoff = initialOwner === deployerAddr;

  // Sanity: AttesterNFT constructor disallows initialOwner == any founder.
  for (const f of founders) {
    if (ethers.getAddress(f) === initialOwner) {
      throw new Error(`NFT_INITIAL_OWNER (${initialOwner}) cannot be one of the founding attesters`);
    }
  }

  const reqAttest = envInt("REQUIRED_ATTESTER_SIGNATURES", 1);
  const reqCitizen = envInt("REQUIRED_CITIZEN_SIGNATURES", 1);
  const reqRevAttest = envInt("REQUIRED_REVOCATION_ATTESTER_SIGNATURES", 1);
  const reqRevCitizen = envInt("REQUIRED_REVOCATION_CITIZEN_SIGNATURES", 1);
  const reqAttestRej = envInt("REQUIRED_ATTESTER_REJECTIONS", 1);
  const reqCitizenRej = envInt("REQUIRED_CITIZEN_REJECTIONS", 1);
  const attReqSigs = envInt("ATTESTER_REQUIRED_SIGNATURES", 2);
  const attReqRej = envInt("ATTESTER_REQUIRED_REJECTIONS", 2);

  console.log("\n=== Redeploy verification stack to " + network.name + " ===");
  console.log("Deployer:          " + deployerAddr);
  console.log("Balance:           " + ethers.formatEther(startingBalance) + " ETH");
  console.log("NFT initialOwner:  " + initialOwner + (autoHandoff ? " (deployer — auto-transfer)" : " (manual transfer required)"));
  console.log("Founding attesters: " + founders.join(", "));
  console.log("Founding citizens:  " + citizenFounders.join(", "));
  console.log("Coordinator:       " + env.COORDINATOR_ADDRESS);
  console.log("");

  const { prior, infra } = loadInfra();
  console.log("Reusing MACI infra from deployments/base.json:");
  console.log("  MACI:       " + infra.maci);
  console.log("  Verifier:   " + infra.verifier);
  console.log("  VkRegistry: " + infra.vkRegistry);
  console.log("");

  // 1) AttesterNFT
  console.log("[1/5] AttesterNFT…");
  const attesterNFT = await deployContract(
    "AttesterNFT",
    deployer,
    initialOwner,
    "Roebel Attester",
    "ROEBEL-ATTESTER",
    founders,
    attReqSigs,
    attReqRej
  );
  const attesterNFTAddr = await attesterNFT.getAddress();
  console.log("      → " + attesterNFTAddr);

  // 2) CitizenNFT
  console.log("[2/5] CitizenNFT…");
  const citizenNFT = await deployContract(
    "CitizenNFT",
    deployer,
    attesterNFTAddr,
    initialOwner,
    citizenFounders,
    reqAttest,
    reqCitizen,
    reqRevAttest,
    reqRevCitizen,
    reqAttestRej,
    reqCitizenRej
  );
  const citizenNFTAddr = await citizenNFT.getAddress();
  console.log("      → " + citizenNFTAddr);

  // 3) Gatekeeper bound to the new CitizenNFT
  console.log("[3/5] SignUpTokenGatekeeper…");
  const gatekeeper = await deployContract("SignUpTokenGatekeeper", deployer, citizenNFTAddr);
  const gatekeeperAddr = await gatekeeper.getAddress();
  console.log("      → " + gatekeeperAddr);

  // Bind gatekeeper to the EXISTING MACI core (gatekeeper.setMaciInstance was called
  // by the original deploy for the OLD gatekeeper; we now bind the new one).
  console.log("      → gatekeeper.setMaciInstance(MACI)…");
  await (await gatekeeper.setMaciInstance(infra.maci)).wait();

  // 4) Fresh Timelock + new MaciAttesterGovernor
  console.log("[4/5] TimelockController…");
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

  console.log("[5/5] MaciAttesterGovernor…");
  const governor = await deployContract("MaciAttesterGovernor", deployer, {
    attesterNFT: attesterNFTAddr,
    citizenNFT: citizenNFTAddr,
    maci: infra.maci,
    verifier: infra.verifier,
    vkRegistry: infra.vkRegistry,
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

  console.log("\nGranting Timelock roles to new Governor + renouncing deployer admin…");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  await (await timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr)).wait();
  // Sanity: ensure renounce actually landed (per audit finding #6 in Bug C cluster).
  const stillAdmin = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  if (stillAdmin) {
    throw new Error("Deployer still holds DEFAULT_ADMIN_ROLE on new Timelock — aborting");
  }
  console.log("→ Timelock locked down.");

  if (autoHandoff) {
    console.log("\nTransferring NFT ownership to Timelock (auto, deployer == initialOwner)…");
    await (await attesterNFT.transferOwnership(timelockAddr)).wait();
    await (await citizenNFT.transferOwnership(timelockAddr)).wait();
    console.log("→ AttesterNFT.owner() and CitizenNFT.owner() = " + timelockAddr);
  } else {
    console.log("\n⚠️  NFT owner is " + initialOwner + " (NOT the deployer).");
    console.log("   Run any migration (e.g. emergencyBulkMint, if added) from that wallet,");
    console.log("   then call transferOwnership(" + timelockAddr + ") on BOTH NFTs.");
  }

  // ---- Persist addresses ----
  const archived = { ...prior.addresses };
  for (const [k, v] of Object.entries({
    attesterNFT: attesterNFTAddr,
    citizenNFT: citizenNFTAddr,
    gatekeeper: gatekeeperAddr,
    timelock: timelockAddr,
    maciAttesterGovernor: governorAddr,
  })) {
    const oldVal = archived[k];
    if (oldVal && oldVal !== v) {
      const tag = `${k}_archived_` + new Date().toISOString().replace(/[:.]/g, "-");
      archived[tag] = oldVal;
    }
    archived[k] = v;
  }

  const out = {
    ...prior,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    addresses: archived,
    parameters: {
      ...prior.parameters,
      votingPeriod: Number(env.VOTING_PERIOD_SECONDS),
      quorumPercentage: Number(env.QUORUM_PERCENTAGE),
      quorumAbsolute: Number(env.QUORUM_ABSOLUTE),
      tallyGracePeriod: Number(env.TALLY_GRACE_PERIOD_SECONDS),
      timelockMinDelay: Number(env.TIMELOCK_MIN_DELAY_SECONDS),
      citizenNftThresholds: {
        attestation: { attester: reqAttest, citizen: reqCitizen },
        revocation: { attester: reqRevAttest, citizen: reqRevCitizen },
        rejection: { attester: reqAttestRej, citizen: reqCitizenRej },
      },
      attesterNftThresholds: { signatures: attReqSigs, rejections: attReqRej },
      initialOwner,
    },
  };

  const outDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, network.name + ".json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log("\nAddresses written to " + outFile);

  const endingBalance = await ethers.provider.getBalance(deployerAddr);
  console.log("\nGas spent: " + ethers.formatEther(startingBalance - endingBalance) + " ETH");
  console.log("\nNew addresses:");
  console.log("  AttesterNFT:           " + attesterNFTAddr);
  console.log("  CitizenNFT:            " + citizenNFTAddr);
  console.log("  SignUpTokenGatekeeper: " + gatekeeperAddr);
  console.log("  TimelockController:    " + timelockAddr);
  console.log("  MaciAttesterGovernor:  " + governorAddr);
  console.log("\nNext steps:");
  console.log("  1. Verify on Basescan: pnpm hardhat verify --network base <addr> <args>");
  console.log("  2. Update packages/blockchain + apps/web + apps/expo with these addresses");
  if (!autoHandoff) {
    console.log("  3. From " + initialOwner + ": transferOwnership(" + timelockAddr + ") on both NFTs");
  }
  console.log("\n=== DONE ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
