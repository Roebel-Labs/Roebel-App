#!/usr/bin/env node
/**
 * Walk every poll on the MACI core, find ones whose voting deadline has
 * passed but whose Tally hasn't been submitted yet, and run finalize-poll.js
 * for each. Idempotent: safe to invoke from a cron without locking.
 *
 *   node scripts/scan-and-finalize.js
 *
 * Triggers (in order of expected use):
 *   1. POST /finalize-pending on the healthcheck server (driven by an
 *      external cron — see .github/workflows/finalize-cron.yml).
 *   2. Manual one-off via fly ssh.
 *
 * A poll qualifies for finalization when:
 *   - block.timestamp >= poll.deployTime + poll.duration   (voting closed)
 *   - Tally(poll.tally).isTallied() === false              (not yet proven)
 *
 * The grace-window check is left to the Governor's `tallyGracePeriod`. We
 * still try to finalize after that, since the grace window only gates
 * `state() == Defeated/Succeeded` resolution — the Tally itself can land
 * later and the front-end will display it. The Governor just won't
 * automatically transition to Succeeded if proven late.
 */

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { ethers } = require("ethers");

const REQUIRED_ENV = ["BASE_RPC_URL", "MACI_ADDRESS", "COORDINATOR_ETH_PRIV"];
const PROOF_DIR = process.env.PROOF_DIR || "/app/proofs";

function check() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("Missing env: " + missing.join(", "));
    process.exit(1);
  }
}

function buildProvider() {
  return new ethers.JsonRpcProvider(process.env.BASE_RPC_URL, undefined, { batchMaxCount: 1 });
}

const MACI_ABI = [
  "function nextPollId() view returns (uint256)",
  "function polls(uint256) view returns (address poll, address messageProcessor, address tally)",
];
const POLL_ABI = [
  "function getDeployTimeAndDuration() view returns (uint256, uint256)",
  "function stateMerged() view returns (bool)",
  "function treeDepths() view returns (uint8 intStateTreeDepth, uint8 messageTreeSubDepth, uint8 messageTreeDepth, uint8 voteOptionTreeDepth)",
];
const TALLY_ABI = [
  "function isTallied() view returns (bool)",
];

// Must match the production zKey we have mounted (ProcessMessagesNonQv_14-9-2-3
// → messageBatchTreeDepth=2). Polls whose on-chain treeDepths.messageTreeSubDepth
// differs cannot be tallied with the available circuits and are skipped — see
// the 2026-05-08 root-cause writeup in the commit log.
const REQUIRED_MSG_TREE_SUB_DEPTH = 2;

async function listPendingPolls(provider) {
  const maci = new ethers.Contract(process.env.MACI_ADDRESS, MACI_ABI, provider);
  const next = Number(await maci.nextPollId());
  const now = Math.floor(Date.now() / 1000);
  const result = [];
  const skipped = [];
  for (let i = 0; i < next; i++) {
    const polls = await maci.polls(i);
    const pollAddr = polls.poll || polls[0];
    const tallyAddr = polls.tally || polls[2];
    if (!pollAddr || pollAddr === ethers.ZeroAddress) continue;
    try {
      const poll = new ethers.Contract(pollAddr, POLL_ABI, provider);
      const tally = new ethers.Contract(tallyAddr, TALLY_ABI, provider);
      const td = await poll.treeDepths();
      const subDepth = Number(td[1]); // messageTreeSubDepth
      if (subDepth !== REQUIRED_MSG_TREE_SUB_DEPTH) {
        skipped.push({ pollId: i, reason: `messageTreeSubDepth=${subDepth} (need ${REQUIRED_MSG_TREE_SUB_DEPTH})` });
        continue;
      }
      const dd = await poll.getDeployTimeAndDuration();
      const end = Number(dd[0]) + Number(dd[1]);
      if (now < end) continue;
      const tallied = await tally.isTallied();
      if (tallied) continue;
      result.push({ pollId: i, pollAddr, tallyAddr, deadline: end });
    } catch (err) {
      console.warn(`[scan] poll ${i}: skipped (${err.message})`);
      skipped.push({ pollId: i, reason: err.message });
    }
  }
  if (skipped.length > 0) {
    console.log(`[scan] skipping unrecoverable polls:`, skipped);
  }
  return result;
}

function finalizePoll(pollId) {
  const finalize = path.join(__dirname, "finalize-poll.js");
  const res = spawnSync("node", [finalize, String(pollId)], {
    stdio: "inherit",
    env: process.env,
  });
  return res.status === 0;
}

async function main() {
  check();
  const provider = buildProvider();
  const startedAt = new Date().toISOString();
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  const scanFile = path.join(PROOF_DIR, "last-scan.json");

  const writeScan = (extra) => {
    fs.writeFileSync(
      scanFile,
      JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...extra }, null, 2),
    );
  };

  let pending;
  try {
    pending = await listPendingPolls(provider);
  } catch (err) {
    writeScan({ status: "scan-failed", error: String(err) });
    console.error("[scan] failed:", err.message);
    process.exit(1);
  }

  if (pending.length === 0) {
    writeScan({ status: "noop", pendingCount: 0 });
    console.log("[scan] nothing to finalize");
    return;
  }

  console.log(`[scan] ${pending.length} pending poll(s):`, pending.map((p) => p.pollId).join(", "));
  const finalized = [];
  const failed = [];
  for (const p of pending) {
    console.log(`\n[scan] finalizing poll ${p.pollId} (tally=${p.tallyAddr})…`);
    const ok = finalizePoll(p.pollId);
    if (ok) finalized.push(p);
    else failed.push(p);
  }

  writeScan({
    status: failed.length === 0 ? "succeeded" : "partial",
    pendingCount: pending.length,
    finalizedCount: finalized.length,
    failedCount: failed.length,
    finalized: finalized.map((p) => ({ pollId: p.pollId, tally: p.tallyAddr })),
    failed: failed.map((p) => ({ pollId: p.pollId, tally: p.tallyAddr })),
  });

  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[scan] fatal:", err);
  process.exit(1);
});
