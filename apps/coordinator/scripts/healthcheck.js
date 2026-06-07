// HTTP server for the coordinator machine.
//
// Routes:
//   GET  /healthz                  — Fly liveness probe.
//   GET  /status                   — last finalize run + last scan + pending pollIds.
//                                    Read-only, no auth.
//   POST /finalize-pending         — kicks scan-and-finalize.js as a child process.
//                                    Auth via X-Finalize-Token (FINALIZE_TOKEN secret).
//                                    Now delegates to /sessions per pending poll
//                                    instead of running finalize-poll.js directly.
//
//   POST /sessions                 — open a new tally session for `pollId`.
//                                    Spawns scripts/reconstructor.js as a child
//                                    process and returns the local listening port
//                                    + Supabase session row. Auth via
//                                    X-Finalize-Token.
//   POST /sessions/:id/submissions — proxy a share submission to the active
//                                    reconstructor's localhost socket. Open to
//                                    public — auth is per-share via wallet sig.
//   GET  /sessions/:id             — return the current session row (proxied
//                                    from the Supabase row written by the
//                                    reconstructor — not from this server's RAM).
//
// New env (in addition to existing):
//   COORDINATOR_SUPABASE_URL
//   COORDINATOR_SUPABASE_SERVICE_KEY
//   GOVERNOR_ADDRESS               — for reconstructor's active-generation lookup

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const supabase = require("./lib/supabase");

const PORT = Number(process.env.PORT || 8080);
const PROOF_DIR = process.env.PROOF_DIR || "/app/proofs";
const FINALIZE_TOKEN = process.env.FINALIZE_TOKEN || "";

// One persistent in-flight session at a time. Once we want concurrent tallies
// (different polls) we promote this to a Map<pollId, session>.
let scanInFlight = false;
let activeSession = null; // { pollId, port, child, startedAt, sessionRow }

function readJsonSafe(filename) {
  const p = path.join(PROOF_DIR, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function jsonResponse(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function deny(res, code, msg) {
  jsonResponse(res, code, { error: msg });
}

function pickEphemeralPort() {
  // 49152-65535 ephemeral range; randomize to avoid collisions if multiple
  // reconstructors ever overlap.
  return 49152 + Math.floor(Math.random() * 16000);
}

function startScan() {
  if (scanInFlight) return false;
  scanInFlight = true;
  const child = spawn("node", [path.join(__dirname, "scan-and-finalize.js")], {
    stdio: "inherit",
    env: process.env,
    detached: false,
  });
  child.on("exit", (code) => {
    console.log(`[finalize-pending] scan exited with ${code}`);
    scanInFlight = false;
  });
  return true;
}

async function startReconstructorSession({ pollId, timeoutMs }) {
  if (activeSession && !activeSession.child.killed) {
    return {
      ok: false,
      status: 409,
      error: `session already running for poll ${activeSession.pollId}`,
    };
  }
  const port = pickEphemeralPort();
  const child = spawn(
    "node",
    [path.join(__dirname, "reconstructor.js")],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        SESSION_POLL_ID: String(pollId),
        SESSION_PORT: String(port),
        SESSION_TIMEOUT_MS: String(timeoutMs || 4 * 60 * 60 * 1000),
        SESSION_HOST:
          process.env.PUBLIC_HOST ||
          "https://roebel-maci-coordinator.fly.dev",
      },
      detached: false,
    },
  );
  activeSession = {
    pollId,
    port,
    child,
    startedAt: new Date().toISOString(),
    sessionRow: null,
  };
  let childExited = false;
  let childExitCode = null;
  child.on("exit", (code) => {
    console.log(
      `[sessions] reconstructor for poll ${pollId} exited with code ${code}`,
    );
    childExited = true;
    childExitCode = code;
    activeSession = null;
  });

  // Poll Supabase for the session row the child writes during boot, so the
  // API can return the session id immediately. Bail out early if the child
  // crashes (e.g. no active key generation, missing env, etc.) so we don't
  // dereference a null activeSession.
  const rowPollDeadline = Date.now() + 15000;
  let sessionRow = null;
  while (Date.now() < rowPollDeadline && !sessionRow && !childExited) {
    try {
      const q = new URLSearchParams({
        select: "*",
        poll_id: `eq.${pollId}`,
        state: "eq.open",
        order: "created_at.desc",
        limit: "1",
      });
      const rows = await supabase.select("coordinator_sessions", q.toString());
      if (rows && rows.length > 0) {
        sessionRow = rows[0];
        break;
      }
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (childExited) {
    return {
      ok: false,
      status: 500,
      error: `reconstructor exited during startup with code ${childExitCode}`,
    };
  }
  if (activeSession) {
    activeSession.sessionRow = sessionRow;
  }
  return { ok: true, session: sessionRow, port };
}

function forwardSubmissionToReconstructor(req, res, sessionId) {
  if (!activeSession || activeSession.sessionRow?.id !== sessionId) {
    return deny(res, 410, "session not active on this machine");
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 2_000_000) req.destroy();
  });
  req.on("end", () => {
    const fwReq = http.request(
      {
        hostname: "127.0.0.1",
        port: activeSession.port,
        path: "/submissions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (fwRes) => {
        res.writeHead(fwRes.statusCode || 502, fwRes.headers);
        fwRes.pipe(res);
      },
    );
    fwReq.on("error", (err) => {
      console.error("[sessions/:id/submissions] forward failed", err);
      deny(res, 502, "reconstructor unreachable");
    });
    fwReq.write(body);
    fwReq.end();
  });
}

async function lookupSessionFromSupabase(sessionId) {
  const q = new URLSearchParams({
    select: "*",
    id: `eq.${sessionId}`,
    limit: "1",
  });
  const rows = await supabase.select("coordinator_sessions", q.toString());
  return rows && rows[0] ? rows[0] : null;
}

const server = http.createServer((req, res) => {
  // Strip query string for routing.
  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }

  if (req.method === "GET" && url === "/status") {
    return jsonResponse(res, 200, {
      ready: true,
      scanInFlight,
      activeSession: activeSession
        ? {
            pollId: activeSession.pollId,
            startedAt: activeSession.startedAt,
            sessionId: activeSession.sessionRow?.id ?? null,
          }
        : null,
      lastRun: readJsonSafe("last-run.json"),
      lastScan: readJsonSafe("last-scan.json"),
    });
  }

  if (req.method === "POST" && url === "/finalize-pending") {
    const supplied = req.headers["x-finalize-token"];
    if (!FINALIZE_TOKEN) return deny(res, 503, "FINALIZE_TOKEN not configured");
    if (supplied !== FINALIZE_TOKEN) return deny(res, 401, "invalid token");
    if (scanInFlight) {
      return jsonResponse(res, 202, { accepted: false, reason: "scan already running" });
    }
    startScan();
    return jsonResponse(res, 202, { accepted: true, startedAt: new Date().toISOString() });
  }

  if (req.method === "POST" && url === "/sessions") {
    const supplied = req.headers["x-finalize-token"];
    if (!FINALIZE_TOKEN) return deny(res, 503, "FINALIZE_TOKEN not configured");
    if (supplied !== FINALIZE_TOKEN) return deny(res, 401, "invalid token");

    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 100_000) req.destroy();
    });
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return deny(res, 400, "invalid json");
      }
      const { pollId, timeoutMs } = payload || {};
      if (!pollId) return deny(res, 400, "missing pollId");

      try {
        const result = await startReconstructorSession({ pollId, timeoutMs });
        if (!result.ok) return deny(res, result.status || 500, result.error);
        return jsonResponse(res, 202, {
          accepted: true,
          session: result.session,
        });
      } catch (err) {
        console.error("[sessions] start failed", err);
        return deny(res, 500, String(err));
      }
    });
    return;
  }

  const submitMatch = req.url.match(/^\/sessions\/([0-9a-f-]+)\/submissions$/i);
  if (req.method === "POST" && submitMatch) {
    return forwardSubmissionToReconstructor(req, res, submitMatch[1]);
  }

  const getMatch = req.url.match(/^\/sessions\/([0-9a-f-]+)$/i);
  if (req.method === "GET" && getMatch) {
    lookupSessionFromSupabase(getMatch[1])
      .then((row) => {
        if (!row) return deny(res, 404, "session not found");
        return jsonResponse(res, 200, row);
      })
      .catch((err) => {
        console.error("[sessions GET] supabase failed", err);
        return deny(res, 500, String(err));
      });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`coordinator healthcheck listening on :${PORT}`);
  if (!FINALIZE_TOKEN) {
    console.warn(
      "WARNING: FINALIZE_TOKEN unset — POST /finalize-pending and POST /sessions will reject.",
    );
  }
});
