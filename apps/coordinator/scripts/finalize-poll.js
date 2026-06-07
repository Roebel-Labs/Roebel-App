#!/usr/bin/env node
/**
 * Legacy single-machine finalize CLI.
 *
 * Still here as an emergency manual tallying path, but the main flow is now
 * the Shamir reconstructor (scripts/reconstructor.js). This shim is a thin
 * wrapper around lib/finalize-helpers.runFinalize() that reads the legacy
 * COORDINATOR_PRIV env var. Once M3 ships and the Shamir flow has tallied a
 * poll end-to-end, `fly secrets unset COORDINATOR_PRIV` removes the env-based
 * privkey and breaks this CLI on purpose — that's the marker that the
 * privacy-from-coordinator gap is actually closed.
 *
 * Run:
 *   node scripts/finalize-poll.js <pollId>
 */

const fs = require("fs");
const path = require("path");
const { runFinalize } = require("./lib/finalize-helpers");

const PROOF_DIR = process.env.PROOF_DIR || "/app/proofs";

async function main() {
  const pollId = process.argv[2];
  if (!pollId) {
    console.error("Usage: node scripts/finalize-poll.js <pollId>");
    process.exit(1);
  }

  const coordinatorPrivKey = process.env.COORDINATOR_PRIV;
  if (!coordinatorPrivKey) {
    console.error(
      "COORDINATOR_PRIV not set. This CLI is the legacy single-machine path " +
        "and only works while the env-based privkey is still configured. After " +
        "the first Shamir tally has run, this should be removed (the new flow " +
        "goes through scripts/reconstructor.js).",
    );
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  const lastRunFile = path.join(PROOF_DIR, "last-run.json");
  const writeStatus = (status, extra = {}) => {
    fs.writeFileSync(
      lastRunFile,
      JSON.stringify(
        { pollId, status, startedAt, finishedAt: new Date().toISOString(), ...extra },
        null,
        2,
      ),
    );
  };

  try {
    const result = await runFinalize({
      pollId,
      coordinatorPrivKey,
      proofDirRoot: PROOF_DIR,
    });
    writeStatus("succeeded", { tallyFile: result.tallyFile });
    console.log("\n✓ Finalization complete.");
  } catch (err) {
    writeStatus("failed", { error: String((err && err.stack) || err) });
    console.error(`\n✗ Finalization failed: ${err}`);
    process.exit(1);
  }
}

main();
