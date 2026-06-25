/**
 * Full consolidation, step 2: deploy the MACI v2 stack + MaciAttesterGovernor + Timelock
 * on GNOSIS, bound to the fresh Sybil-hardened AttesterNFTv2 / CitizenNFTv2 (deployed by
 * deploy-gnosis-v2.cjs). This is a faithful port of deploy-maci-base.cjs — same proven
 * sequence, same ceremony params — changed only to: target Gnosis, read the v2 NFT
 * addresses from deployments/gnosis-v2.json, and MERGE output into gnosis-v2.json
 * (never overwrite the existing gnosis.json identity record).
 *
 *   bash scripts/download-zkeys.sh   # once
 *   DEPLOYER_PRIVATE_KEY=0x<burner> GNOSIS_RPC_URL=https://rpc.gnosischain.com \
 *     COORDINATOR_ADDRESS=0x… COORDINATOR_PUBKEY_X=… COORDINATOR_PUBKEY_Y=… \
 *     VOTING_PERIOD_SECONDS=3600 QUORUM_PERCENTAGE=10 QUORUM_ABSOLUTE=2 \
 *     TALLY_GRACE_PERIOD_SECONDS=604800 TIMELOCK_MIN_DELAY_SECONDS=3600 \
 *     ZKEY_PROCESS_MESSAGES=./zkeys/…  ZKEY_TALLY_VOTES=./zkeys/… \
 *     npx hardhat run scripts/deploy-maci-gnosis-v2.cjs --network gnosis
 *
 * Reuses the EXISTING Shamir-split coordinator keypair (same pubkey) → the 3-of-5
 * Attester federation keeps working unchanged; only the chain/addresses move.
 *
 * NOTE: SignUpTokenGatekeeper checks `hasCitizenNFT` (not `isActive`) — same as v1.
 * Dormant-citizen enforcement at signup is a later, validity-aware gatekeeper.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { extractVk } = require("maci-circuits");
const { VerifyingKey } = require("maci-domainobjs");
const { genEmptyBallotRoots } = require("maci-contracts");

// Ceremony params — identical to Base (matches the downloaded production zKeys).
const STATE_TREE_DEPTH = 14;
const INT_STATE_TREE_DEPTH = 5;
const MESSAGE_TREE_DEPTH = 9;
const MESSAGE_BATCH_DEPTH = 2;
const VOTE_OPTION_TREE_DEPTH = 3;
const MESSAGE_BATCH_SIZE = 5 ** MESSAGE_BATCH_DEPTH;
const MODE_NON_QV = 1;

const REQUIRED_ENV = [
  "COORDINATOR_ADDRESS", "COORDINATOR_PUBKEY_X", "COORDINATOR_PUBKEY_Y",
  "VOTING_PERIOD_SECONDS", "QUORUM_PERCENTAGE", "QUORUM_ABSOLUTE",
  "TALLY_GRACE_PERIOD_SECONDS", "TIMELOCK_MIN_DELAY_SECONDS",
  "ZKEY_PROCESS_MESSAGES", "ZKEY_TALLY_VOTES",
];

function readEnv() {
  const missing = [], out = {};
  for (const k of REQUIRED_ENV) {
    const v = process.env[k];
    if (!v || v === "0" || v === "0x0000000000000000000000000000000000000000") missing.push(k);
    else out[k] = v;
  }
  if (missing.length) throw new Error("Missing/placeholder .env values: " + missing.join(", "));
  return out;
}

function loadV2Nfts() {
  const f = path.resolve(__dirname, "../deployments/gnosis-v2.json");
  if (!fs.existsSync(f)) throw new Error("deployments/gnosis-v2.json missing — run deploy-gnosis-v2.cjs first.");
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!j.addresses?.attesterNFT || !j.addresses?.citizenNFT) throw new Error("gnosis-v2.json missing NFT addresses.");
  return j;
}

function assertFile(p) {
  if (!fs.existsSync(p)) throw new Error("zKey not found at " + p + ". Run `bash scripts/download-zkeys.sh`.");
}

async function deployContract(name, signer, ...args) {
  const F = await hre.ethers.getContractFactory(name, signer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function deployPoseidonFromPrebuilt(which, signer) {
  const candidates = [
    path.resolve(__dirname, "../node_modules/maci-contracts/build/artifacts/contracts/crypto", `${which}.sol`, `${which}.json`),
    path.resolve(__dirname, "../../../node_modules/maci-contracts/build/artifacts/contracts/crypto", `${which}.sol`, `${which}.json`),
  ];
  const artifactPath = candidates.find((c) => fs.existsSync(c));
  if (!artifactPath) throw new Error(`Could not find prebuilt ${which} artifact in:\n  ` + candidates.join("\n  "));
  const art = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const F = new hre.ethers.ContractFactory(art.abi, art.bytecode, signer);
  const c = await F.deploy();
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

async function main() {
  const env = readEnv();
  const { ethers, network } = hre;
  if (network.name !== "gnosis" && network.name !== "hardhat") {
    throw new Error(`Refusing to deploy to "${network.name}" — expected "gnosis" (or "hardhat" for a fork dry-run).`);
  }
  assertFile(env.ZKEY_PROCESS_MESSAGES);
  assertFile(env.ZKEY_TALLY_VOTES);

  const v2 = loadV2Nfts();
  const ATTESTER_NFT = ethers.getAddress(v2.addresses.attesterNFT);
  const CITIZEN_NFT = ethers.getAddress(v2.addresses.citizenNFT);

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startBal = await ethers.provider.getBalance(deployerAddr);

  console.log("=== MACI + Governor on Gnosis (v2-hardened identity) ===");
  console.log("Deployer:    ", deployerAddr, "| balance:", ethers.formatEther(startBal), "xDAI");
  console.log("AttesterNFTv2:", ATTESTER_NFT);
  console.log("CitizenNFTv2: ", CITIZEN_NFT);
  console.log("Coordinator:  ", env.COORDINATOR_ADDRESS, "\n");

  console.log("[1/9] SignUpTokenGatekeeper(CitizenNFTv2)…");
  const gatekeeper = await deployContract("SignUpTokenGatekeeper", deployer, CITIZEN_NFT);
  const gatekeeperAddr = await gatekeeper.getAddress();
  console.log("      →", gatekeeperAddr);

  console.log("[2/9] ConstantInitialVoiceCreditProxy(1)…");
  const voiceCreditProxy = await deployContract("ConstantInitialVoiceCreditProxy", deployer, 1);
  const voiceCreditProxyAddr = await voiceCreditProxy.getAddress();
  console.log("      →", voiceCreditProxyAddr);

  console.log("[3/9] Poseidon T3/T4/T5/T6…");
  const poseidonAddrs = {
    PoseidonT3: await (await deployPoseidonFromPrebuilt("PoseidonT3", deployer)).getAddress(),
    PoseidonT4: await (await deployPoseidonFromPrebuilt("PoseidonT4", deployer)).getAddress(),
    PoseidonT5: await (await deployPoseidonFromPrebuilt("PoseidonT5", deployer)).getAddress(),
    PoseidonT6: await (await deployPoseidonFromPrebuilt("PoseidonT6", deployer)).getAddress(),
  };
  for (const [k, v] of Object.entries(poseidonAddrs)) console.log("      →", k + ":", v);

  console.log("[4/9] PollFactory + MessageProcessorFactory + TallyFactory…");
  const pollFactoryAddr = await (await deployLinked("PollFactory", deployer, poseidonAddrs)).getAddress();
  const mpFactoryAddr = await (await deployLinked("MessageProcessorFactory", deployer, poseidonAddrs)).getAddress();
  const tallyFactoryAddr = await (await deployLinked("TallyFactory", deployer, poseidonAddrs)).getAddress();
  console.log("      → PollFactory:", pollFactoryAddr, "\n      → MPFactory:", mpFactoryAddr, "\n      → TallyFactory:", tallyFactoryAddr);

  console.log("[5/9] MACI core…");
  const emptyBallotRoots = genEmptyBallotRoots(STATE_TREE_DEPTH);
  const maci = await deployLinked(
    "MACI", deployer, poseidonAddrs,
    pollFactoryAddr, mpFactoryAddr, tallyFactoryAddr, gatekeeperAddr, voiceCreditProxyAddr,
    STATE_TREE_DEPTH, emptyBallotRoots
  );
  const maciAddr = await maci.getAddress();
  const maciDeployBlock = await ethers.provider.getBlockNumber();
  console.log("      →", maciAddr, "(block", maciDeployBlock + ")");
  await (await gatekeeper.setMaciInstance(maciAddr)).wait();
  console.log("      → gatekeeper.setMaciInstance(MACI)");

  console.log("[6/9] Verifier…");
  const verifierAddr = await (await deployContract("Verifier", deployer)).getAddress();
  console.log("      →", verifierAddr);

  console.log("[7/9] VkRegistry + setVerifyingKeysBatch(non-QV)…");
  const vkRegistry = await deployContract("VkRegistry", deployer);
  const vkRegistryAddr = await vkRegistry.getAddress();
  const processVk = VerifyingKey.fromObj(await extractVk(env.ZKEY_PROCESS_MESSAGES)).asContractParam();
  const tallyVk = VerifyingKey.fromObj(await extractVk(env.ZKEY_TALLY_VOTES)).asContractParam();
  await (await vkRegistry.setVerifyingKeysBatch(
    STATE_TREE_DEPTH, INT_STATE_TREE_DEPTH, MESSAGE_TREE_DEPTH, VOTE_OPTION_TREE_DEPTH, MESSAGE_BATCH_SIZE,
    [MODE_NON_QV], [processVk], [tallyVk]
  )).wait();
  console.log("      →", vkRegistryAddr);

  console.log("[8/9] TimelockController…");
  const timelock = await deployContract(
    "TimelockController", deployer,
    BigInt(env.TIMELOCK_MIN_DELAY_SECONDS), [], [ethers.ZeroAddress], deployerAddr
  );
  const timelockAddr = await timelock.getAddress();
  console.log("      →", timelockAddr);

  console.log("[9/9] MaciAttesterGovernor…");
  const governor = await deployContract("MaciAttesterGovernor", deployer, {
    attesterNFT: ATTESTER_NFT,
    citizenNFT: CITIZEN_NFT,
    maci: maciAddr,
    verifier: verifierAddr,
    vkRegistry: vkRegistryAddr,
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
  console.log("      →", governorAddr);

  console.log("\nLocking down Timelock (Governor = proposer/canceller; deployer renounces admin)…");
  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), governorAddr)).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), governorAddr)).wait();
  await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployerAddr)).wait();
  console.log("→ Timelock locked.");

  // Merge into gnosis-v2.json (keep the NFT identity record intact).
  const f = path.resolve(__dirname, "../deployments/gnosis-v2.json");
  const out = JSON.parse(fs.readFileSync(f, "utf8"));
  Object.assign(out.addresses, {
    gatekeeper: gatekeeperAddr, voiceCreditProxy: voiceCreditProxyAddr, maci: maciAddr,
    verifier: verifierAddr, vkRegistry: vkRegistryAddr, ...poseidonAddrs,
    pollFactory: pollFactoryAddr, messageProcessorFactory: mpFactoryAddr, tallyFactory: tallyFactoryAddr,
    timelock: timelockAddr, maciAttesterGovernor: governorAddr, coordinator: env.COORDINATOR_ADDRESS,
  });
  out.maciDeployBlock = maciDeployBlock;
  out.parameters = {
    ...(out.parameters || {}),
    stateTreeDepth: STATE_TREE_DEPTH, intStateTreeDepth: INT_STATE_TREE_DEPTH, messageTreeDepth: MESSAGE_TREE_DEPTH,
    voteOptionTreeDepth: VOTE_OPTION_TREE_DEPTH, messageBatchSize: MESSAGE_BATCH_SIZE, mode: "NON_QV",
    votingPeriod: Number(env.VOTING_PERIOD_SECONDS), quorumPercentage: Number(env.QUORUM_PERCENTAGE),
    quorumAbsolute: Number(env.QUORUM_ABSOLUTE), tallyGracePeriod: Number(env.TALLY_GRACE_PERIOD_SECONDS),
    timelockMinDelay: Number(env.TIMELOCK_MIN_DELAY_SECONDS),
    coordinatorPubKey: { x: env.COORDINATOR_PUBKEY_X, y: env.COORDINATOR_PUBKEY_Y },
  };
  out.governanceDeployedAt = new Date().toISOString();
  fs.writeFileSync(f, JSON.stringify(out, null, 2));

  console.log("\nGas spent:", ethers.formatEther(startBal - (await ethers.provider.getBalance(deployerAddr))), "xDAI");
  console.log("Merged into", f);
  console.log("\nIMPORTANT: bind the NFT contracts to governance — once the Safe is ready, the Safe should");
  console.log("transferOwnership of AttesterNFTv2/CitizenNFTv2 to the Timelock if you want full on-chain");
  console.log("governance (D2 keeps Safe ownership for bootstrap; threshold changes = Safe tx for now).");
  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
