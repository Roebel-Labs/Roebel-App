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
 *   5. verify         — sanity-check the on-chain results match the local tally
 *
 * Run:
 *   node scripts/finalize-poll.js <pollId>
 *
 * We import maci-cli's SDK functions directly and inject an explicit
 * ethers.Wallet bound to BASE_RPC_URL, instead of routing through `npx maci-cli`
 * + Hardhat's getDefaultSigner(). The CLI path resolves hardhat.config.js from
 * its own package directory rather than cwd, which made HARDHAT_NETWORK=base
 * useless and stalled finalization at HH100.
 */

const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");
const { mergeSignups, mergeMessages, verify } = require("maci-cli/build/ts/sdk");
const { genProofs } = require("maci-cli/build/ts/commands/genProofs");
const { proveOnChain } = require("maci-cli/build/ts/commands/proveOnChain");

const REQUIRED_ENV = [
  "COORDINATOR_PRIV",
  "COORDINATOR_ETH_PRIV",
  "BASE_RPC_URL",
  "MACI_ADDRESS",
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

function buildSigner() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const raw = process.env.COORDINATOR_ETH_PRIV;
  const pk = raw.startsWith("0x") ? raw : "0x" + raw;
  return new ethers.Wallet(pk, provider);
}

async function main() {
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

  const signer = buildSigner();
  const maciAddress = process.env.MACI_ADDRESS;
  const pollIdBig = BigInt(pollId);

  try {
    console.log(`\n[mergeSignups] poll=${pollId}`);
    await mergeSignups({ pollId: pollIdBig, maciAddress, signer, quiet: false });

    console.log(`\n[mergeMessages] poll=${pollId}`);
    await mergeMessages({ pollId: pollIdBig, maciAddress, signer, quiet: false });

    console.log(`\n[genProofs] poll=${pollId}`);
    const tallyData = await genProofs({
      pollId: pollIdBig,
      maciAddress,
      signer,
      coordinatorPrivKey: process.env.COORDINATOR_PRIV,
      processZkey: ZKEY_PROCESS,
      tallyZkey: ZKEY_TALLY,
      processWasm: WASM_PROCESS,
      tallyWasm: WASM_TALLY,
      tallyFile,
      outputDir: proofDir,
      useWasm: true,
      useQuadraticVoting: false,
      quiet: false,
    });

    console.log(`\n[proveOnChain] poll=${pollId}`);
    await proveOnChain({
      pollId: pollIdBig,
      maciAddress,
      signer,
      proofDir,
      tallyFile,
      quiet: false,
    });

    console.log(`\n[verify] poll=${pollId}`);
    await verify({
      pollId: pollIdBig,
      maciAddress,
      signer,
      tallyData,
      quiet: false,
    });

    writeStatus("succeeded", { tallyFile });
    console.log("\n✓ Finalization complete.");
  } catch (err) {
    writeStatus("failed", { error: String(err && err.stack ? err.stack : err) });
    console.error(`\n✗ Finalization failed: ${err}`);
    process.exit(1);
  }
}

main();
