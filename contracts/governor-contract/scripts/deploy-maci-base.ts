/**
 * Deploys the full MACI v2 stack + Roebel/Müritz governance on Base mainnet.
 *
 * Prerequisites (one-time):
 *   1. `cp .env.example .env` and fill in real values (see header comments)
 *   2. `bash scripts/download-zkeys.sh` (~1.5 GB ceremony tarball)
 *   3. Generate the coordinator MACI keypair on the coordinator host (NOT here):
 *        pnpm dlx maci-cli generateMaciKeypair
 *      Paste the resulting (x, y) decimal values into COORDINATOR_PUBKEY_X / Y in .env.
 *      Set COORDINATOR_ADDRESS to the EOA (or Safe) the coordinator service uses to
 *      submit MessageProcessor / Tally proofs on-chain.
 *
 * Run:
 *   npx hardhat run scripts/deploy-maci-base.ts --network base
 *
 * Outputs: deployments/base.json
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {
  deploySignupTokenGatekeeper,
  deployConstantInitialVoiceCreditProxy,
  deployVerifier,
  deployVkRegistry,
  deployMaci,
  EMode,
} from "maci-contracts";
import { extractVk } from "maci-circuits";
import { VerifyingKey } from "maci-domainobjs";

// MACI ceremony parameter set — see deploy-maci-base.cjs for the full
// derivation. The 4-tuple in each zKey filename maps directly to the circuit
// template params, NOT the Poll.treeDepths field order.
const STATE_TREE_DEPTH = 14;
const INT_STATE_TREE_DEPTH = 5;     // tally circuit: TallyVotesNonQv_14-5-3
const MESSAGE_TREE_DEPTH = 9;       // process circuit: msgTreeDepth in 14-9-2-3
const MESSAGE_BATCH_DEPTH = 2;      // process circuit: msgBatchDepth
const VOTE_OPTION_TREE_DEPTH = 3;
const MESSAGE_BATCH_SIZE = 5 ** MESSAGE_BATCH_DEPTH;

interface RequiredEnv {
  ATTESTER_NFT_ADDRESS: string;
  CITIZEN_NFT_ADDRESS: string;
  COORDINATOR_ADDRESS: string;
  COORDINATOR_PUBKEY_X: string;
  COORDINATOR_PUBKEY_Y: string;
  ZKEY_PROCESS_MESSAGES: string;
  ZKEY_TALLY_VOTES: string;
  VOTING_PERIOD_SECONDS: string;
  QUORUM_PERCENTAGE: string;
  TALLY_GRACE_PERIOD_SECONDS: string;
  TIMELOCK_MIN_DELAY_SECONDS: string;
}

function readEnv(): RequiredEnv {
  const required = [
    "ATTESTER_NFT_ADDRESS",
    "CITIZEN_NFT_ADDRESS",
    "COORDINATOR_ADDRESS",
    "COORDINATOR_PUBKEY_X",
    "COORDINATOR_PUBKEY_Y",
    "ZKEY_PROCESS_MESSAGES",
    "ZKEY_TALLY_VOTES",
    "VOTING_PERIOD_SECONDS",
    "QUORUM_PERCENTAGE",
    "TALLY_GRACE_PERIOD_SECONDS",
    "TIMELOCK_MIN_DELAY_SECONDS",
  ] as const;

  const missing: string[] = [];
  const out: Record<string, string> = {};
  for (const key of required) {
    const v = process.env[key];
    if (!v || v === "0" || v === "0x0000000000000000000000000000000000000000") {
      missing.push(key);
    } else {
      out[key] = v;
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing/placeholder .env values: ${missing.join(", ")}`);
  }
  return out as unknown as RequiredEnv;
}

function assertFile(p: string): void {
  if (!fs.existsSync(p)) {
    throw new Error(`zKey file not found at ${p}. Run \`bash scripts/download-zkeys.sh\` first.`);
  }
}

async function main() {
  const env = readEnv();

  if (network.name !== "base" && network.name !== "baseSepolia" && network.name !== "hardhat") {
    throw new Error(`Refusing to deploy to network "${network.name}" — expected "base" or "baseSepolia".`);
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startingBalance = await ethers.provider.getBalance(deployerAddr);

  console.log(`\n=== Deploying MACI v2 to ${network.name} ===`);
  console.log(`Deployer:   ${deployerAddr}`);
  console.log(`Balance:    ${ethers.formatEther(startingBalance)} ETH`);
  console.log(`AttesterNFT: ${env.ATTESTER_NFT_ADDRESS}`);
  console.log(`CitizenNFT:  ${env.CITIZEN_NFT_ADDRESS}`);
  console.log(`Coordinator: ${env.COORDINATOR_ADDRESS}\n`);

  assertFile(env.ZKEY_PROCESS_MESSAGES);
  assertFile(env.ZKEY_TALLY_VOTES);

  // --- 1. SignUpTokenGatekeeper bound to CitizenNFT ---
  console.log("[1/8] SignUpTokenGatekeeper(CitizenNFT)…");
  const gatekeeper = await deploySignupTokenGatekeeper(env.CITIZEN_NFT_ADDRESS, deployer, true);
  const gatekeeperAddr = await gatekeeper.getAddress();
  console.log(`      → ${gatekeeperAddr}`);

  // --- 2. ConstantInitialVoiceCreditProxy(1) — 1 NFT = 1 credit (non-QV) ---
  console.log("[2/8] ConstantInitialVoiceCreditProxy(1)…");
  const voiceCreditProxy = await deployConstantInitialVoiceCreditProxy(1, deployer, true);
  const voiceCreditProxyAddr = await voiceCreditProxy.getAddress();
  console.log(`      → ${voiceCreditProxyAddr}`);

  // --- 3. MACI core (deploys Poseidons + factories internally, links libraries) ---
  console.log("[3/8] MACI core + Poseidons + PollFactory + MPFactory + TallyFactory…");
  const { maciContract, poseidonAddrs } = await deployMaci({
    signUpTokenGatekeeperContractAddress: gatekeeperAddr,
    initialVoiceCreditBalanceAddress: voiceCreditProxyAddr,
    signer: deployer,
    stateTreeDepth: STATE_TREE_DEPTH,
    quiet: true,
  });
  const maciAddr = await maciContract.getAddress();
  console.log(`      → MACI:       ${maciAddr}`);
  console.log(`      → PoseidonT3: ${poseidonAddrs.poseidonT3}`);
  console.log(`      → PoseidonT4: ${poseidonAddrs.poseidonT4}`);
  console.log(`      → PoseidonT5: ${poseidonAddrs.poseidonT5}`);
  console.log(`      → PoseidonT6: ${poseidonAddrs.poseidonT6}`);

  // --- 4. Bind gatekeeper to MACI ---
  console.log("[4/8] gatekeeper.setMaciInstance(MACI)…");
  await (await gatekeeper.setMaciInstance(maciAddr)).wait();

  // --- 5. Verifier ---
  console.log("[5/8] Verifier…");
  const verifier = await deployVerifier(deployer, true);
  const verifierAddr = await verifier.getAddress();
  console.log(`      → ${verifierAddr}`);

  // --- 6. VkRegistry + load production ceremony VKs ---
  console.log("[6/8] VkRegistry + setVerifyingKeysBatch(non-QV)…");
  const vkRegistry = await deployVkRegistry(deployer, true);
  const vkRegistryAddr = await vkRegistry.getAddress();

  const procVkObj = await extractVk(env.ZKEY_PROCESS_MESSAGES);
  const tallyVkObj = await extractVk(env.ZKEY_TALLY_VOTES);
  const processVk = VerifyingKey.fromObj(procVkObj).asContractParam();
  const tallyVk = VerifyingKey.fromObj(tallyVkObj).asContractParam();

  // VkRegistry.setVerifyingKeysBatch(stateTreeDepth, intStateTreeDepth, messageTreeDepth,
  //   voteOptionTreeDepth, messageBatchSize, modes[], processZkeys[], tallyZkeys[])
  await (
    await vkRegistry.setVerifyingKeysBatch(
      STATE_TREE_DEPTH,
      INT_STATE_TREE_DEPTH,
      MESSAGE_TREE_DEPTH,
      VOTE_OPTION_TREE_DEPTH,
      MESSAGE_BATCH_SIZE,
      [EMode.NON_QV],
      [processVk],
      [tallyVk],
    )
  ).wait();
  console.log(`      → VkRegistry: ${vkRegistryAddr}`);

  // --- 7. TimelockController ---
  console.log("[7/8] TimelockController…");
  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(
    BigInt(env.TIMELOCK_MIN_DELAY_SECONDS),
    [], // proposers — granted to Governor below
    [ethers.ZeroAddress], // executors — anyone can execute (standard pattern)
    deployerAddr, // admin — renounced after Governor wiring (manual step, see README)
  );
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();
  console.log(`      → ${timelockAddr}`);

  // --- 8. MaciAttesterGovernor ---
  console.log("[8/8] MaciAttesterGovernor…");
  const Governor = await ethers.getContractFactory("MaciAttesterGovernor");
  const governor = await Governor.deploy({
    attesterNFT: env.ATTESTER_NFT_ADDRESS,
    citizenNFT: env.CITIZEN_NFT_ADDRESS,
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
    mode: EMode.NON_QV,
    timelock: timelockAddr,
    votingPeriod: BigInt(env.VOTING_PERIOD_SECONDS),
    quorumPercentage: BigInt(env.QUORUM_PERCENTAGE),
    tallyGracePeriod: BigInt(env.TALLY_GRACE_PERIOD_SECONDS),
  });
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log(`      → ${governorAddr}`);

  // --- Wire Timelock roles (PROPOSER + CANCELLER to Governor; renounce admin) ---
  console.log("\nGranting timelock roles to Governor + renouncing deployer admin…");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  await (await timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr)).wait();
  console.log("→ Timelock locked down.\n");

  // --- Persist addresses ---
  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    addresses: {
      // Reused (existing) Roebel contracts
      attesterNFT: env.ATTESTER_NFT_ADDRESS,
      citizenNFT: env.CITIZEN_NFT_ADDRESS,
      // Freshly deployed
      gatekeeper: gatekeeperAddr,
      voiceCreditProxy: voiceCreditProxyAddr,
      maci: maciAddr,
      verifier: verifierAddr,
      vkRegistry: vkRegistryAddr,
      poseidonT3: poseidonAddrs.poseidonT3,
      poseidonT4: poseidonAddrs.poseidonT4,
      poseidonT5: poseidonAddrs.poseidonT5,
      poseidonT6: poseidonAddrs.poseidonT6,
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
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Addresses written to ${outFile}`);

  const endingBalance = await ethers.provider.getBalance(deployerAddr);
  const spent = startingBalance - endingBalance;
  console.log(`\nTotal gas spent: ${ethers.formatEther(spent)} ETH`);
  console.log("\n=== DONE ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
