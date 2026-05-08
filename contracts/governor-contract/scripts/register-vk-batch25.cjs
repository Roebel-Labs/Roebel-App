/**
 * Deploy a fresh VkRegistry, register the production VKs at the correct
 * messageBatchSize=25 key, and write its address back into deployments/base.json
 * under `addresses.vkRegistry` (archiving the old one).
 *
 * Why a new registry: VkRegistry's setVerifyingKeysBatch always sets both the
 * process and tally VKs, and the tally VK signature is computed without
 * messageBatchSize. The previous deploy already registered the tally VK at
 * (14, 9, 3, NON_QV), so any subsequent setVerifyingKeysBatch — even with a
 * different messageBatchSize — reverts with TallyVkAlreadySet. There's no
 * setProcessVk-only entry point on VkRegistry, so a fresh registry is the
 * minimal surgery. MACI core, Verifier, Gatekeeper, and the Poseidon libs
 * all stay; only VkRegistry + Governor + Timelock get rotated.
 *
 * Run:
 *   npx hardhat run scripts/register-vk-batch25.cjs --network base
 *
 * Required env (already in contracts/governor-contract/.env):
 *   ZKEY_PROCESS_MESSAGES, ZKEY_TALLY_VOTES, BASE_RPC_URL, PRIVATE_KEY
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const hre = require("hardhat");
const { extractVk } = require("maci-circuits");
const { VerifyingKey } = require("maci-domainobjs");

// Param order matches the circuit template signatures, not the zKey filename:
//   ProcessMessagesNonQv_14-9-2-3 = (stateTreeDepth=14, msgTreeDepth=9,
//                                    msgBatchDepth=2, voteOptionTreeDepth=3)
//   TallyVotesNonQv_14-5-3        = (stateTreeDepth=14, intStateTreeDepth=5,
//                                    voteOptionTreeDepth=3)
// VkRegistry signature for setVerifyingKeys is
//   (stateTreeDepth, intStateTreeDepth, messageTreeDepth, voteOptionTreeDepth, messageBatchSize)
const STATE_TREE_DEPTH = 14;
const INT_STATE_TREE_DEPTH = 5;
const MESSAGE_TREE_DEPTH = 9;
const VOTE_OPTION_TREE_DEPTH = 3;
const MESSAGE_BATCH_SIZE = 25;
const MODE_NON_QV = 1;

async function main() {
  const baseJsonPath = path.resolve(__dirname, "../deployments/base.json");
  const baseJson = JSON.parse(fs.readFileSync(baseJsonPath, "utf8"));

  for (const k of ["ZKEY_PROCESS_MESSAGES", "ZKEY_TALLY_VOTES"]) {
    if (!process.env[k] || !fs.existsSync(process.env[k])) {
      throw new Error(`Missing/invalid ${k}: ${process.env[k]}`);
    }
  }

  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:           " + (await signer.getAddress()));
  console.log("Old VkRegistry:   " + baseJson.addresses.vkRegistry);

  console.log("Deploying fresh VkRegistry…");
  const VkRegistry = await hre.ethers.getContractFactory("VkRegistry", signer);
  const reg = await VkRegistry.deploy();
  await reg.waitForDeployment();
  const newAddr = await reg.getAddress();
  console.log("New VkRegistry:   " + newAddr);

  const procVkObj = await extractVk(process.env.ZKEY_PROCESS_MESSAGES);
  const tallyVkObj = await extractVk(process.env.ZKEY_TALLY_VOTES);
  const processVk = VerifyingKey.fromObj(procVkObj).asContractParam();
  const tallyVk = VerifyingKey.fromObj(tallyVkObj).asContractParam();

  console.log(`Registering VKs at messageBatchSize=${MESSAGE_BATCH_SIZE}…`);
  const tx = await reg.setVerifyingKeysBatch(
    STATE_TREE_DEPTH,
    INT_STATE_TREE_DEPTH,
    MESSAGE_TREE_DEPTH,
    VOTE_OPTION_TREE_DEPTH,
    MESSAGE_BATCH_SIZE,
    [MODE_NON_QV],
    [processVk],
    [tallyVk],
  );
  console.log("tx:               " + tx.hash);
  const receipt = await tx.wait();
  console.log("✓ confirmed in block " + receipt.blockNumber + ", gas used " + receipt.gasUsed.toString());

  const archived = { ...baseJson.addresses };
  const tag = "vkRegistry_archived_" + new Date().toISOString().replace(/[:.]/g, "-");
  archived[tag] = baseJson.addresses.vkRegistry;
  archived.vkRegistry = newAddr;

  const updated = {
    ...baseJson,
    deployedAt: new Date().toISOString(),
    addresses: archived,
    parameters: { ...baseJson.parameters, messageBatchSize: MESSAGE_BATCH_SIZE },
  };
  fs.writeFileSync(baseJsonPath, JSON.stringify(updated, null, 2));
  console.log("Updated " + baseJsonPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
