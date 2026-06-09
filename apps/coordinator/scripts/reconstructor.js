#!/usr/bin/env node
/**
 * Per-tally-session reconstruction process.
 *
 * Lifecycle:
 *   1. Healthcheck server spawns us as a child process: `node reconstructor.js`
 *      with env: SESSION_POLL_ID, SESSION_PORT, SESSION_TIMEOUT_MS
 *   2. We generate an ephemeral session keypair, look up the active key
 *      generation + the 5 shareholders from Supabase, and write a
 *      coordinator_sessions row + audit row.
 *   3. We open POST /submissions on a localhost-only socket. Each Attester's
 *      browser hits the public coordinator HTTP server, which proxies the
 *      submission to us. We verify the wallet signature + de-duplicate by
 *      (wallet, shareIndex).
 *   4. When `threshold` valid shares have arrived, we reconstruct the
 *      32-byte macisk secret in RAM (never written to disk), call
 *      runFinalize() from lib/finalize-helpers, then POST the proof bundle
 *      back to the parent process via the SESSION_RESULT_FIFO file.
 *   5. We zero the macisk buffer, write the final audit row, and exit(0).
 *      The parent kills the localhost socket on our exit.
 *
 * Critical: this script MUST NOT write the macisk to disk at any point.
 * The proof artifacts under proofDir (poll-<id> subdirs) are fine because
 * they don't contain the privkey — only the proven results.
 */

const path = require("path");
const fs = require("fs");
const http = require("http");
const { combine: sssCombine } = require("shamir-secret-sharing");

const { runFinalize } = require("./lib/finalize-helpers");
const supabase = require("./lib/supabase");
const {
  generateSessionKeypair,
  signManifest,
  buildManifestPayload,
  verifySubmissionSignature,
  bytesToBase64,
  base64ToBytes,
  submissionProofHash,
} = require("./lib/session-manifest");

const REQUIRED_ENV = [
  "COORDINATOR_ETH_PRIV",
  "BASE_RPC_URL",
  "MACI_ADDRESS",
  "COORDINATOR_SUPABASE_URL",
  "COORDINATOR_SUPABASE_SERVICE_KEY",
  "SESSION_POLL_ID",
  "SESSION_PORT",
];

function assertEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("[reconstructor] missing env: " + missing.join(", "));
    process.exit(1);
  }
}

async function fetchActiveGeneration(governorAddress) {
  const q = new URLSearchParams({
    select: "*",
    governor_address: `eq.${governorAddress.toLowerCase()}`,
    activated_at: "not.is.null",
    superseded_at: "is.null",
    order: "activated_at.desc",
    limit: "1",
  });
  const rows = await supabase.select("coordinator_key_generations", q.toString());
  if (!rows || rows.length === 0) {
    throw new Error(
      `no active key generation found for governor ${governorAddress}`,
    );
  }
  return rows[0];
}

async function fetchEncryptedShares(keyGenerationId) {
  const q = new URLSearchParams({
    select: "wallet_address,share_index,encrypted_share",
    key_generation_id: `eq.${keyGenerationId}`,
    order: "share_index.asc",
  });
  const rows = await supabase.select("coordinator_shares", q.toString());
  if (!rows) return [];
  return rows;
}

async function writeSessionRow({
  sessionId,
  keyGenerationId,
  governorAddress,
  pollId,
  reconstructorSessionPubkey,
  reconstructorSessionSignature,
  expiresAt,
}) {
  return supabase.insert("coordinator_sessions", {
    id: sessionId,
    key_generation_id: keyGenerationId,
    governor_address: governorAddress.toLowerCase(),
    poll_id: String(pollId),
    reconstructor_session_pubkey: bytesToHexLiteral(
      base64ToBytes(reconstructorSessionPubkey),
    ),
    reconstructor_session_signature: reconstructorSessionSignature,
    reconstructor_host: process.env.SESSION_HOST || null,
    expires_at: expiresAt,
    state: "open",
    submitted_shares_count: 0,
  });
}

function bytesToHexLiteral(bytes) {
  return (
    "\\x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function main() {
  assertEnv();

  const pollId = process.env.SESSION_POLL_ID;
  const port = Number(process.env.SESSION_PORT);
  const timeoutMs = Number(process.env.SESSION_TIMEOUT_MS || 4 * 60 * 60 * 1000);
  const governorAddress =
    process.env.GOVERNOR_ADDRESS || process.env.MACI_GOVERNOR_ADDRESS;
  if (!governorAddress) {
    console.error("[reconstructor] GOVERNOR_ADDRESS not set");
    process.exit(1);
  }

  const sessionId = require("node:crypto").randomUUID();
  console.log(
    `[reconstructor] sessionId=${sessionId} pollId=${pollId} port=${port}`,
  );

  const generation = await fetchActiveGeneration(governorAddress);
  console.log(
    `[reconstructor] active generation=${generation.id} threshold=${generation.threshold}/${generation.total_shares}`,
  );

  const encryptedShares = await fetchEncryptedShares(generation.id);
  if (encryptedShares.length !== generation.total_shares) {
    throw new Error(
      `expected ${generation.total_shares} encrypted shares, got ${encryptedShares.length}`,
    );
  }
  const attesterAllowlist = encryptedShares
    .map((r) => r.wallet_address.toLowerCase())
    .sort();

  const sessionKp = generateSessionKeypair();
  const sessionPubkeyBase64 = bytesToBase64(sessionKp.publicKey);
  const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

  const manifest = {
    sessionId,
    pollId: String(pollId),
    keyGenerationId: generation.id,
    governorAddress,
    sessionPubkeyBase64,
    attesterAllowlist,
    expiresAt,
  };
  const manifestSignature = signManifest(manifest, process.env.COORDINATOR_ETH_PRIV);

  // Sweep any orphaned `open` sessions for this poll → aborted BEFORE we
  // insert ours. The parent (healthcheck.js startReconstructorSession)
  // polls Supabase for "most recent open session for poll N" to wire up
  // activeSession.sessionRow. If a prior reconstructor died (e.g. a Fly
  // redeploy SIGINT) without closing its row, the orphan still reads as
  // state=open and the parent's poll wins it before our INSERT lands.
  // Marking the orphans aborted first guarantees the only `open` row the
  // parent can see is the one we're about to write.
  try {
    await supabase.update(
      "coordinator_sessions",
      `poll_id=eq.${String(pollId)}&state=eq.open`,
      {
        state: "aborted",
        completed_at: new Date().toISOString(),
      },
    );
  } catch (err) {
    console.warn(
      `[reconstructor] orphan-session sweep failed (continuing): ${err?.message ?? err}`,
    );
  }

  await writeSessionRow({
    sessionId,
    keyGenerationId: generation.id,
    governorAddress,
    pollId,
    reconstructorSessionPubkey: sessionPubkeyBase64,
    reconstructorSessionSignature: manifestSignature,
    expiresAt,
  });

  await supabase.audit({
    event_type: "session_opened",
    actor_wallet: null,
    target_id: sessionId,
    payload: { pollId: String(pollId), keyGenerationId: generation.id },
  });

  // In-memory share buffer. We DO NOT persist plaintext shares; only
  // submission proofs go to Supabase.
  const submittedShares = new Map(); // wallet -> { shareIndex, bytes }
  let reconstructed = false;
  let exitPending = false;

  const submitTimeoutHandle = setTimeout(async () => {
    if (reconstructed) return;
    console.warn(
      `[reconstructor] session ${sessionId} expired — fewer than ${generation.threshold} shares arrived`,
    );
    try {
      await supabase.update(
        "coordinator_sessions",
        `id=eq.${sessionId}`,
        { state: "expired", completed_at: new Date().toISOString() },
      );
      await supabase.audit({
        event_type: "session_expired",
        actor_wallet: null,
        target_id: sessionId,
        payload: {
          submitted: submittedShares.size,
          threshold: generation.threshold,
        },
      });
    } catch (err) {
      console.error("[reconstructor] failed to mark session expired", err);
    }
    process.exit(2);
  }, timeoutMs);

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/submissions") {
      res.writeHead(404);
      return res.end();
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        // 2MB sanity cap
        req.destroy();
      }
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const result = await handleSubmission(payload, {
          sessionId,
          generation,
          sessionPubkeyBase64,
          attesterAllowlist,
          submittedShares,
        });
        if (!result.ok) {
          res.writeHead(result.status || 400, {
            "Content-Type": "application/json",
          });
          return res.end(JSON.stringify({ error: result.error }));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            received: submittedShares.size,
            needed: generation.threshold,
          }),
        );

        if (submittedShares.size >= generation.threshold && !reconstructed) {
          reconstructed = true;
          // Reconstruct + finalize off the request handler so we can return 200
          // to the last submitter before doing the long ZK work.
          process.nextTick(() => doReconstructAndFinalize().catch(handleFatal));
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(
      `[reconstructor] listening on 127.0.0.1:${port} for share submissions`,
    );
  });

  async function doReconstructAndFinalize() {
    clearTimeout(submitTimeoutHandle);
    console.log(
      `[reconstructor] threshold met (${submittedShares.size}/${generation.threshold}) — reconstructing…`,
    );

    // sssCombine takes raw share Uint8Arrays.
    const shareBytes = Array.from(submittedShares.values()).map((s) => s.bytes);
    let secret;
    try {
      secret = await sssCombine(shareBytes);
    } catch (err) {
      handleFatal(new Error(`Shamir reconstruction failed: ${err}`));
      return;
    }
    if (secret.length !== 32) {
      handleFatal(
        new Error(`reconstructed secret wrong length: ${secret.length}`),
      );
      return;
    }

    const macisk =
      "macisk." +
      Array.from(secret)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    let tallyResult;
    try {
      tallyResult = await runFinalize({
        pollId,
        coordinatorPrivKey: macisk,
        proofDirRoot: process.env.PROOF_DIR || "/app/proofs",
      });
    } catch (err) {
      // Zero the buffer even on failure paths.
      zeroBuffer(secret);
      handleFatal(err);
      return;
    } finally {
      // Best effort: scrub the secret from RAM.
      zeroBuffer(secret);
    }

    try {
      await supabase.update(
        "coordinator_sessions",
        `id=eq.${sessionId}`,
        {
          state: "completed",
          completed_at: new Date().toISOString(),
          submitted_shares_count: submittedShares.size,
          tally_tx_hash: null, // we don't have the tx hash from runFinalize easily; can be added if needed
        },
      );
      await supabase.audit({
        event_type: "session_completed",
        actor_wallet: null,
        target_id: sessionId,
        payload: {
          pollId: String(pollId),
          tallyFile: tallyResult.tallyFile,
          proofDir: tallyResult.proofDir,
        },
      });
    } catch (err) {
      console.error("[reconstructor] failed to mark session completed", err);
    }

    console.log("[reconstructor] tally finished, exiting cleanly.");
    exitPending = true;
    server.close();
    setTimeout(() => process.exit(0), 1000);
  }

  function handleFatal(err) {
    console.error("[reconstructor] fatal:", err);
    supabase
      .update("coordinator_sessions", `id=eq.${sessionId}`, {
        state: "aborted",
        completed_at: new Date().toISOString(),
      })
      .catch((e) =>
        console.error("[reconstructor] failed to mark aborted", e),
      )
      .finally(() => {
        supabase
          .audit({
            event_type: "session_aborted",
            actor_wallet: null,
            target_id: sessionId,
            payload: { error: String((err && err.stack) || err) },
          })
          .catch(() => undefined)
          .finally(() => process.exit(1));
      });
  }
}

async function handleSubmission(payload, ctx) {
  const { sessionPubkeyBase64Returned, walletAddress, shareIndex, signature, shareBytesBase64 } =
    payload;

  if (!walletAddress || !signature || !shareBytesBase64 || shareIndex == null) {
    return { ok: false, status: 400, error: "missing fields" };
  }
  if (sessionPubkeyBase64Returned !== ctx.sessionPubkeyBase64) {
    return { ok: false, status: 401, error: "session pubkey mismatch" };
  }
  if (!ctx.attesterAllowlist.includes(walletAddress.toLowerCase())) {
    return { ok: false, status: 403, error: "wallet not on allowlist" };
  }
  if (
    !verifySubmissionSignature({
      sessionPubkeyBase64: ctx.sessionPubkeyBase64,
      shareIndex,
      wallet: walletAddress,
      signature,
    })
  ) {
    return {
      ok: false,
      status: 401,
      error: "submission signature does not match wallet",
    };
  }

  const wallet = walletAddress.toLowerCase();
  if (ctx.submittedShares.has(wallet)) {
    return { ok: false, status: 409, error: "share already submitted" };
  }

  let bytes;
  try {
    bytes = base64ToBytes(shareBytesBase64);
  } catch {
    return { ok: false, status: 400, error: "invalid share bytes" };
  }

  ctx.submittedShares.set(wallet, { shareIndex, bytes });

  // Record submission proof (no plaintext) to Supabase.
  try {
    await supabase.insert("coordinator_session_submissions", {
      session_id: ctx.sessionId,
      wallet_address: wallet,
      submission_proof: submissionProofHash({
        sessionPubkeyBase64: ctx.sessionPubkeyBase64,
        shareIndex,
        wallet,
      }),
    });
    await supabase.update(
      "coordinator_sessions",
      `id=eq.${ctx.sessionId}`,
      { submitted_shares_count: ctx.submittedShares.size },
    );
    await supabase.audit({
      event_type: "share_submitted",
      actor_wallet: wallet,
      target_id: ctx.sessionId,
      payload: { shareIndex },
    });
  } catch (err) {
    console.error("[reconstructor] failed to record submission", err);
    // Don't reject the submission for an audit-log failure — the share is
    // already in memory and that's what matters for tally.
  }

  return { ok: true };
}

function zeroBuffer(buf) {
  if (!buf || typeof buf.fill !== "function") return;
  try {
    buf.fill(0);
  } catch {
    /* no-op */
  }
}

main().catch((err) => {
  console.error("[reconstructor] startup failed", err);
  process.exit(1);
});
