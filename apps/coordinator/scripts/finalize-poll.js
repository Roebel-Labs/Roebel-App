#!/usr/bin/env node
/**
 * Finalize a MACI v2 poll end-to-end.
 *
 * Sequence (matches maci-cli@2.5.0):
 *   1. mergeSignups   — collapse the global MACI state tree (idempotent across polls
 *                       on the same MACI instance)
 *   2. mergeMessages  — collapse this poll's message accumulator
 *   3. genProofs      — generate ZK proofs locally (process + tally) using the
 *                       ceremony zKeys mounted at $ZKEY_DIR
 *   4. proveOnChain   — submit the process and tally proofs to MessageProcessor
 *                       and Tally
 *   5. verify         — sanity-check the on-chain results match the local tally.json
 *
 * Run:
 *   node scripts/finalize-poll.js <pollId>
 *
 * Required env (set as Fly secrets):
 *   COORDINATOR_PRIV       — macisk.<…> Babyjubjub privkey
 *   COORDINATOR_ETH_PRIV   — Ethereum privkey for the address that owns MP and Tally
 *   BASE_RPC_URL           — JSON-RPC endpoint
 *   MACI_ADDRESS           — from contracts/governor-contract/deployments/base.json
 *   VERIFIER_ADDRESS       — same
 *   VK_REGISTRY_ADDRESS    — same
 *
 * Optional:
 *   PROOF_DIR              — defaults to /app/proofs
 *   ZKEY_DIR               — defaults to /app/zkeys
 *
 * Layer-1 hardening (TODO): when SAFE_ADDRESS is set, this script should propose
 * the proveOnChain transactions to the Safe Transaction Service instead of
 * broadcasting directly. Until that's wired up, the configured EOA broadcasts.
 */

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const REQUIRED_ENV = [
  "COORDINATOR_PRIV",
  "COORDINATOR_ETH_PRIV",
  "BASE_RPC_URL",
  "MACI_ADDRESS",
  "VERIFIER_ADDRESS",
  "VK_REGISTRY_ADDRESS",
];

const ZKEY_DIR = process.env.ZKEY_DIR || "/app/zkeys";
const PROOF_DIR = process.env.PROOF_DIR || "/app/proofs";

const ZKEY_PROCESS = path.join(
  ZKEY_DIR,
  "ProcessMessagesNonQv_14-9-2-3/processmessagesnonqv_14-9-2-3.zkey"
);
const ZKEY_TALLY = path.join(
  ZKEY_DIR,
  "TallyVotesNonQv_14-5-3/tallyvotesnonqv_14-5-3.zkey"
);
const WASM_PROCESS = path.join(
  ZKEY_DIR,
  "ProcessMessagesNonQv_14-9-2-3/ProcessMessagesNonQv_14-9-2-3_js/ProcessMessagesNonQv_14-9-2-3.wasm"
);
const WASM_TALLY = path.join(
  ZKEY_DIR,
  "TallyVotesNonQv_14-5-3/TallyVotesNonQv_14-5-3_js/TallyVotesNonQv_14-5-3.wasm"
);
const RAPIDSNARK = "/usr/local/bin/rapidsnark"; // optional native prover; falls back to snarkjs

function check() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("Missing env: " + missing.join(", "));
    process.exit(1);
  }
  for (const f of [ZKEY_PROCESS, ZKEY_TALLY, WASM_PROCESS, WASM_TALLY]) {
    if (!fs.existsSync(f)) {
      console.error(`Missing artifact: ${f}`);
      process.exit(1);
    }
  }
}

function run(cmd, args, label) {
  console.log(`\n[${label}] $ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (res.status !== 0) {
    throw new Error(`[${label}] failed with exit ${res.status}`);
  }
}

function maciCli(args, label) {
  // maci-cli routes through Hardhat for signer resolution
  // (maci-contracts.getDefaultSigner -> hre.ethers.getSigners). We need a
  // hardhat.config.js in the cwd that defines a `base` network, plus
  // HARDHAT_NETWORK=base on the env so Hardhat picks it.
  const env = {
    ...process.env,
    PRIVATE_KEY: process.env.COORDINATOR_ETH_PRIV,
    HARDHAT_NETWORK: process.env.HARDHAT_NETWORK || "base",
  };
  console.log(`\n[${label}] $ HARDHAT_NETWORK=${env.HARDHAT_NETWORK} npx maci-cli ${args.join(" ")}`);
  const res = require("child_process").spawnSync(
    "npx",
    ["maci-cli", ...args],
    { stdio: "inherit", env, cwd: "/app" },
  );
  if (res.status !== 0) {
    throw new Error(`[${label}] failed with exit ${res.status}`);
  }
}

function main() {
  check();

  const pollId = process.argv[2];
  if (!pollId) {
    console.error("Usage: node scripts/finalize-poll.js <pollId>");
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  const proofDir = path.join(PROOF_DIR, `poll-${pollId}`);
  fs.mkdirSync(proofDir, { recursive: true });
  const tallyFile = path.join(proofDir, "tally.json");
  const lastRunFile = path.join(PROOF_DIR, "last-run.json");

  const writeStatus = (status, extra = {}) => {
    fs.writeFileSync(
      lastRunFile,
      JSON.stringify({ pollId, status, startedAt, finishedAt: new Date().toISOString(), ...extra }, null, 2)
    );
  };

  try {
    // mergeSignups + mergeMessages: signer comes from PRIVATE_KEY env via getSigner().
    maciCli(
      [
        "mergeSignups",
        "--maci-address", process.env.MACI_ADDRESS,
        "--poll-id", pollId,
        "--rpc-provider", process.env.BASE_RPC_URL,
      ],
      "mergeSignups"
    );

    maciCli(
      [
        "mergeMessages",
        "--maci-address", process.env.MACI_ADDRESS,
        "--poll-id", pollId,
        "--rpc-provider", process.env.BASE_RPC_URL,
      ],
      "mergeMessages"
    );

    // genProofs: --privkey is the COORDINATOR's MACI Babyjubjub key (decrypts ballots).
    // RPC flag is -p / --rpc-provider here (note: NOT -r like the others).
    maciCli(
      [
        "genProofs",
        "--privkey", process.env.COORDINATOR_PRIV,
        "--maci-address", process.env.MACI_ADDRESS,
        "--poll-id", pollId,
        "--rpc-provider", process.env.BASE_RPC_URL,
        "--process-zkey", ZKEY_PROCESS,
        "--process-wasm", WASM_PROCESS,
        "--tally-zkey", ZKEY_TALLY,
        "--tally-wasm", WASM_TALLY,
        "--tally-file", tallyFile,
        "--output", proofDir,
        "--use-quadratic-voting", "false",
      ],
      "genProofs"
    );

    maciCli(
      [
        "proveOnChain",
        "--maci-address", process.env.MACI_ADDRESS,
        "--poll-id", pollId,
        "--rpc-provider", process.env.BASE_RPC_URL,
        "--proof-dir", proofDir,
      ],
      "proveOnChain"
    );

    maciCli(
      [
        "verify",
        "--maci-address", process.env.MACI_ADDRESS,
        "--poll-id", pollId,
        "--rpc-provider", process.env.BASE_RPC_URL,
        "--tally-file", tallyFile,
      ],
      "verify"
    );

    writeStatus("succeeded", { tallyFile });
    console.log("\n✓ Finalization complete.");
  } catch (err) {
    writeStatus("failed", { error: String(err) });
    console.error(`\n✗ Finalization failed: ${err}`);
    process.exit(1);
  }
}

main();
