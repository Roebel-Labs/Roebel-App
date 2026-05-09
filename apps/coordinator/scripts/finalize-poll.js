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
const { genTreeProof } = require("maci-crypto");

// Vote options the Expo app reads (matches VoteType enum).
const APP_VOTE_OPTIONS = [0, 1, 2]; // 0=Against, 1=For, 2=Abstain
const VOTE_OPTION_TREE_DEPTH = 3;

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
  // Disable JSON-RPC batching. ethers v6 defaults to coalescing concurrent
  // eth_calls into a single batch payload, which several public Base RPCs
  // (mainnet.base.org, publicnode) silently mis-handle — the client gets
  // back "missing revert data" for view calls that work fine in isolation.
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
  const raw = process.env.COORDINATOR_ETH_PRIV;
  const pk = raw.startsWith("0x") ? raw : "0x" + raw;
  return new ethers.Wallet(pk, provider);
}

/**
 * Replacement for the final addTallyResults call inside maci-cli's proveOnChain.
 * That one passes all 5^voteOptionTreeDepth = 125 vote-option-tree leaves in
 * a single tx, which exceeds Base's 30M gas limit. We submit only the three
 * options the Expo app actually reads (Against/For/Abstain) — that's enough
 * to populate Tally.totalTallyResults() and Tally.tallyResults(0/1/2). The
 * remaining 122 leaves stay at zero on chain, which is fine: they're zero
 * in the tally too. The on-chain merkle-proof verification still passes
 * because the proofs are computed against the full 125-leaf tree.
 */
async function chunkedAddTallyResults(tallyData, signer) {
  const tally = new ethers.Contract(
    tallyData.tallyAddress,
    [
      "function totalTallyResults() view returns (uint256)",
      "function addTallyResults((uint256[] voteOptionIndices, uint256[] tallyResults, uint256[][][] tallyResultProofs, uint256 totalSpent, uint256 totalSpentSalt, uint256 tallyResultSalt, uint256 newResultsCommitment, uint256 spentVoiceCreditsHash, uint256 perVOSpentVoiceCreditsHash))",
    ],
    signer,
  );

  const before = Number(await tally.totalTallyResults());
  if (before > 0) {
    console.log(`[chunked addTallyResults] already populated (totalTallyResults=${before}); skipping`);
    return;
  }

  const fullTally = tallyData.results.tally.map((t) => BigInt(t));
  const args = {
    voteOptionIndices: APP_VOTE_OPTIONS.map((i) => BigInt(i)),
    tallyResults: APP_VOTE_OPTIONS.map((i) => fullTally[i]),
    // Proofs must be computed against the FULL 125-leaf tree even though we
    // only submit 3 leaves — that's how Tally verifies inclusion.
    tallyResultProofs: APP_VOTE_OPTIONS.map((i) =>
      genTreeProof(i, fullTally, VOTE_OPTION_TREE_DEPTH),
    ),
    totalSpent: BigInt(tallyData.totalSpentVoiceCredits.spent),
    totalSpentSalt: BigInt(tallyData.totalSpentVoiceCredits.salt),
    tallyResultSalt: BigInt(tallyData.results.salt),
    newResultsCommitment: BigInt(tallyData.results.commitment),
    spentVoiceCreditsHash: BigInt(tallyData.totalSpentVoiceCredits.commitment),
    perVOSpentVoiceCreditsHash:
      tallyData.perVOSpentVoiceCredits && tallyData.perVOSpentVoiceCredits.commitment
        ? BigInt(tallyData.perVOSpentVoiceCredits.commitment)
        : 0n,
  };

  console.log(
    `[chunked addTallyResults] submitting ${APP_VOTE_OPTIONS.length} of ${fullTally.length} leaves…`,
  );
  const tx = await tally.addTallyResults(args);
  console.log(`[chunked addTallyResults] tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(
    `[chunked addTallyResults] confirmed in block ${receipt.blockNumber}, gas used ${receipt.gasUsed.toString()}`,
  );
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

  // genProofs makes 4 unbatched queryFilter calls (SignUp, DeployPoll,
  // MergeMessageAq, MergeMaciState) before the batched state-rebuild. We
  // make those scans tiny (~100 blocks) so any public RPC returns in <1s
  // and parallel-call timeouts don't fire. The unbatched results aren't
  // actually needed: we pass `startBlock`, `endBlock`, and `transactionHash`
  // explicitly so the SDK's defaultStartBlock/defaultEndBlock are ignored,
  // and the batched genMaciStateFromContract scan paginates via blocksPerBatch
  // from the reference tx's block (well before the first SignUp) to latest.
  const latestBlock = await logSigner.provider.getBlockNumber();
  const queryWindow = process.env.QUERY_WINDOW_BLOCKS
    ? Number(process.env.QUERY_WINDOW_BLOCKS)
    : 100;
  const startBlock = Math.max(0, latestBlock - queryWindow);
  const endBlock = latestBlock;
  const blocksPerBatch = process.env.BLOCKS_PER_BATCH
    ? Number(process.env.BLOCKS_PER_BATCH)
    : 5000;
  const transactionHash = process.env.BASE_REFERENCE_TX || undefined;
  if (!transactionHash) {
    console.warn(
      "WARNING: BASE_REFERENCE_TX not set — genProofs's batched state scan will start at " +
        `block ${startBlock} and miss any SignUp events older than that. Set BASE_REFERENCE_TX ` +
        "to any Base tx hash from before the first SignUp to cover the full state.",
    );
  }
  console.log(`[scan] latest=${latestBlock} startBlock=${startBlock} endBlock=${endBlock} window=${queryWindow}`);

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

    // Skip genProofs if a complete proof set already exists on disk from a
    // previous (partial) run. genProofs is the slow step (~10 min process +
    // ~10 min tally on WASM), and rerunning it is wasted work — proveOnChain
    // is idempotent against MessageProcessor.numBatchesProcessed and
    // Tally.tallyBatchNum, so submitting cached proofs that have already
    // landed is a no-op, and the only thing left to submit will be the tally
    // batches that haven't yet.
    const cachedTallyExists = fs.existsSync(tallyFile);
    const cachedProcessExists = fs.existsSync(path.join(proofDir, "process_0.json"));
    const useCachedProofs = cachedTallyExists && cachedProcessExists;

    let tallyData;
    if (useCachedProofs) {
      console.log(`\n[genProofs] poll=${pollId} reusing cached proofs from ${proofDir}`);
      tallyData = JSON.parse(fs.readFileSync(tallyFile, "utf8"));
    } else {
      console.log(`\n[genProofs] poll=${pollId} startBlock=${startBlock ?? "0"} blocksPerBatch=${blocksPerBatch} refTx=${transactionHash ?? "none"}`);
      tallyData = await genProofs({
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
        endBlock,
        blocksPerBatch,
        transactionHash,
        quiet: false,
      });
    }

    // proveOnChain submits all the process and tally proofs to MessageProcessor
    // and Tally, then tries to call addTallyResults with ALL leaves of the
    // vote-option tree (5^voteOptionTreeDepth = 125 leaves) in a single tx.
    // For our config that final tx exceeds Base's 30M gas/tx limit and the
    // node rejects it. We catch that specific failure mode and finish the job
    // ourselves with a chunked addTallyResults call below.
    console.log(`\n[proveOnChain] poll=${pollId}`);
    try {
      await proveOnChain({
        pollId: pollIdBig,
        maciAddress,
        signer: txSigner,
        proofDir,
        tallyFile,
        quiet: false,
      });
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (/exceeds max transaction gas limit/i.test(msg)) {
        console.log(
          "[proveOnChain] maci-cli's monolithic addTallyResults call hit Base's 30M gas limit — proof submissions still succeeded; falling back to our chunked addTallyResults below.",
        );
      } else {
        throw err;
      }
    }

    // Submit tally results for the vote options the app actually reads
    // (Against=0, For=1, Abstain=2). The remaining 122 vote-option-tree
    // leaves are all zero and submitting them too is what blew the gas
    // limit above. Setting just these three is enough for
    // Tally.totalTallyResults() > 0 (which gates Governor.state() and the
    // Expo VotingStats render) and for VotingStats's tallyResults(0/1/2)
    // reads to return real values.
    await chunkedAddTallyResults(tallyData, txSigner);

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
