/**
 * Verifies the 2026-05 verification redeploy on Basescan.
 *
 *   pnpm hardhat run scripts/verify-redeploy.cjs --network base
 *
 * Each verify call is wrapped in try/catch so one failure doesn't block the
 * others. "Already Verified" responses are treated as success.
 */
const hre = require("hardhat");

const ADDRS = {
  attesterNFT: "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb",
  citizenNFT: "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB",
  gatekeeper: "0xcf12E8da5f7599dd9162e07388715bBa11739F2e",
  timelock: "0xe8B8149F9373a56F55112e5Fc867E58308D014c1",
  maciAttesterGovernor: "0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177",
};

const DEPLOYER = "0x400679C76c1a49e8b8327F6E030a5A9Ae7940f4E";
const FOUNDERS = [
  "0xc49de63ccfee46c6c5c3e393293f66779799fb28",
  "0x90f677dc480e76a127ec1dce42263a370e396313",
  "0xf468d87fca0e15bc2c383ef482d38b9b77812b29",
];

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
  require("dotenv").config();
  const env = process.env;

  // 1) AttesterNFT
  await verify(
    "AttesterNFT",
    ADDRS.attesterNFT,
    [DEPLOYER, "Roebel Attester", "ROEBEL-ATTESTER", FOUNDERS, 2, 2],
    "contracts/verification-system/AttesterNFT.sol:AttesterNFT"
  );

  // 2) CitizenNFT
  await verify(
    "CitizenNFT",
    ADDRS.citizenNFT,
    [ADDRS.attesterNFT, DEPLOYER, FOUNDERS, 1, 1, 1, 1, 1, 1],
    "contracts/verification-system/CitizenNFT.sol:CitizenNFT"
  );

  // 3) SignUpTokenGatekeeper (MACI contract, single ctor arg = token addr)
  await verify(
    "SignUpTokenGatekeeper",
    ADDRS.gatekeeper,
    [ADDRS.citizenNFT]
  );

  // 4) TimelockController
  await verify(
    "TimelockController",
    ADDRS.timelock,
    [
      Number(env.TIMELOCK_MIN_DELAY_SECONDS),
      [], // proposers (empty at deploy; granted later)
      ["0x0000000000000000000000000000000000000000"], // executors (anyone)
      DEPLOYER, // admin (renounced post-wire)
    ],
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController"
  );

  // 5) MaciAttesterGovernor (single struct arg)
  const initArgs = {
    attesterNFT: ADDRS.attesterNFT,
    citizenNFT: ADDRS.citizenNFT,
    maci: "0x2922e42945a10d1F765E3f9Cab136421d4556D30",
    verifier: "0x6682A865C9e2cAAC89DAAAdf25e15bc90db482D8",
    vkRegistry: "0xd6EF1Ad8cCAFC41bf025efe620e27d8CF18B91ED",
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
    timelock: ADDRS.timelock,
    votingPeriod: Number(env.VOTING_PERIOD_SECONDS),
    quorumPercentage: Number(env.QUORUM_PERCENTAGE),
    quorumAbsolute: Number(env.QUORUM_ABSOLUTE),
    tallyGracePeriod: Number(env.TALLY_GRACE_PERIOD_SECONDS),
  };

  await verify(
    "MaciAttesterGovernor",
    ADDRS.maciAttesterGovernor,
    [initArgs],
    "contracts/verification-system/MaciAttesterGovernor.sol:MaciAttesterGovernor"
  );

  console.log("\n=== Verification pass complete ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
