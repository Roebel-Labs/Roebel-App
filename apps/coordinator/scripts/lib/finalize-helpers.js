// Shared MACI v2 finalization helpers used by:
//   - scripts/finalize-poll.js (thin CLI shim, legacy single-machine path)
//   - scripts/reconstructor.js (per-tally-session, accepts a reconstructed
//                                Shamir privkey rather than reading env)
//
// All functions take the coordinator macisk as an explicit argument so the
// privkey can live in a forked process's RAM instead of an env var.

const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");
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

const ZKEY_DIR = process.env.ZKEY_DIR || "/app/zkeys";
const ZKEY_PROCESS = path.join(
  ZKEY_DIR,
  "ProcessMessagesNonQv_14-9-2-3/processmessagesnonqv_14-9-2-3.zkey",
);
const ZKEY_TALLY = path.join(
  ZKEY_DIR,
  "TallyVotesNonQv_14-5-3/tallyvotesnonqv_14-5-3.zkey",
);
const WASM_PROCESS = path.join(
  ZKEY_DIR,
  "ProcessMessagesNonQv_14-9-2-3/ProcessMessagesNonQv_14-9-2-3_js/ProcessMessagesNonQv_14-9-2-3.wasm",
);
const WASM_TALLY = path.join(
  ZKEY_DIR,
  "TallyVotesNonQv_14-5-3/TallyVotesNonQv_14-5-3_js/TallyVotesNonQv_14-5-3.wasm",
);

const REQUIRED_ENV_BASE = ["COORDINATOR_ETH_PRIV", "BASE_RPC_URL", "MACI_ADDRESS"];

function buildSigner(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
  const raw = process.env.COORDINATOR_ETH_PRIV;
  const pk = raw.startsWith("0x") ? raw : "0x" + raw;
  return new ethers.Wallet(pk, provider);
}

function assertEnvAndArtifacts() {
  const missing = REQUIRED_ENV_BASE.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error("Missing env: " + missing.join(", "));
  }
  for (const f of [ZKEY_PROCESS, ZKEY_TALLY, WASM_PROCESS, WASM_TALLY]) {
    if (!fs.existsSync(f)) {
      throw new Error(`Missing artifact: ${f}`);
    }
  }
}

const tolerateAlreadyMerged = async (label, fn) => {
  try {
    await fn();
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/already been merged/i.test(msg)) {
      console.log(`[${label}] skipping — already merged on chain`);
      return;
    }
    throw err;
  }
};

/**
 * Replacement for the final addTallyResults call inside maci-cli's
 * proveOnChain. That one passes all 5^voteOptionTreeDepth = 125 vote-option-
 * tree leaves in a single tx, which exceeds Base's 30M gas/tx limit. We
 * submit only the three options the Expo app actually reads
 * (Against/For/Abstain). The remaining 122 leaves stay at zero on chain.
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
    console.log(
      `[chunked addTallyResults] already populated (totalTallyResults=${before}); skipping`,
    );
    return;
  }

  const fullTally = tallyData.results.tally.map((t) => BigInt(t));
  const args = {
    voteOptionIndices: APP_VOTE_OPTIONS.map((i) => BigInt(i)),
    tallyResults: APP_VOTE_OPTIONS.map((i) => fullTally[i]),
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

/**
 * Run the full finalize pipeline for one poll, taking the macisk privkey as
 * an argument rather than reading process.env.COORDINATOR_PRIV. Used by both
 * the legacy CLI (`finalize-poll.js`) and the new Shamir reconstructor.
 *
 * @param {object} opts
 * @param {string} opts.pollId               Poll ID as a decimal string.
 * @param {string} opts.coordinatorPrivKey   macisk.<…> Babyjubjub privkey.
 * @param {string} opts.proofDirRoot         Base dir for proofs (e.g. /app/proofs).
 * @returns {{ tallyFile: string, proofDir: string, tallyData: any }}
 */
async function runFinalize({ pollId, coordinatorPrivKey, proofDirRoot }) {
  assertEnvAndArtifacts();

  if (!pollId) throw new Error("pollId required");
  if (!coordinatorPrivKey) throw new Error("coordinatorPrivKey required");

  const PROOF_DIR = proofDirRoot || process.env.PROOF_DIR || "/app/proofs";
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  const proofDir = path.join(PROOF_DIR, `poll-${pollId}`);
  fs.mkdirSync(proofDir, { recursive: true });
  const tallyFile = path.join(proofDir, "tally.json");

  const txRpc = process.env.BASE_RPC_URL;
  const logRpc = process.env.BASE_ARCHIVE_RPC_URL || process.env.BASE_RPC_URL;
  const txSigner = buildSigner(txRpc);
  const logSigner = logRpc === txRpc ? txSigner : buildSigner(logRpc);
  const maciAddress = process.env.MACI_ADDRESS;
  const pollIdBig = BigInt(pollId);

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
      "WARNING: BASE_REFERENCE_TX not set — genProofs's batched state scan may miss old SignUp events.",
    );
  }
  console.log(
    `[scan] latest=${latestBlock} startBlock=${startBlock} endBlock=${endBlock} window=${queryWindow}`,
  );

  console.log(`\n[mergeSignups] poll=${pollId}`);
  await tolerateAlreadyMerged("mergeSignups", () =>
    mergeSignups({ pollId: pollIdBig, maciAddress, signer: txSigner, quiet: false }),
  );

  console.log(`\n[mergeMessages] poll=${pollId}`);
  await tolerateAlreadyMerged("mergeMessages", () =>
    mergeMessages({ pollId: pollIdBig, maciAddress, signer: txSigner, quiet: false }),
  );

  // Validate cached proofs against the CURRENT on-chain Poll address, not just
  // file existence. After a MACI rotation, the cached tally.json from the old
  // Poll contract would otherwise be reused and proveOnChain would die with
  // "pollEndTimestamp mismatch" mid-submission, leaving the run unfinishable
  // without a manual cache wipe.
  const cachedTallyExists = fs.existsSync(tallyFile);
  const cachedProcessExists = fs.existsSync(path.join(proofDir, "process_0.json"));
  let cacheMatchesCurrentMaci = false;
  if (cachedTallyExists && cachedProcessExists) {
    try {
      const cached = JSON.parse(fs.readFileSync(tallyFile, "utf8"));
      const cachedMaci = String(cached.maci || "").toLowerCase();
      const cachedPollAddr = String(cached.pollAddress || "").toLowerCase();
      const currentMaci = String(maciAddress).toLowerCase();
      const maciContract = new ethers.Contract(
        maciAddress,
        ["function polls(uint256) view returns (address poll, address messageProcessor, address tally)"],
        txSigner,
      );
      const polls = await maciContract.polls(pollIdBig);
      const currentPollAddr = String(polls.poll || polls[0]).toLowerCase();
      if (cachedMaci === currentMaci && cachedPollAddr === currentPollAddr) {
        cacheMatchesCurrentMaci = true;
      } else {
        console.log(
          `[cache] invalidating stale proofs (cached maci=${cachedMaci} poll=${cachedPollAddr}, current maci=${currentMaci} poll=${currentPollAddr})`,
        );
      }
    } catch (err) {
      console.warn("[cache] failed to validate cached tally; regenerating", err);
    }
  }
  const useCachedProofs = cacheMatchesCurrentMaci;

  let tallyData;
  if (useCachedProofs) {
    console.log(`\n[genProofs] poll=${pollId} reusing cached proofs from ${proofDir}`);
    tallyData = JSON.parse(fs.readFileSync(tallyFile, "utf8"));
  } else {
    console.log(
      `\n[genProofs] poll=${pollId} startBlock=${startBlock} blocksPerBatch=${blocksPerBatch} refTx=${transactionHash ?? "none"}`,
    );
    tallyData = await genProofs({
      pollId: pollIdBig,
      maciAddress,
      signer: logSigner,
      coordinatorPrivKey,
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
    const msg = String((err && err.message) || err);
    // maci-cli's monolithic addTallyResults (5^voteOptionTreeDepth = 125 leaves)
    // can fail in several ways on Base: an explicit "exceeds max gas limit" if
    // the RPC computes a value before rejecting, or a silent "missing revert
    // data" / "could not coalesce" if it bails earlier in estimation. All three
    // shapes mean "the monolithic call did not land". Our chunked fallback below
    // is idempotent (skips when totalTallyResults > 0), so swallowing here is
    // safe in every "addTallyResults didn't land" case.
    const monolithicRejected =
      /exceeds max transaction gas limit/i.test(msg) ||
      /missing revert data/i.test(msg) ||
      /could not coalesce error/i.test(msg);
    if (monolithicRejected) {
      console.log(
        "[proveOnChain] maci-cli's monolithic addTallyResults call rejected — falling back to chunked addTallyResults.",
      );
    } else {
      throw err;
    }
  }

  await chunkedAddTallyResults(tallyData, txSigner);

  console.log(`\n[verify] poll=${pollId}`);
  await verify({
    pollId: pollIdBig,
    maciAddress,
    signer: logSigner,
    tallyData,
    quiet: false,
  });

  return { tallyFile, proofDir, tallyData };
}

module.exports = {
  runFinalize,
  chunkedAddTallyResults,
  tolerateAlreadyMerged,
  buildSigner,
  assertEnvAndArtifacts,
  APP_VOTE_OPTIONS,
  VOTE_OPTION_TREE_DEPTH,
  ZKEY_DIR,
  ZKEY_PROCESS,
  ZKEY_TALLY,
  WASM_PROCESS,
  WASM_TALLY,
};
