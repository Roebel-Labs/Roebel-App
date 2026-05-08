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
// `maci-cli` re-exports every command (mergeSignups, mergeMessages, genProofs,
// proveOnChain, verify, …) from its main entry. We use that rather than
// `maci-cli/sdk` because the SDK subpath only re-exports a subset (no
// genProofs/proveOnChain). Importing the main entry has a side effect of
// setting process.env.HARDHAT_CONFIG to maci-cli's bundled hardhat.config.js,
// but that's only consulted by getDefaultSigner() — which we never call,
// since each SDK function takes our explicit ethers.Wallet as `signer`.
const {
  mergeSignups,
  mergeMessages,
  genProofs,
  proveOnChain,
  verify,
} = require("maci-cli");

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

function buildSigner(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
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

  // Two RPC channels:
  //   BASE_RPC_URL          — used for transactions (merge*, proveOnChain).
  //                           Alchemy is fine here.
  //   BASE_ARCHIVE_RPC_URL  — used by genProofs for the SignUp+PublishMessage
  //                           log scan. Alchemy free tier caps eth_getLogs to
  //                           ~10 blocks per call, which would require ~5M
  //                           round-trips. Set this to a public archive node
  //                           (e.g. https://base-rpc.publicnode.com) so the
  //                           scan can use larger batches.
  const txRpc = process.env.BASE_RPC_URL;
  const logRpc = process.env.BASE_ARCHIVE_RPC_URL || process.env.BASE_RPC_URL;
  const txSigner = buildSigner(txRpc);
  const logSigner = logRpc === txRpc ? txSigner : buildSigner(logRpc);
  const maciAddress = process.env.MACI_ADDRESS;
  const pollIdBig = BigInt(pollId);

  // MACI deploy block — scanning the entire chain from genesis is slow even
  // on archive nodes. Pin to the deploy block to bound the range.
  const startBlock = process.env.MACI_DEPLOY_BLOCK
    ? Number(process.env.MACI_DEPLOY_BLOCK)
    : undefined;
  const blocksPerBatch = process.env.BLOCKS_PER_BATCH
    ? Number(process.env.BLOCKS_PER_BATCH)
    : 5000;

  // mergeSignups + mergeMessages each throw if the corresponding tree was
  // already merged (Poll.stateMerged() / Poll.mergedMessageAq()). That's a
  // re-run of an already-finalized step, not a real failure, so swallow it.
  const tolerateAlreadyMerged = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      const msg = String(err?.message || err);
      if (/already been merged/i.test(msg)) {
        console.log(`[${label}] skipping — already merged on chain`);
        return;
      }
      throw err;
    }
  };

  try {
    console.log(`\n[mergeSignups] poll=${pollId}`);
    await tolerateAlreadyMerged("mergeSignups", () =>
      mergeSignups({ pollId: pollIdBig, maciAddress, signer: txSigner, quiet: false }),
    );

    console.log(`\n[mergeMessages] poll=${pollId}`);
    await tolerateAlreadyMerged("mergeMessages", () =>
      mergeMessages({ pollId: pollIdBig, maciAddress, signer: txSigner, quiet: false }),
    );

    console.log(`\n[genProofs] poll=${pollId} startBlock=${startBlock ?? "0"} blocksPerBatch=${blocksPerBatch}`);
    const tallyData = await genProofs({
      pollId: pollIdBig,
      maciAddress,
      signer: logSigner,
      coordinatorPrivKey: process.env.COORDINATOR_PRIV,
      processZkey: ZKEY_PROCESS,
      tallyZkey: ZKEY_TALLY,
      processWasm: WASM_PROCESS,
      tallyWasm: WASM_TALLY,
      tallyFile,
      outputDir: proofDir,
      useWasm: true,
      useQuadraticVoting: false,
      startBlock,
      blocksPerBatch,
      quiet: false,
    });

    console.log(`\n[proveOnChain] poll=${pollId}`);
    await proveOnChain({
      pollId: pollIdBig,
      maciAddress,
      signer: txSigner,
      proofDir,
      tallyFile,
      quiet: false,
    });

    console.log(`\n[verify] poll=${pollId}`);
    await verify({
      pollId: pollIdBig,
      maciAddress,
      signer: logSigner,
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
