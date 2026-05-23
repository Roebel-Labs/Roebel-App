/**
 * Recovery script — completes the role wiring + ownership transfer for the
 * 2026-05 verification redeploy after the main script (redeploy-verification.cjs)
 * crashed on a `getContractFactory("TimelockController")` ABI lookup. All 5
 * contracts deployed successfully; only the final rewire was incomplete.
 *
 *   pnpm hardhat run scripts/finish-redeploy-rewire.cjs --network base
 *
 * Uses minimal ABI fragments (no getContractFactory) so the script is immune to
 * artifact-discovery issues.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ADDRS = {
  attesterNFT: "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb",
  citizenNFT: "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB",
  gatekeeper: "0xcf12E8da5f7599dd9162e07388715bBa11739F2e",
  timelock: "0xe8B8149F9373a56F55112e5Fc867E58308D014c1",
  maciAttesterGovernor: "0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177",
};

const TIMELOCK_ABI = [
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function CANCELLER_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function grantRole(bytes32,address)",
  "function renounceRole(bytes32,address)",
];

const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function transferOwnership(address)",
];

async function main() {
  const rpc = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpc);
  const pk = process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
    ? process.env.DEPLOYER_PRIVATE_KEY
    : "0x" + process.env.DEPLOYER_PRIVATE_KEY;
  const deployer = new ethers.Wallet(pk, provider);

  console.log("\n=== Finish redeploy rewire ===");
  console.log("Deployer:  " + deployer.address);
  console.log("Balance:   " + ethers.formatEther(await provider.getBalance(deployer.address)) + " ETH");
  console.log("Targets:");
  for (const [k, v] of Object.entries(ADDRS)) console.log("  " + k.padEnd(22) + " " + v);

  const timelock = new ethers.Contract(ADDRS.timelock, TIMELOCK_ABI, deployer);
  const attesterNFT = new ethers.Contract(ADDRS.attesterNFT, OWNABLE_ABI, deployer);
  const citizenNFT = new ethers.Contract(ADDRS.citizenNFT, OWNABLE_ABI, deployer);

  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  console.log("\nRole hashes:");
  console.log("  PROPOSER_ROLE      " + PROPOSER_ROLE);
  console.log("  CANCELLER_ROLE     " + CANCELLER_ROLE);
  console.log("  DEFAULT_ADMIN_ROLE " + DEFAULT_ADMIN_ROLE);

  // Pre-state
  const adminPre = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  const proposerPre = await timelock.hasRole(PROPOSER_ROLE, ADDRS.maciAttesterGovernor);
  const cancellerPre = await timelock.hasRole(CANCELLER_ROLE, ADDRS.maciAttesterGovernor);
  const attOwnerPre = await attesterNFT.owner();
  const citOwnerPre = await citizenNFT.owner();
  console.log("\nPre-state:");
  console.log("  deployer DEFAULT_ADMIN_ROLE on timelock: " + adminPre);
  console.log("  governor PROPOSER_ROLE on timelock:      " + proposerPre);
  console.log("  governor CANCELLER_ROLE on timelock:     " + cancellerPre);
  console.log("  attesterNFT owner: " + attOwnerPre);
  console.log("  citizenNFT  owner: " + citOwnerPre);

  if (!adminPre && (!proposerPre || !cancellerPre)) {
    throw new Error("Deployer is not admin and roles missing — irrecoverable without governance proposal");
  }

  async function send(label, fn) {
    console.log("\n• " + label);
    if (!fn) return;
    const tx = await fn();
    console.log("  tx: " + tx.hash);
    const rc = await tx.wait();
    console.log("  ✓ block " + rc.blockNumber + ", gas " + rc.gasUsed.toString());
  }

  if (!proposerPre) {
    await send(
      "grantRole(PROPOSER_ROLE, MaciAttesterGovernor)",
      () => timelock.grantRole(PROPOSER_ROLE, ADDRS.maciAttesterGovernor)
    );
  } else {
    console.log("\n• PROPOSER_ROLE already granted — skipping");
  }

  if (!cancellerPre) {
    await send(
      "grantRole(CANCELLER_ROLE, MaciAttesterGovernor)",
      () => timelock.grantRole(CANCELLER_ROLE, ADDRS.maciAttesterGovernor)
    );
  } else {
    console.log("\n• CANCELLER_ROLE already granted — skipping");
  }

  if (attOwnerPre.toLowerCase() === deployer.address.toLowerCase()) {
    await send(
      "attesterNFT.transferOwnership(Timelock)",
      () => attesterNFT.transferOwnership(ADDRS.timelock)
    );
  } else if (attOwnerPre.toLowerCase() === ADDRS.timelock.toLowerCase()) {
    console.log("\n• AttesterNFT already owned by Timelock — skipping");
  } else {
    throw new Error("Unexpected AttesterNFT owner " + attOwnerPre);
  }

  if (citOwnerPre.toLowerCase() === deployer.address.toLowerCase()) {
    await send(
      "citizenNFT.transferOwnership(Timelock)",
      () => citizenNFT.transferOwnership(ADDRS.timelock)
    );
  } else if (citOwnerPre.toLowerCase() === ADDRS.timelock.toLowerCase()) {
    console.log("\n• CitizenNFT already owned by Timelock — skipping");
  } else {
    throw new Error("Unexpected CitizenNFT owner " + citOwnerPre);
  }

  if (adminPre) {
    await send(
      "renounceRole(DEFAULT_ADMIN_ROLE, deployer)",
      () => timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)
    );
    const adminPost = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    if (adminPost) throw new Error("Renounce did not take effect");
  } else {
    console.log("\n• DEFAULT_ADMIN_ROLE already renounced — skipping");
  }

  // Final state
  console.log("\n=== Post-state ===");
  console.log("  deployer DEFAULT_ADMIN_ROLE: " + (await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)));
  console.log("  governor PROPOSER_ROLE:      " + (await timelock.hasRole(PROPOSER_ROLE, ADDRS.maciAttesterGovernor)));
  console.log("  governor CANCELLER_ROLE:     " + (await timelock.hasRole(CANCELLER_ROLE, ADDRS.maciAttesterGovernor)));
  console.log("  attesterNFT owner:           " + (await attesterNFT.owner()));
  console.log("  citizenNFT  owner:           " + (await citizenNFT.owner()));

  // Persist addresses
  const baseJsonPath = path.resolve(__dirname, "../deployments", "base.json");
  const prior = JSON.parse(fs.readFileSync(baseJsonPath, "utf8"));
  const archived = { ...prior.addresses };
  for (const [k, v] of Object.entries(ADDRS)) {
    const oldVal = archived[k];
    if (oldVal && oldVal.toLowerCase() !== v.toLowerCase()) {
      const tag = `${k}_archived_` + new Date().toISOString().replace(/[:.]/g, "-");
      archived[tag] = oldVal;
    }
    archived[k] = v;
  }
  const out = {
    ...prior,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    addresses: archived,
    parameters: {
      ...prior.parameters,
      votingPeriod: Number(process.env.VOTING_PERIOD_SECONDS),
      quorumPercentage: Number(process.env.QUORUM_PERCENTAGE),
      quorumAbsolute: Number(process.env.QUORUM_ABSOLUTE),
      tallyGracePeriod: Number(process.env.TALLY_GRACE_PERIOD_SECONDS),
      timelockMinDelay: Number(process.env.TIMELOCK_MIN_DELAY_SECONDS),
      citizenNftThresholds: {
        attestation: { attester: 1, citizen: 1 },
        revocation: { attester: 1, citizen: 1 },
        rejection: { attester: 1, citizen: 1 },
      },
      attesterNftThresholds: { signatures: 2, rejections: 2 },
      initialOwner: deployer.address,
    },
  };
  fs.writeFileSync(baseJsonPath, JSON.stringify(out, null, 2));
  console.log("\nAddresses written to " + baseJsonPath);

  console.log("\n=== DONE ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
