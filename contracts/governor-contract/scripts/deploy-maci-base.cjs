/**
 * Deploys the full MACI v2 stack + Roebel/Müritz governance on Base mainnet.
 *
 * Uses Hardhat-native library linking (via getContractFactory's `libraries`
 * option) instead of maci-contracts' typechain `linkBytecode` helper, which
 * relies on prebuilt MACI bytecode placeholders that don't match what our
 * local compilation produces.
 *
 *   npx hardhat run scripts/deploy-maci-base.cjs --network base
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const hre = require("hardhat");
const { extractVk } = require("maci-circuits");
const { VerifyingKey } = require("maci-domainobjs");
const { genEmptyBallotRoots } = require("maci-contracts");

// MACI ceremony parameter set 14-9-2-3 (matches downloaded prod zKeys)
const STATE_TREE_DEPTH = 14;
const INT_STATE_TREE_DEPTH = 9;
const MESSAGE_TREE_DEPTH = 2;
const VOTE_OPTION_TREE_DEPTH = 3;
const MESSAGE_BATCH_DEPTH = 1; // batch size = 5 ** 1 = 5
const MESSAGE_BATCH_SIZE = 5 ** MESSAGE_BATCH_DEPTH;

// EMode: 0 = QV, 1 = NON_QV (per maci-contracts ts/constants.ts)
const MODE_NON_QV = 1;

const REUSE_INFRA = process.env.REUSE_INFRA === "1";

const REQUIRED_ENV_BASE = [
  "ATTESTER_NFT_ADDRESS",
  "CITIZEN_NFT_ADDRESS",
  "COORDINATOR_ADDRESS",
  "COORDINATOR_PUBKEY_X",
  "COORDINATOR_PUBKEY_Y",
  "VOTING_PERIOD_SECONDS",
  "QUORUM_PERCENTAGE",
  "QUORUM_ABSOLUTE",
  "TALLY_GRACE_PERIOD_SECONDS",
  "TIMELOCK_MIN_DELAY_SECONDS",
];
// Only required for full (non-reuse) deploys — the prebuilt VKs are already set
// on the existing VkRegistry when REUSE_INFRA=1.
const REQUIRED_ENV_FULL = ["ZKEY_PROCESS_MESSAGES", "ZKEY_TALLY_VOTES"];

const REQUIRED_ENV = REUSE_INFRA
  ? REQUIRED_ENV_BASE
  : [...REQUIRED_ENV_BASE, ...REQUIRED_ENV_FULL];

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
    throw new Error("Missing/placeholder .env values: " + missing.join(", "));
  }
  return out;
}

function assertFile(p) {
  if (!fs.existsSync(p)) {
    throw new Error("zKey file not found at " + p + ". Run `bash scripts/download-zkeys.sh` first.");
  }
}

async function deployContract(name, signer, ...args) {
  const F = await hre.ethers.getContractFactory(name, signer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

// MACI's PoseidonT*.sol files are empty stubs in source — the real bytecode is
// generated at build time by circomlibjs and shipped in the prebuilt artifacts.
// Hardhat would compile the stub (~200 bytes, returns 0). Load the prebuilt
// MACI artifact directly to deploy a working Poseidon.
async function deployPoseidonFromPrebuilt(which, signer) {
  // pnpm's "exports" gate hides build/artifacts. Walk node_modules directly.
  const candidates = [
    path.resolve(__dirname, "../node_modules/maci-contracts/build/artifacts/contracts/crypto", `${which}.sol`, `${which}.json`),
    path.resolve(__dirname, "../../../node_modules/maci-contracts/build/artifacts/contracts/crypto", `${which}.sol`, `${which}.json`),
  ];
  let artifactPath;
  for (const c of candidates) {
    if (fs.existsSync(c)) { artifactPath = c; break; }
  }
  if (!artifactPath) {
    throw new Error(`Could not find prebuilt ${which} artifact in:\n  ` + candidates.join("\n  "));
  }
  const art = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const F = new hre.ethers.ContractFactory(art.abi, art.bytecode, signer);
  const c = await F.deploy();
  await c.waitForDeployment();
  return c;
}

async function deployLinked(name, signer, libraries, ...args) {
  const F = await hre.ethers.getContractFactory(name, { signer, libraries });
  // Bypass estimateGas (Base RPC sometimes reverts on heavy linked-bytecode
  // estimations even when the actual tx succeeds). Explicit limit + dynamic
  // EIP-1559 fees from the provider.
  const fee = await hre.ethers.provider.getFeeData();
  const c = await F.deploy(...args, {
    gasLimit: 6_000_000n,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
  await c.waitForDeployment();
  return c;
}

async function deployGovernorAndTimelock({ env, hre, deployer, deployerAddr, infra }) {
  const { ethers } = hre;

  console.log("\n[T] TimelockController…");
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

  console.log("[G] MaciAttesterGovernor…");
  const governor = await deployContract("MaciAttesterGovernor", deployer, {
    attesterNFT: env.ATTESTER_NFT_ADDRESS,
    citizenNFT: env.CITIZEN_NFT_ADDRESS,
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

  console.log("\nGranting timelock roles to Governor + renouncing deployer admin…");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  await (await timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr)).wait();
  console.log("→ Timelock locked down.\n");

  return { governorAddr, timelockAddr };
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

  console.log("\n=== Deploying MACI v2 to " + network.name + (REUSE_INFRA ? " (REUSE_INFRA mode — Governor + Timelock only)" : "") + " ===");
  console.log("Deployer:    " + deployerAddr);
  console.log("Balance:     " + ethers.formatEther(startingBalance) + " ETH");
  console.log("AttesterNFT: " + env.ATTESTER_NFT_ADDRESS);
  console.log("CitizenNFT:  " + env.CITIZEN_NFT_ADDRESS);
  console.log("Coordinator: " + env.COORDINATOR_ADDRESS + "\n");

  // ---- REUSE_INFRA branch: redeploy Governor + Timelock only ----
  if (REUSE_INFRA) {
    const baseJsonPath = path.resolve(__dirname, "../deployments", network.name + ".json");
    if (!fs.existsSync(baseJsonPath)) {
      throw new Error("REUSE_INFRA=1 requires existing " + baseJsonPath);
    }
    const prior = JSON.parse(fs.readFileSync(baseJsonPath, "utf8"));
    const a = prior.addresses;
    const infra = { maci: a.maci, verifier: a.verifier, vkRegistry: a.vkRegistry };
    console.log("Reusing infra from " + baseJsonPath + ":");
    console.log("  MACI:       " + a.maci);
    console.log("  Verifier:   " + a.verifier);
    console.log("  VkRegistry: " + a.vkRegistry);
    console.log("  Gatekeeper: " + a.gatekeeper);
    console.log("  VoiceCredit:" + a.voiceCreditProxy);

    const { governorAddr, timelockAddr } = await deployGovernorAndTimelock({
      env, hre, deployer, deployerAddr, infra
    });

    // Preserve the previous Governor + Timelock under archival keys.
    const archived = { ...a };
    if (a.maciAttesterGovernor) {
      const tag = "maciAttesterGovernor_archived_" + new Date().toISOString().replace(/[:.]/g, "-");
      archived[tag] = a.maciAttesterGovernor;
    }
    if (a.timelock) {
      const tag = "timelock_archived_" + new Date().toISOString().replace(/[:.]/g, "-");
      archived[tag] = a.timelock;
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
        votingPeriod: Number(env.VOTING_PERIOD_SECONDS),
        quorumPercentage: Number(env.QUORUM_PERCENTAGE),
        quorumAbsolute: Number(env.QUORUM_ABSOLUTE),
        tallyGracePeriod: Number(env.TALLY_GRACE_PERIOD_SECONDS),
        timelockMinDelay: Number(env.TIMELOCK_MIN_DELAY_SECONDS),
      },
    };
    fs.writeFileSync(baseJsonPath, JSON.stringify(out, null, 2));
    console.log("Updated " + baseJsonPath);

    const endingBalance = await ethers.provider.getBalance(deployerAddr);
    console.log("\nGas spent (Governor+Timelock redeploy): " + ethers.formatEther(startingBalance - endingBalance) + " ETH");
    console.log("\n=== DONE (REUSE_INFRA) ===\n");
    return;
  }

  // ---- Full deploy path (unchanged) ----
  assertFile(env.ZKEY_PROCESS_MESSAGES);
  assertFile(env.ZKEY_TALLY_VOTES);

  // 1. SignUpTokenGatekeeper bound to CitizenNFT
  console.log("[1/9] SignUpTokenGatekeeper(CitizenNFT)…");
  const gatekeeper = await deployContract("SignUpTokenGatekeeper", deployer, env.CITIZEN_NFT_ADDRESS);
  const gatekeeperAddr = await gatekeeper.getAddress();
  console.log("      → " + gatekeeperAddr);

  // 2. ConstantInitialVoiceCreditProxy(1)
  console.log("[2/9] ConstantInitialVoiceCreditProxy(1)…");
  const voiceCreditProxy = await deployContract("ConstantInitialVoiceCreditProxy", deployer, 1);
  const voiceCreditProxyAddr = await voiceCreditProxy.getAddress();
  console.log("      → " + voiceCreditProxyAddr);

  // 3. Poseidon T3/T4/T5/T6 — deploy from MACI's prebuilt artifacts
  console.log("[3/9] Poseidon T3/T4/T5/T6 (MACI prebuilt bytecode)…");
  const poseidonT3 = await deployPoseidonFromPrebuilt("PoseidonT3", deployer);
  const poseidonT4 = await deployPoseidonFromPrebuilt("PoseidonT4", deployer);
  const poseidonT5 = await deployPoseidonFromPrebuilt("PoseidonT5", deployer);
  const poseidonT6 = await deployPoseidonFromPrebuilt("PoseidonT6", deployer);
  const poseidonAddrs = {
    PoseidonT3: await poseidonT3.getAddress(),
    PoseidonT4: await poseidonT4.getAddress(),
    PoseidonT5: await poseidonT5.getAddress(),
    PoseidonT6: await poseidonT6.getAddress(),
  };
  for (const [k, v] of Object.entries(poseidonAddrs)) console.log("      → " + k + ": " + v);

  // 4. PollFactory + MessageProcessorFactory + TallyFactory (Poseidon-linked)
  console.log("[4/9] PollFactory + MessageProcessorFactory + TallyFactory…");
  const pollFactory = await deployLinked("PollFactory", deployer, poseidonAddrs);
  const mpFactory = await deployLinked("MessageProcessorFactory", deployer, poseidonAddrs);
  const tallyFactory = await deployLinked("TallyFactory", deployer, poseidonAddrs);
  const pollFactoryAddr = await pollFactory.getAddress();
  const mpFactoryAddr = await mpFactory.getAddress();
  const tallyFactoryAddr = await tallyFactory.getAddress();
  console.log("      → PollFactory: " + pollFactoryAddr);
  console.log("      → MPFactory:   " + mpFactoryAddr);
  console.log("      → TallyFactory:" + tallyFactoryAddr);

  // 5. MACI core (Poseidon-linked, takes 7 ctor args)
  console.log("[5/9] MACI core…");
  const emptyBallotRoots = genEmptyBallotRoots(STATE_TREE_DEPTH);
  const maciContract = await deployLinked(
    "MACI",
    deployer,
    poseidonAddrs,
    pollFactoryAddr,
    mpFactoryAddr,
    tallyFactoryAddr,
    gatekeeperAddr,
    voiceCreditProxyAddr,
    STATE_TREE_DEPTH,
    emptyBallotRoots
  );
  const maciAddr = await maciContract.getAddress();
  console.log("      → " + maciAddr);

  // Bind gatekeeper to MACI
  console.log("      → gatekeeper.setMaciInstance(MACI)…");
  await (await gatekeeper.setMaciInstance(maciAddr)).wait();

  // 6. Verifier
  console.log("[6/9] Verifier…");
  const verifier = await deployContract("Verifier", deployer);
  const verifierAddr = await verifier.getAddress();
  console.log("      → " + verifierAddr);

  // 7. VkRegistry + load production ceremony VKs
  console.log("[7/9] VkRegistry + setVerifyingKeysBatch(non-QV)…");
  const vkRegistry = await deployContract("VkRegistry", deployer);
  const vkRegistryAddr = await vkRegistry.getAddress();

  const procVkObj = await extractVk(env.ZKEY_PROCESS_MESSAGES);
  const tallyVkObj = await extractVk(env.ZKEY_TALLY_VOTES);
  const processVk = VerifyingKey.fromObj(procVkObj).asContractParam();
  const tallyVk = VerifyingKey.fromObj(tallyVkObj).asContractParam();

  await (
    await vkRegistry.setVerifyingKeysBatch(
      STATE_TREE_DEPTH,
      INT_STATE_TREE_DEPTH,
      MESSAGE_TREE_DEPTH,
      VOTE_OPTION_TREE_DEPTH,
      MESSAGE_BATCH_SIZE,
      [MODE_NON_QV],
      [processVk],
      [tallyVk]
    )
  ).wait();
  console.log("      → " + vkRegistryAddr);

  // 8 + 9. TimelockController + MaciAttesterGovernor
  console.log("[8-9/9] TimelockController + MaciAttesterGovernor…");
  const { governorAddr, timelockAddr } = await deployGovernorAndTimelock({
    env, hre, deployer, deployerAddr,
    infra: { maci: maciAddr, verifier: verifierAddr, vkRegistry: vkRegistryAddr },
  });

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    addresses: {
      attesterNFT: env.ATTESTER_NFT_ADDRESS,
      citizenNFT: env.CITIZEN_NFT_ADDRESS,
      gatekeeper: gatekeeperAddr,
      voiceCreditProxy: voiceCreditProxyAddr,
      maci: maciAddr,
      verifier: verifierAddr,
      vkRegistry: vkRegistryAddr,
      poseidonT3: poseidonAddrs.PoseidonT3,
      poseidonT4: poseidonAddrs.PoseidonT4,
      poseidonT5: poseidonAddrs.PoseidonT5,
      poseidonT6: poseidonAddrs.PoseidonT6,
      pollFactory: pollFactoryAddr,
      messageProcessorFactory: mpFactoryAddr,
      tallyFactory: tallyFactoryAddr,
      timelock: timelockAddr,
      maciAttesterGovernor: governorAddr,
      coordinator: env.COORDINATOR_ADDRESS,
    },
    parameters: {
      stateTreeDepth: STATE_TREE_DEPTH,
      intStateTreeDepth: INT_STATE_TREE_DEPTH,
      messageTreeDepth: MESSAGE_TREE_DEPTH,
      voteOptionTreeDepth: VOTE_OPTION_TREE_DEPTH,
      messageBatchSize: MESSAGE_BATCH_SIZE,
      mode: "NON_QV",
      votingPeriod: Number(env.VOTING_PERIOD_SECONDS),
      quorumPercentage: Number(env.QUORUM_PERCENTAGE),
      quorumAbsolute: Number(env.QUORUM_ABSOLUTE),
      tallyGracePeriod: Number(env.TALLY_GRACE_PERIOD_SECONDS),
      timelockMinDelay: Number(env.TIMELOCK_MIN_DELAY_SECONDS),
      coordinatorPubKey: {
        x: env.COORDINATOR_PUBKEY_X,
        y: env.COORDINATOR_PUBKEY_Y,
      },
    },
  };

  const outDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, network.name + ".json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log("Addresses written to " + outFile);

  const endingBalance = await ethers.provider.getBalance(deployerAddr);
  const spent = startingBalance - endingBalance;
  console.log("\nTotal gas spent: " + ethers.formatEther(spent) + " ETH");
  console.log("\n=== DONE ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
